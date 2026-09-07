export const CAMPAIGN_NAME_FILTER_MODE_PARAM = "campaignNameFilterMode";
export const CAMPAIGN_NAME_FILTER_VALUE_PARAM = "campaignNameFilterValue";
export const CAMPAIGN_SCOPE_PARAM = "campaignScope";
export const LT_CAMPAIGN_META_ACCOUNT_ID = "96906550";

export type CampaignScope = "all" | "lt";

export type CampaignNameFilterMode = "include" | "exclude";

export interface CampaignNameFilter {
  mode: CampaignNameFilterMode;
  values: string[];
}

export function parseCampaignScope(value: string | null | undefined): CampaignScope {
  return value?.trim().toLocaleLowerCase() === "lt" ? "lt" : "all";
}

export function isLtCampaignName(campaignName: string | null | undefined): boolean {
  return /(^|[^a-z0-9])lt(?=$|[^a-z0-9])/i.test(campaignName?.trim() ?? "");
}

export function resolveEffectiveCampaignScope(input: {
  requestedScope: CampaignScope | null | undefined;
  metaAccountIds: string[];
  googleAccountIds?: string[];
  tiktokAccountIds?: string[];
}): CampaignScope {
  const isEligibleAccount =
    input.metaAccountIds.length === 1 &&
    input.metaAccountIds[0]?.replace(/\D/g, "") === LT_CAMPAIGN_META_ACCOUNT_ID &&
    (input.googleAccountIds?.length ?? 0) === 0 &&
    (input.tiktokAccountIds?.length ?? 0) === 0;

  return isEligibleAccount && input.requestedScope === "lt" ? "lt" : "all";
}

export function filterRowsByCampaignScope<T>(
  rows: T[],
  getCampaignName: (row: T) => string | null | undefined,
  scope: CampaignScope
): T[] {
  return scope === "lt" ? rows.filter((row) => isLtCampaignName(getCampaignName(row))) : rows;
}

export function parseCampaignNameFilter(
  params: URLSearchParams | string
): CampaignNameFilter | null {
  const searchParams = typeof params === "string" ? new URLSearchParams(params) : params;
  const rawMode = searchParams.get(CAMPAIGN_NAME_FILTER_MODE_PARAM);
  const values = getCampaignNameOptions(searchParams.getAll(CAMPAIGN_NAME_FILTER_VALUE_PARAM));

  if (values.length === 0) {
    return null;
  }

  return {
    mode: rawMode === "exclude" ? "exclude" : "include",
    values,
  };
}

export function writeCampaignNameFilterParams(
  params: URLSearchParams,
  filter: CampaignNameFilter | null
): URLSearchParams {
  params.delete(CAMPAIGN_NAME_FILTER_MODE_PARAM);
  params.delete(CAMPAIGN_NAME_FILTER_VALUE_PARAM);
  const values = getCampaignNameOptions(filter?.values ?? []);
  if (values.length > 0) {
    params.set(CAMPAIGN_NAME_FILTER_MODE_PARAM, filter?.mode === "exclude" ? "exclude" : "include");
    values.forEach((value) => params.append(CAMPAIGN_NAME_FILTER_VALUE_PARAM, value));
  }
  return params;
}

export function campaignNameMatchesFilter(
  campaignName: string | string[] | null | undefined,
  filter: CampaignNameFilter | null
): boolean {
  const selectedNames = getCampaignNameOptions(filter?.values ?? []);
  if (selectedNames.length === 0) {
    return true;
  }

  const selected = new Set(selectedNames.map(normalizeCampaignNameSearchText));
  const candidateNames = getCampaignNameOptions(Array.isArray(campaignName) ? campaignName : [campaignName ?? ""]);
  const hasSelectedCampaign = candidateNames.some((name) =>
    selected.has(normalizeCampaignNameSearchText(name))
  );
  return filter?.mode === "exclude" ? !hasSelectedCampaign : hasSelectedCampaign;
}

export function filterRowsByCampaignName<T>(
  rows: T[],
  getCampaignName: (row: T) => string | string[] | null | undefined,
  filter: CampaignNameFilter | null
): T[] {
  if (getCampaignNameOptions(filter?.values ?? []).length === 0) {
    return rows;
  }

  return rows.filter((row) => campaignNameMatchesFilter(getCampaignName(row), filter));
}

export function formatCampaignNameFilterLabel(filter: CampaignNameFilter): string {
  const prefix = filter.mode === "exclude" ? "Excludes" : "Includes";
  const values = getCampaignNameOptions(filter.values);
  if (values.length <= 2) {
    return `${prefix}: ${values.join(", ")}`;
  }
  return `${prefix}: ${values.slice(0, 2).join(", ")} +${values.length - 2}`;
}

export function getCampaignNameOptions(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const options: string[] = [];

  values.forEach((value) => {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) {
      return;
    }
    const key = normalizeCampaignNameSearchText(trimmed);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    options.push(trimmed);
  });

  return options;
}

function normalizeCampaignNameSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}
