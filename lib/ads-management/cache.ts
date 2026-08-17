import { unstable_cache } from "next/cache";

import {
  fetchManagedRecommendations,
  fetchManagedSearchCampaigns,
} from "@/lib/ads-management/google";

const CACHE_SECONDS = 5 * 60;

const cachedCampaigns = unstable_cache(
  async (accountId: string, startDate: string, endDate: string) =>
    fetchManagedSearchCampaigns(accountId, {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
  ["google-ads-management-campaigns-v1"],
  { revalidate: CACHE_SECONDS }
);

const cachedRecommendations = unstable_cache(
  async (accountId: string) => fetchManagedRecommendations(accountId),
  ["google-ads-management-recommendations-v1"],
  { revalidate: CACHE_SECONDS }
);

export function getCachedManagedCampaigns(
  accountId: string,
  dates: { startDate?: string; endDate?: string }
) {
  return cachedCampaigns(accountId, dates.startDate?.trim() || "", dates.endDate?.trim() || "");
}

export function getCachedManagedRecommendations(accountId: string) {
  return cachedRecommendations(accountId);
}
