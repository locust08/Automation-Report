export type AccountSearchLabelInput = {
  accountName: string;
  adAccountId: string;
};

export function buildReportAccountQuery(input: {
  adAccountId: string;
  platform?: "meta" | "google" | "tiktok" | null;
  country: string;
}): string {
  const params = new URLSearchParams();
  const accountId = input.adAccountId.trim();
  if (accountId) {
    if (input.platform === "tiktok") {
      params.set("tiktokAccountId", accountId);
      params.set("platform", "tiktok");
    } else if (input.platform === "google") {
      params.set("googleAccountId", accountId);
      params.set("platform", "google");
    } else if (input.platform === "meta") {
      params.set("metaAccountId", accountId);
      params.set("platform", "meta");
    } else {
      params.set("accountId", accountId);
    }
  }
  params.set("country", input.country);
  return params.toString();
}

export function formatAccountSuggestionLabel(suggestion: AccountSearchLabelInput): string {
  return `${suggestion.accountName} | ${suggestion.adAccountId}`;
}

export function extractAdAccountIdFromAccountSearchInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const pipeIndex = trimmed.lastIndexOf("|");
  if (pipeIndex >= 0) {
    return trimmed.slice(pipeIndex + 1).trim();
  }

  if (trimmed.toLowerCase().startsWith("act_")) {
    return trimmed;
  }

  const digitCount = trimmed.replace(/\D/g, "").length;
  return digitCount >= 6 ? trimmed : "";
}
