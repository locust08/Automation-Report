import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const [jobId, accountId] = process.argv.slice(2);
if (!jobId || !/^[-\w]+$/.test(jobId) || !/^\d{10}$/.test(accountId ?? "")) process.exit(2);

const root = process.cwd();
const jobsDirectory = path.join(root, "tmp", "search-term-analysis-jobs");
const statusPath = path.join(jobsDirectory, `${jobId}.json`);
const logPath = path.join(jobsDirectory, `${jobId}.log`);
const startedAt = new Date().toISOString();

let currentStatus = {};

async function writeStatus(status) {
  currentStatus = { ...currentStatus, ...status, updatedAt: new Date().toISOString() };
  await fs.mkdir(jobsDirectory, { recursive: true });
  const temporaryPath = `${statusPath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify({ jobId, accountId, startedAt, ...currentStatus }, null, 2), "utf8");
  await fs.rename(temporaryPath, statusPath);
}

await writeStatus({ status: "running", stage: "Running Google retrieval, website crawl, and AI review" });
const heartbeat = setInterval(() => {
  void writeStatus({ heartbeatAt: new Date().toISOString() });
}, 5_000);
const output = await fs.open(logPath, "a");
const runnerEnvironment = {
  ...process.env,
  GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID || "",
  GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET || "",
  GOOGLE_OAUTH_REFRESH_TOKEN: process.env.GOOGLE_OAUTH_REFRESH_TOKEN || process.env.GOOGLE_ADS_REFRESH_TOKEN || "",
};
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
];

const child = spawn("uv", args, { cwd: root, env: runnerEnvironment, windowsHide: true, stdio: ["ignore", output.fd, output.fd] });
const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
}).catch(async (error) => {
  await writeStatus({ status: "failed", stage: "Runner failed to start", error: error instanceof Error ? error.message : String(error), finishedAt: new Date().toISOString() });
  return 1;
});
clearInterval(heartbeat);
await output.close();

if (exitCode === 0) {
  await writeStatus({ status: "completed", stage: "Analysis completed", finishedAt: new Date().toISOString() });
} else {
  const log = await fs.readFile(logPath, "utf8").catch(() => "");
  await writeStatus({
    status: "failed",
    stage: "Analysis failed",
    error: log.trim().split(/\r?\n/).slice(-12).join("\n") || `Runner exited with code ${exitCode}`,
    finishedAt: new Date().toISOString(),
  });
}
