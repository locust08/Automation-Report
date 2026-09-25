import { readProviderDailySpend, type SpendPlatform } from "@/lib/budget/provider-spend";

async function main() {
  const [platform, accountId, currency, timezone, start, end] = process.argv.slice(2);
  if (!["google", "meta", "tiktok"].includes(platform) || !/^\d{1,30}$/.test(accountId ?? "")
    || !/^[A-Z]{3}$/.test(currency ?? "") || !timezone || !start || !end) {
    throw new Error("Usage: m05-readonly-pilot <google|meta|tiktok> <account-id> <currency> <timezone> <start> <end>");
  }
  const result = await readProviderDailySpend({ platform: platform as SpendPlatform, accountId, currency, timezone, start, end });
  process.stdout.write(JSON.stringify({ platform: result.platform, accountId: result.accountId,
    period: { start: result.start, end: result.end }, currency: result.currency,
    observedDays: result.daily.length, missingDays: result.missingDays,
    observedSpend: result.daily.reduce((total, day) => total + day.amount, 0),
    capturedAt: result.capturedAt, providerSnapshotId: result.providerSnapshotId }) + "\n");
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "Provider read failed."}\n`); process.exitCode = 1; });
