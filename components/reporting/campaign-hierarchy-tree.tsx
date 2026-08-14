"use client";

import type { ReactNode } from "react";
import { AdIcon, ChevronRightIcon, GroupIcon, LoaderCircleIcon, MegaphoneIcon } from "lucide-react";

import { useReportSectionQuery } from "@/components/reporting/use-report-data";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import type {
  CampaignRow,
  PreviewAdGroupNode,
  PreviewAdNode,
  PreviewReportPayload,
} from "@/lib/reporting/types";
import { cn } from "@/lib/utils";

const HIERARCHY_CACHE_TTL_MS = 5 * 60 * 1000;

export function CampaignHierarchyTree({
  campaign,
  queryString,
  open,
  expandedAdGroupId,
  onExpandedAdGroupChange,
}: {
  campaign: CampaignRow;
  queryString: string;
  open: boolean;
  expandedAdGroupId: string | null;
  onExpandedAdGroupChange: (adGroupId: string | null) => void;
}) {
  const baseQueryString = buildHierarchyQuery(queryString, {
    platform: campaign.platform === "meta" ? "meta" : "google",
  });
  const adGroupsQuery = useReportSectionQuery<PreviewReportPayload>(
    `/api/campaigns/${encodeURIComponent(campaign.id)}/ad-groups`,
    baseQueryString,
    open,
    "Unable to load the campaign structure.",
    HIERARCHY_CACHE_TTL_MS
  );
  const adGroups = getAdGroups(adGroupsQuery.data, campaign);
  const selectedAdGroup =
    adGroups.find((adGroup) => adGroup.id === expandedAdGroupId) ?? null;
  const adsQueryString = buildHierarchyQuery(queryString, {
    platform: campaign.platform === "meta" ? "meta" : "google",
    campaignId: campaign.id,
  });
  const adsQuery = useReportSectionQuery<PreviewReportPayload>(
    `/api/ad-groups/${encodeURIComponent(selectedAdGroup?.id ?? "-")}/ads`,
    adsQueryString,
    open && Boolean(selectedAdGroup),
    "Unable to load ads.",
    HIERARCHY_CACHE_TTL_MS
  );
  const ads = getAds(adsQuery.data, campaign, selectedAdGroup);
  const childLabel = campaign.platform === "meta" ? "Ad Sets" : "Ad Groups";

  return (
    <Collapsible open={open}>
      <CollapsibleContent>
        <div className="py-2">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#777]">
            <AdIcon className="size-3.5" />
            {childLabel}
          </div>
          {adGroupsQuery.loading ? (
            <HierarchyMessage loading>Loading {childLabel.toLowerCase()}...</HierarchyMessage>
          ) : null}
          {adGroupsQuery.error ? (
            <HierarchyError message={adGroupsQuery.error} onRetry={adGroupsQuery.retry} />
          ) : null}
          {!adGroupsQuery.loading && !adGroupsQuery.error && adGroups.length === 0 ? (
            <HierarchyMessage>No {childLabel.toLowerCase()} found.</HierarchyMessage>
          ) : null}
          {adGroups.length > 0 ? (
            <div className="ml-2 space-y-1 border-l border-[#d8dde7] pl-3">
              {adGroups.map((adGroup) => {
                const expanded = adGroup.id === selectedAdGroup?.id;
                return (
                  <div key={adGroup.id}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      className={cn(
                        "flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        expanded
                          ? "bg-[#eef3ff] text-[#153b8f]"
                          : "text-[#3f4654] hover:bg-[#f4f6f9]"
                      )}
                      onClick={() =>
                        onExpandedAdGroupChange(expanded ? null : adGroup.id)
                      }
                    >
                      <ChevronRightIcon
                        className={cn(
                          "size-3.5 shrink-0 transition-transform",
                          expanded && "rotate-90"
                        )}
                      />
                      <GroupIcon className="size-3.5 shrink-0" />
                      <span className="truncate">{adGroup.name}</span>
                    </button>
                    {expanded ? (
                      <div className="ml-4 border-l border-[#d8dde7] py-1 pl-4">
                        {adsQuery.loading ? (
                          <HierarchyMessage loading>Loading ads...</HierarchyMessage>
                        ) : null}
                        {adsQuery.error ? (
                          <HierarchyError message={adsQuery.error} onRetry={adsQuery.retry} />
                        ) : null}
                        {!adsQuery.loading && !adsQuery.error && ads.length === 0 ? (
                          <HierarchyMessage>No ads found.</HierarchyMessage>
                        ) : null}
                        {ads.map((ad) => (
                          <div
                            key={ad.id}
                            className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[#555]"
                          >
                            <MegaphoneIcon className="size-3.5 shrink-0 text-[#6d7b98]" />
                            <span className="truncate">{ad.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function HierarchyMessage({
  children,
  loading = false,
}: {
  children: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-[#f7f8fa] px-3 py-2 text-xs text-[#6b7280]">
      {loading ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : null}
      {children}
    </div>
  );
}

function HierarchyError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
      <span>{message}</span>
      <Button type="button" variant="ghost" size="xs" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function buildHierarchyQuery(
  queryString: string,
  values: { platform: "meta" | "google"; campaignId?: string }
): string {
  const params = new URLSearchParams(
    queryString.startsWith("&") ? queryString.slice(1) : queryString
  );
  params.set("platform", values.platform);
  if (values.campaignId) {
    params.set("campaignId", values.campaignId);
  }
  return params.toString();
}

function getAdGroups(
  payload: PreviewReportPayload | null,
  campaign: CampaignRow
): PreviewAdGroupNode[] {
  const platform = campaign.platform === "meta" ? "meta" : "google";
  return (
    payload?.sections
      .find((section) => section.platform === platform)
      ?.campaigns.find((item) => item.id === campaign.id)?.children ?? []
  );
}

function getAds(
  payload: PreviewReportPayload | null,
  campaign: CampaignRow,
  adGroup: PreviewAdGroupNode | null
): PreviewAdNode[] {
  if (!adGroup) {
    return [];
  }
  const platform = campaign.platform === "meta" ? "meta" : "google";
  return (
    payload?.sections
      .find((section) => section.platform === platform)
      ?.campaigns.find((item) => item.id === campaign.id)
      ?.children.find((item) => item.id === adGroup.id)?.ads ?? []
  );
}
