export const REMEMBERED_REPORT_ACCOUNT_STORAGE_KEY = "ads-reporting-last-account";

export type RememberedReportAccount = {
  accountId: string;
  platform: "meta" | "google" | "tiktok";
  displayName: string;
  country: string | null;
};

type ReportAccountStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readRememberedReportAccount(
  storage: ReportAccountStorage,
): RememberedReportAccount | null {
  try {
    const raw = storage.getItem(REMEMBERED_REPORT_ACCOUNT_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as unknown;
    return isRememberedReportAccount(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeRememberedReportAccount(
  storage: ReportAccountStorage,
  account: RememberedReportAccount,
) {
  storage.setItem(REMEMBERED_REPORT_ACCOUNT_STORAGE_KEY, JSON.stringify(account));
}

export function clearRememberedReportAccount(storage: ReportAccountStorage) {
  storage.removeItem(REMEMBERED_REPORT_ACCOUNT_STORAGE_KEY);
}

function isRememberedReportAccount(value: unknown): value is RememberedReportAccount {
  if (!value || typeof value !== "object") return false;
  const account = value as Partial<RememberedReportAccount>;
  return Boolean(
    typeof account.accountId === "string" &&
      account.accountId.trim() &&
      (account.platform === "meta" || account.platform === "google" || account.platform === "tiktok") &&
      typeof account.displayName === "string" &&
      (account.country === null || typeof account.country === "string"),
  );
}
