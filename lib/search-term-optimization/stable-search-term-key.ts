type SearchTermIdentity = {
  campaignId?: string | null;
  adGroupId?: string | null;
  searchTerm: string;
};

export function stableSearchTermKey(row: SearchTermIdentity) {
  const normalizedTerm = row.searchTerm.trim().toLowerCase().replace(/\s+/g, " ");
  return `${row.campaignId ?? ""}|${row.adGroupId ?? ""}|${normalizedTerm}`;
}
