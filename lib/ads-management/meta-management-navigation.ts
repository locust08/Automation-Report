import type { MetaChangeRequestNavigationFilter } from "@/lib/change-control/meta-change-request-navigation";

export type MetaManagementTab = "overview" | "campaigns" | "ad_sets" | "ads" | "creatives" | "audience" | "opportunities" | "change_requests";

export function selectMetaPrimaryNavigation(tab: Exclude<MetaManagementTab, "change_requests">) {
  return { tab, changeRequestsOpen: false } as const;
}

export function selectMetaChangeRequestNavigation(changeRequestFilter: MetaChangeRequestNavigationFilter) {
  return { tab: "change_requests", changeRequestFilter, changeRequestsOpen: true } as const;
}
