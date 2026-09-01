export type GoogleManagementView = "recommendations" | "campaigns" | "ad_groups" | "ads" | "change_requests";
export type GoogleChangeRequestFilter = "requests" | "campaign" | "ad_group" | "ad";
export type GoogleEntityView = Extract<GoogleManagementView, "campaigns" | "ad_groups" | "ads">;

export const GOOGLE_PAGINATED_LIST_CLASS = "overflow-hidden";

const GOOGLE_ENTITY_VIEW_LAYOUTS = {
  campaigns: { performanceTitle: "Campaign performance", filterLabel: "Campaign filter" },
  ad_groups: { performanceTitle: "Ad group performance", filterLabel: "Ad group filter" },
  ads: { performanceTitle: "Ad performance", filterLabel: "Ad filter" },
} as const satisfies Record<GoogleEntityView, { performanceTitle: string; filterLabel: string }>;

export function getGoogleEntityViewLayout(view: GoogleEntityView) {
  return {
    ...GOOGLE_ENTITY_VIEW_LAYOUTS[view],
    filterPlacement: "performance_header",
    showLocalDatePicker: false,
  } as const;
}

export function shouldDismissGoogleAccountSearch(searchContainer: unknown, eventPath: readonly unknown[]) {
  return !eventPath.includes(searchContainer);
}

export function selectGooglePrimaryNavigation(view: Exclude<GoogleManagementView, "change_requests">) {
  return { view, changeRequestsOpen: false } as const;
}

export function selectGoogleChangeRequestNavigation(changeRequestFilter: GoogleChangeRequestFilter) {
  return { view: "change_requests", changeRequestFilter, changeRequestsOpen: true } as const;
}
