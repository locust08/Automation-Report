const REPORT_CONTEXT_KEYS = [
  "accountId",
  "metaAccountId",
  "googleAccountId",
  "tiktokAccountId",
  "platform",
  "country",
  "startDate",
  "endDate",
  "source",
  "campaignNameFilterMode",
  "campaignNameFilterValue",
] as const;

export function buildReportContextQuery(query: string): string {
  const source = new URLSearchParams(query);
  const target = new URLSearchParams();

  for (const key of REPORT_CONTEXT_KEYS) {
    for (const value of source.getAll(key)) {
      if (value.trim()) target.append(key, value);
    }
  }

  const explicitPlatform = inferExplicitPlatform(target);
  if (explicitPlatform) target.set("platform", explicitPlatform);
  return target.toString();
}

function inferExplicitPlatform(params: URLSearchParams): "meta" | "google" | "tiktok" | null {
  const populated = [
    ["tiktok", params.get("tiktokAccountId")],
    ["google", params.get("googleAccountId")],
    ["meta", params.get("metaAccountId")],
  ] as const;
  const selected = populated.filter(([, value]) => Boolean(value?.trim()));
  return selected.length === 1 ? selected[0]![0] : null;
}
