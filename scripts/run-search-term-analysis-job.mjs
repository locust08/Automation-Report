import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const [jobId, accountId, startDate, endDate] = process.argv.slice(2);
if (!jobId || !/^[-\w]+$/.test(jobId) || !/^\d{10}$/.test(accountId ?? "")) process.exit(2);

const root = process.cwd();
const jobsDirectory = path.join(root, "tmp", "search-term-analysis-jobs");
const statusPath = path.join(jobsDirectory, `${jobId}.json`);
const logPath = path.join(jobsDirectory, `${jobId}.log`);
const baselinePath = path.join(jobsDirectory, `${jobId}.baseline.json`);
const priorityPath = path.join(jobsDirectory, `${jobId}.priority.json`);
const startedAt = new Date().toISOString();

let currentStatus = {};

async function writeStatus(status) {
  currentStatus = { ...currentStatus, ...status, updatedAt: new Date().toISOString() };
  await fs.mkdir(jobsDirectory, { recursive: true });
  const temporaryPath = `${statusPath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify({ jobId, accountId, startedAt, ...currentStatus }, null, 2), "utf8");
  await fs.rename(temporaryPath, statusPath);
}

await writeStatus({ status: "running", stage: "Checking Google Ads and analyzing only newly discovered terms" });
const heartbeat = setInterval(() => {
  void (async()=>{const disk=JSON.parse(await fs.readFile(statusPath,"utf8").catch(()=>"{}"));await writeStatus({stage:disk.stage??currentStatus.stage,heartbeatAt:new Date().toISOString()});})();
}, 5_000);
const output = await fs.open(logPath, "a");
const runnerEnvironment = {
  ...process.env,
  GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID || "",
  GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET || "",
  GOOGLE_OAUTH_REFRESH_TOKEN: process.env.GOOGLE_OAUTH_REFRESH_TOKEN || process.env.GOOGLE_ADS_REFRESH_TOKEN || "",
};
const maximumJobMilliseconds = Number(process.env.SEARCH_TERM_ANALYSIS_TIMEOUT_MS || 20 * 60 * 1000);
const maxBatches = Math.max(1, Number(process.env.SEARCH_TERM_ANALYSIS_MAX_BATCHES || 10));
const termsPerBatch = Math.max(1, Number(process.env.SEARCH_TERM_MAX_NEW_TERMS_PER_JOB || 250));
let timedOut = false;
let exitCode = 0;
let combinedPlan = null;
let planPath = null;
let analyzedRows = [];
let baselineKeys = JSON.parse(await fs.readFile(baselinePath, "utf8").catch(() => "[]"));

await writeStatus({ stage: "Prioritizing terms by spend and impressions", currentBatch: 0, completedBatches: 0, maxBatches, currentBatchSize: 0, termsProcessed: 0 });
const priorityArgs = [
  "run", "--project", path.join(root, "lib", "search-term-optimization", "python"), "--group", "ads", "--group", "ads-agent",
  "python", path.join(root, "scripts", "order-search-term-candidates.py"), accountId, priorityPath,
];
if (startDate) priorityArgs.push("--start-date", startDate);
if (endDate) priorityArgs.push("--end-date", endDate);
const priorityChild = spawn("uv", priorityArgs, { cwd: root, env: runnerEnvironment, windowsHide: true, stdio: ["ignore", output.fd, output.fd] });
exitCode = await new Promise((resolve, reject) => { priorityChild.once("error", reject); priorityChild.once("exit", code => resolve(code ?? 1)); }).catch(() => 1);
const priorityKeys = exitCode === 0 ? JSON.parse(await fs.readFile(priorityPath, "utf8").catch(() => "[]")) : [];

for (let batch = 1; batch <= maxBatches; batch += 1) {
  if (exitCode !== 0) break;
  const completed = new Set(baselineKeys);
  const remainingPriorityKeys = priorityKeys.filter(key => !completed.has(key));
  const currentKeys = remainingPriorityKeys.slice(0, termsPerBatch);
  if (currentKeys.length === 0) break;
  const currentSet = new Set(currentKeys);
  const exclusions = [...new Set([...baselineKeys, ...priorityKeys.filter(key => !currentSet.has(key))])];
  await fs.writeFile(baselinePath, JSON.stringify(exclusions), "utf8");
  await writeStatus({ stage: `Run ${batch} of ${maxBatches} · analyzing ${currentKeys.length} terms`, batch, currentBatch: batch, completedBatches: batch - 1, maxBatches, currentBatchSize: currentKeys.length, termsProcessed: analyzedRows.length, queuedNewTerms: remainingPriorityKeys.length });
  const args = [
    "run",
    "--project", path.join(root, "lib", "search-term-optimization", "python"),
    "--group", "ads",
    "--group", "ads-agent",
    "python",
    path.join(root, ".agents", "skills", "google-ads-search-term-review-agent", "scripts", "run_search_term_review.py"),
    accountId,
    "--out-dir", path.join(root, "outputs"),
    "--tmp-dir", path.join(root, "tmp"),
    "--job-status-path", statusPath,
    "--exclude-term-keys-file", baselinePath,
    "--max-new-terms", String(termsPerBatch),
  ];
  if (startDate) args.push("--start-date", startDate);
  if (endDate) args.push("--end-date", endDate);
  const child = spawn("uv", args, { cwd: root, env: runnerEnvironment, windowsHide: true, stdio: ["ignore", output.fd, output.fd] });
  const timeout = setTimeout(() => { timedOut = true; child.kill(); }, maximumJobMilliseconds);
  exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  }).catch(async (error) => {
    await writeStatus({ status: "failed", stage: "Runner failed to start", error: error instanceof Error ? error.message : String(error), finishedAt: new Date().toISOString() });
    return 1;
  });
  clearTimeout(timeout);
  if (timedOut || exitCode !== 0) break;

  const prefix = `google_ads_search_term_review_agent_${accountId}_`;
  const candidates = await Promise.all((await fs.readdir(path.join(root, "tmp")))
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .map(async (name) => ({ path: path.join(root, "tmp", name), modified: (await fs.stat(path.join(root, "tmp", name))).mtimeMs })));
  planPath = candidates.sort((left, right) => right.modified - left.modified)[0]?.path ?? null;
  if (!planPath) { exitCode = 1; break; }
  const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
  if (!combinedPlan) combinedPlan = plan;
  analyzedRows.push(...(plan.allRows ?? []));

  const currentByIdentity = new Map((plan.currentSearchTerms ?? []).map((row) => [
    `${row.campaign_name}|${row.ad_group_name}|${String(row.search_term).trim().toLowerCase().replace(/\s+/g, " ")}`,
    `${row.campaign_id}|${row.ad_group_id}|${String(row.search_term).trim().toLowerCase().replace(/\s+/g, " ")}`,
  ]));
  for (const row of plan.allRows ?? []) {
    const identity = `${row.campaignName}|${row.adGroupName}|${String(row.searchTerm).trim().toLowerCase().replace(/\s+/g, " ")}`;
    const directKey = row.campaignId && row.adGroupId ? `${row.campaignId}|${row.adGroupId}|${String(row.searchTerm).trim().toLowerCase().replace(/\s+/g, " ")}` : null;
    const key = directKey ?? currentByIdentity.get(identity);
    if (key) baselineKeys.push(key);
  }
  baselineKeys = [...new Set(baselineKeys)];
  const queued = Math.max(0, remainingPriorityKeys.length - currentKeys.length);
  await writeStatus({ stage: queued > 0 ? `Completed run ${batch}; ${queued} terms remain` : `Completed run ${batch}; queue is empty`, batch, currentBatch: batch, completedBatches: batch, maxBatches, currentBatchSize: 0, termsProcessed: analyzedRows.length, queuedNewTerms: queued });
  if (queued === 0 || (plan.allRows ?? []).length === 0) break;
}

if (exitCode === 0 && combinedPlan && planPath) {
  combinedPlan.allRows = analyzedRows;
  combinedPlan.source = {
    ...combinedPlan.source,
    termsReviewed: analyzedRows.length,
    analyzedNewTerms: analyzedRows.length,
    newTerms: analyzedRows.length + Number(currentStatus.queuedNewTerms ?? 0),
    queuedNewTerms: Number(currentStatus.queuedNewTerms ?? 0),
  };
  await fs.writeFile(planPath, JSON.stringify(combinedPlan, null, 2), "utf8");
}
clearInterval(heartbeat);
await output.close();

if (timedOut) {
  await writeStatus({ status: "failed", stage: "Analysis timed out", error: `Analysis exceeded ${Math.round(maximumJobMilliseconds / 60000)} minutes. The previous saved analysis was kept.`, finishedAt: new Date().toISOString() });
} else if (exitCode === 0) {
  await writeStatus({ status: "completed", stage: `Completed after ${currentStatus.completedBatches ?? 0} runs · ${analyzedRows.length} terms analyzed`, completedBatches: currentStatus.completedBatches ?? 0, termsProcessed: analyzedRows.length, progressComplete: true, finishedAt: new Date().toISOString() });
} else {
  const log = await fs.readFile(logPath, "utf8").catch(() => "");
  await writeStatus({
    status: "failed",
    stage: "Analysis failed",
    error: log.trim().split(/\r?\n/).slice(-12).join("\n") || `Runner exited with code ${exitCode}`,
    finishedAt: new Date().toISOString(),
  });
}

await fs.unlink(baselinePath).catch(() => undefined);
await fs.unlink(priorityPath).catch(() => undefined);
