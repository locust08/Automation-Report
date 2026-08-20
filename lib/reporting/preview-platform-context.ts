export type PreviewPlatform = "meta" | "google" | "tiktok";

export function resolvePreviewPlatform(input: {
  requestedPlatform: string | null | undefined;
  metaAccountId: string | null | undefined;
  googleAccountId: string | null | undefined;
  tiktokAccountId: string | null | undefined;
}): PreviewPlatform | null {
  const available = ([
    ["meta", input.metaAccountId],
    ["google", input.googleAccountId],
    ["tiktok", input.tiktokAccountId],
  ] as const).filter(([, accountId]) => Boolean(accountId?.trim()));

  if (available.length === 1) return available[0]?.[0] ?? null;

  const requested = input.requestedPlatform === "meta" || input.requestedPlatform === "google" || input.requestedPlatform === "tiktok"
    ? input.requestedPlatform
    : null;
  if (requested && (available.length === 0 || available.some(([platform]) => platform === requested))) {
    return requested;
  }
  return available[0]?.[0] ?? null;
}

export function switchReportAccountEntryPlatform<
  T extends { platform: PreviewPlatform; accountId: string; searchText: string },
>(entry: T, platform: PreviewPlatform): T {
  return { ...entry, platform, accountId: "", searchText: "" };
}

export function shouldPreservePreviewHierarchySelection(
  requestedPlatform: string | null | undefined,
  resolvedPlatform: PreviewPlatform | null,
): boolean {
  return !requestedPlatform || requestedPlatform === resolvedPlatform;
}
