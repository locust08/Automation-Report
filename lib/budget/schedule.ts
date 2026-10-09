export type BudgetSlot = { kind: "health" | "recommendations"; platforms: Array<"google" | "meta" | "tiktok">; localDate: string };

export function budgetSlot(scheduledAt: string): BudgetSlot | null {
  const utc = Date.parse(scheduledAt);
  if (!Number.isFinite(utc) || new Date(utc).toISOString() !== scheduledAt) return null;
  const local = new Date(utc + 8 * 60 * 60 * 1000);
  const hour = local.getUTCHours(), minute = local.getUTCMinutes();
  const localDate = local.toISOString().slice(0, 10);
  if (minute === 0 && (hour === 8 || hour === 16)) return { kind: "health", platforms: ["google", "meta"], localDate };
  if (minute === 15 && (hour === 8 || hour === 16)) return { kind: "health", platforms: ["tiktok"], localDate };
  if (local.getUTCDay() === 1 && hour === 9 && minute === 0) return { kind: "recommendations", platforms: [], localDate };
  return null;
}

export function dateBefore(date: string, count: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - count * 86_400_000).toISOString().slice(0, 10);
}

export function localYesterday(zone: string, now = new Date()): string {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return dateBefore(date, 1);
}

export function pilotNotionAccountId(value: string | undefined): string | null {
  const id = value?.trim() ?? "";
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}
