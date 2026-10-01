"use client";

import type { ReactNode } from "react";
import {
  AdIcon,
  ChevronRightIcon,
  GroupIcon,
  LoaderCircleIcon,
  MegaphoneIcon,
} from "lucide-react";

import { useReportSectionQuery } from "@/components/reporting/use-report-data";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import type {
  CampaignRow,
  Platform,
  PreviewAdGroupNode,
  PreviewAdNode,
  PreviewReportPayload,
  PreviewPerformanceSummary,
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
    platform: hierarchyPlatform(campaign),
    resultActionType: campaign.resultActionType,
  });
  const adGroupsQuery = useReportSectionQuery<PreviewReportPayload>(
    `/api/campaigns/${encodeURIComponent(campaign.id)}/ad-groups`,
    baseQueryString,
    open,
    "Unable to load the campaign structure.",
    HIERARCHY_CACHE_TTL_MS,
    true,
  );
  const adGroups = getAdGroups(adGroupsQuery.data, campaign);
  const selectedAdGroup =
    adGroups.find((adGroup) => adGroup.id === expandedAdGroupId) ?? null;
  const adsQueryString = buildHierarchyQuery(queryString, {
    platform: hierarchyPlatform(campaign),
    campaignId: campaign.id,
    resultActionType: campaign.resultActionType,
  });
  const adsQuery = useReportSectionQuery<PreviewReportPayload>(
    `/api/ad-groups/${encodeURIComponent(selectedAdGroup?.id ?? "-")}/ads`,
    adsQueryString,
    open && Boolean(selectedAdGroup),
    "Unable to load ads.",
    HIERARCHY_CACHE_TTL_MS,
    true,
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
          {adGroupsQuery.data?.warnings.map((warning) => <HierarchyMessage key={warning}>{warning}</HierarchyMessage>)}
          {adGroupsQuery.data?.warnings.length ? <Button variant="ghost" size="xs" onClick={adGroupsQuery.retry}>Retry ad sets</Button> : null}
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
                      <span className="min-w-0 flex-1 truncate font-medium">{adGroup.name}</span>
                    </button>
                    {campaign.platform === "meta" ? <HierarchyLink queryString={queryString} campaignId={campaign.id} adSetId={adGroup.id} /> : null}
                    {campaign.platform === "meta" ? <HierarchyMetrics performance={adGroup.performance} /> : null}
                    {expanded ? (
                      <div className="ml-4 border-l border-[#d8dde7] py-1 pl-4">
                        {adsQuery.loading ? (
                          <HierarchyMessage loading>Loading ads...</HierarchyMessage>
                        ) : null}
                        {adsQuery.error ? (
                          <HierarchyError message={adsQuery.error} onRetry={adsQuery.retry} />
                        ) : null}
                        {adsQuery.data?.warnings.map((warning) => <HierarchyMessage key={warning}>{warning}</HierarchyMessage>)}
                        {adsQuery.data?.warnings.length ? <Button variant="ghost" size="xs" onClick={adsQuery.retry}>Retry ads</Button> : null}
                        {!adsQuery.loading && !adsQuery.error && ads.length === 0 ? (
                          <HierarchyMessage>No ads found.</HierarchyMessage>
                        ) : null}
                        {ads.map((ad) => (
                          <div
                            key={ad.id}
                            className="min-w-0 rounded-md px-2 py-2 text-sm text-[#555] hover:bg-[#f7f8fa]"
                          >
                            <div className="flex items-start gap-2">
                            <MegaphoneIcon className="mt-0.5 size-3.5 shrink-0 text-[#6d7b98]" />
                            <span className="min-w-0 flex-1 truncate">{ad.name}</span>
                            </div>
                            {campaign.platform === "meta" && selectedAdGroup ? <HierarchyLink queryString={queryString} campaignId={campaign.id} adSetId={selectedAdGroup.id} adId={ad.id} /> : null}
                            {campaign.platform === "meta" ? <HierarchyMetrics performance={ad.performance} /> : null}
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

function HierarchyMetrics({ performance: p }: { performance?: PreviewPerformanceSummary | null }) {
  const missing = (key: string) => p?.unavailableMetrics?.includes(key);
  const metrics = [
    ["Impressions", missing("impressions") ? null : p?.impressions], ["Clicks", missing("clicks") ? null : p?.clicks], ["CTR (%)", p && !missing("impressions") && !missing("clicks") && p.impressions > 0 ? p.ctr : null], ["CPM", missing("spend") || missing("impressions") ? null : p?.cpm],
    [p?.resultLabel ?? "Results", p?.resultsAvailable === false ? null : p?.results], ["Cost/Result", p?.resultsAvailable === false || missing("spend") ? null : p?.costPerResult], ["Ads Spent", missing("spend") ? null : p?.spend],
  ] as const;
  return <dl className="mb-2 grid grid-cols-2 gap-2 rounded-md bg-white/70 px-3 py-2 sm:grid-cols-4 xl:grid-cols-7">
    {metrics.map(([label, value]) => <div key={label}><dt className="text-[10px] text-[#777]">{label}</dt><dd className="text-xs font-medium tabular-nums">{value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</dd></div>)}
  </dl>;
}

function HierarchyLink({ queryString, campaignId, adSetId, adId }: { queryString: string; campaignId: string; adSetId: string; adId?: string }) {
  const source = new URLSearchParams(queryString.replace(/^&/, ""));
  const accountId = (source.get("metaAccountId") ?? source.get("accountId") ?? "").replace(/^act_/, "");
  if (!/^\d+$/.test(accountId)) return null;
  const params = new URLSearchParams({ act: accountId, selected_campaign_ids: campaignId, selected_adset_ids: adSetId });
  if (adId) params.set("selected_ad_ids", adId);
  return <a href={`https://www.facebook.com/adsmanager/manage/${adId ? "ads" : "adsets"}?${params}`} target="_blank" rel="noopener noreferrer" className="mb-1 block px-3 text-right text-xs text-[#9f0019] hover:underline">View in Ads Manager ↗</a>;
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
  values: { platform: HierarchyPlatform; campaignId?: string; resultActionType?: string }
): string {
  const params = new URLSearchParams(
    queryString.startsWith("&") ? queryString.slice(1) : queryString
  );
  params.set("platform", values.platform);
  if (values.platform === "meta") {
    params.set("performance", "1");
    if (values.resultActionType) params.set("resultActionType", values.resultActionType);
  }
  if (values.campaignId) {
    params.set("campaignId", values.campaignId);
  }
  return params.toString();
}

function getAdGroups(
  payload: PreviewReportPayload | null,
  campaign: CampaignRow
): PreviewAdGroupNode[] {
  const platform = hierarchyPlatform(campaign);
  return (
    payload?.sections
      .find((section) => section.platform === platform)
      ?.campaigns.find((item) => item.id === campaign.id)?.children ?? []
  ).filter((item) => platform === "meta" || isActiveStatus(item.status, platform === "tiktok"));
}

function getAds(
  payload: PreviewReportPayload | null,
  campaign: CampaignRow,
  adGroup: PreviewAdGroupNode | null
): PreviewAdNode[] {
  if (!adGroup) {
    return [];
  }
  const platform = hierarchyPlatform(campaign);
  return (
    payload?.sections
      .find((section) => section.platform === platform)
      ?.campaigns.find((item) => item.id === campaign.id)
      ?.children.find((item) => item.id === adGroup.id)?.ads ?? []
  ).filter((item) => platform === "meta" || isActiveStatus(item.status, platform === "tiktok"));
}

type HierarchyPlatform = Extract<Platform, "meta" | "google" | "tiktok">;

function hierarchyPlatform(campaign: CampaignRow): HierarchyPlatform {
  if (campaign.platform === "meta" || campaign.platform === "tiktok") {
    return campaign.platform;
  }
  return "google";
}

function isActiveStatus(
  status: string | null | undefined,
  requireExplicitActive = false
): boolean {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) {
    return !requireExplicitActive;
  }
  if (requireExplicitActive) {
    return normalized === "enable" || normalized === "enabled" || normalized === "active";
  }
  return !["paused", "deleted", "removed", "archived", "disable", "inactive"].some(
    (blocked) => normalized.includes(blocked)
  );
}
