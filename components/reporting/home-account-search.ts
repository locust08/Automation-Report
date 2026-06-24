export type AccountSearchLabelInput = {
  accountName: string;
  adAccountId: string;
};

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
