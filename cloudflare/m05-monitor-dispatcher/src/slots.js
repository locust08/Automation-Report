const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Cloudflare timestamps are UTC; Malaysia has no daylight-saving adjustment. */
export function malaysiaSlot(scheduledTime) {
  if (!Number.isFinite(scheduledTime)) throw new Error("Invalid scheduled timestamp.");
  const local = new Date(scheduledTime + MALAYSIA_OFFSET_MS);
  const hour = local.getUTCHours();
  const minute = local.getUTCMinutes();
  const weekday = local.getUTCDay();
  const localDate = local.toISOString().slice(0, 10);
  if (minute === 0 && (hour === 8 || hour === 16)) {
    return { kind: "health", platforms: ["google", "meta"], localDate, hour, minute };
  }
  if (minute === 15 && (hour === 8 || hour === 16)) {
    return { kind: "health", platforms: ["tiktok"], localDate, hour, minute };
  }
  if (weekday === 1 && hour === 9 && minute === 0) {
    return { kind: "recommendations", platforms: [], localDate, hour, minute };
  }
  return null;
}
