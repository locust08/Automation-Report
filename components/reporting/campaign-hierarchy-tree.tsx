"use client";

import { Fragment, type ReactNode } from "react";
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
        <div className="min-w-0 space-y-2 py-2">
          {campaign.platform !== "meta" || !adGroups.length ? <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#777]">
            <AdIcon className="size-3.5" />
            {childLabel}
          </div> : null}
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
          {adGroups.length > 0 ? campaign.platform === "meta" ? (
            <MetaHierarchyTables
              adGroups={adGroups}
              ads={ads}
              expandedAdGroupId={selectedAdGroup?.id ?? null}
              onExpandedAdGroupChange={onExpandedAdGroupChange}
              campaignId={campaign.id}
              queryString={queryString}
              adsStatus={<>
                {adsQuery.loading ? <HierarchyMessage loading>Loading ads...</HierarchyMessage> : null}
                {adsQuery.error ? <HierarchyError message={adsQuery.error} onRetry={adsQuery.retry} /> : null}
                {adsQuery.data?.warnings.map((warning) => <HierarchyMessage key={warning}>{warning}</HierarchyMessage>)}
                {adsQuery.data?.warnings.length ? <Button variant="ghost" size="xs" onClick={adsQuery.retry}>Retry ads</Button> : null}
                {!adsQuery.loading && !adsQuery.error && ads.length === 0 ? <HierarchyMessage>No ads found.</HierarchyMessage> : null}
              </>}
            />
          ) : (
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


// Every level uses the campaign table's column order and proportions.
function HierarchyTableFrame({ label, children }: { label: string; children: ReactNode }) {
  return <section className="min-w-0 overflow-hidden rounded-xl border border-[#e3c6c6] bg-white" aria-label={`${label} performance`}>
    <h3 className="border-b border-[#e3c6c6] bg-[#f9e4e4] px-4 py-3 text-base font-semibold text-[#66232b]">{label}</h3>
    <div className="overflow-x-auto" role="region" aria-label={`${label} performance table`} tabIndex={0}>
      <table className="w-full min-w-[1200px] table-fixed text-left text-sm sm:text-base">
        <colgroup>
          <col className="w-[180px] sm:w-[30%]" />
          {[8, 8, 8, 10, 8, 10, 10, 8].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}
        </colgroup>
        <thead><tr className="border-b border-[#e6e6e6] bg-[#fafafa] text-[#454545]">
          {["Name", "Impression", "Clicks", "CTR (%)", "CPM", "Results", "Cost/Results", "Ads Spent", "Actions"].map((heading, index) => <th key={heading} scope="col" className={cn("px-3 py-3 font-semibold", index === 0 ? "sticky left-0 z-10 border-r border-[#e6e6e6] bg-[#fafafa]" : "text-center")} data-report-export-exclude={index === 8 ? "true" : undefined}>{heading}</th>)}
        </tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  </section>;
}

function MetaHierarchyTables({ adGroups, ads, expandedAdGroupId, onExpandedAdGroupChange, campaignId, queryString, adsStatus }: {
  adGroups: PreviewAdGroupNode[]; ads: PreviewAdNode[]; expandedAdGroupId: string | null;
  onExpandedAdGroupChange: (id: string | null) => void; campaignId: string; queryString: string; adsStatus: ReactNode;
}) {
  return <HierarchyTableFrame label="Ad Sets">
    {adGroups.map((adGroup) => {
      const expanded = expandedAdGroupId === adGroup.id;
      return <Fragment key={adGroup.id}>
        <tr className={cn("border-b border-[#e6e6e6]", expanded ? "bg-[#fff5f5]" : "bg-white hover:bg-[#fafafa]")}>
          <td className={cn("sticky left-0 z-10 border-r border-[#e6e6e6] px-3 py-4 align-top", expanded ? "bg-[#fff5f5]" : "bg-white")}>
            <button type="button" aria-expanded={expanded} onClick={() => onExpandedAdGroupChange(expanded ? null : adGroup.id)} className="flex w-full items-start gap-2 text-left font-medium text-[#9f0019]">
              <ChevronRightIcon className={cn("mt-0.5 size-4 shrink-0 transition-transform", expanded && "rotate-90")} />
              <GroupIcon className="mt-0.5 size-4 shrink-0 text-[#777]" />
              <span className="min-w-0 break-words leading-6">{adGroup.name}</span>
            </button>
          </td>
          <HierarchyMetricCells performance={adGroup.performance} />
          <td className="px-3 py-4 text-center" data-report-export-exclude="true"><HierarchyLink queryString={queryString} campaignId={campaignId} adSetId={adGroup.id} /></td>
        </tr>
        {expanded ? <tr><td colSpan={9} className="bg-[#f6f6f6] p-3">
          <div className="mb-2 space-y-2">{adsStatus}</div>
          <HierarchyTableFrame label="Ads">
            {ads.map((ad) => <tr key={ad.id} className="border-b border-[#e6e6e6] bg-white hover:bg-[#fafafa]">
              <td className="sticky left-0 z-10 border-r border-[#e6e6e6] bg-white px-3 py-4 align-top"><div className="flex items-start gap-2"><MegaphoneIcon className="mt-1 size-4 shrink-0 text-[#777]" /><span className="min-w-0 break-words leading-6 font-medium">{ad.name}</span></div></td>
              <HierarchyMetricCells performance={ad.performance} />
              <td className="px-3 py-4 text-center" data-report-export-exclude="true"><HierarchyLink queryString={queryString} campaignId={campaignId} adSetId={adGroup.id} adId={ad.id} /></td>
            </tr>)}
          </HierarchyTableFrame>
        </td></tr> : null}
      </Fragment>;
    })}
  </HierarchyTableFrame>;
}

function HierarchyMetricCells({ performance: p }: { performance?: PreviewPerformanceSummary | null }) {
  const missing = (key: string) => p?.unavailableMetrics?.includes(key);
  const values = [
    missing("impressions") ? null : p?.impressions,
    missing("clicks") ? null : p?.clicks,
    p && !missing("impressions") && !missing("clicks") && p.impressions > 0 ? p.ctr : null,
    missing("spend") || missing("impressions") ? null : p?.cpm,
    p?.resultsAvailable === false ? null : p?.results,
    p?.resultsAvailable === false || missing("spend") ? null : p?.costPerResult,
    missing("spend") ? null : p?.spend,
  ];
  return <>{values.map((value, index) => <td key={index} className="px-3 py-4 text-center tabular-nums whitespace-nowrap" title={index === 4 || index === 5 ? p?.resultLabel : undefined}>{value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>)}</>;
}

function HierarchyLink({ queryString, campaignId, adSetId, adId }: { queryString: string; campaignId: string; adSetId: string; adId?: string }) {
  const source = new URLSearchParams(queryString.replace(/^&/, ""));
  const accountId = (source.get("metaAccountId") ?? source.get("accountId") ?? "").replace(/^act_/, "");
  if (!/^\d+$/.test(accountId)) return null;
  const params = new URLSearchParams({ act: accountId, selected_campaign_ids: campaignId, selected_adset_ids: adSetId });
  if (adId) params.set("selected_ad_ids", adId);
  return <a href={`https://www.facebook.com/adsmanager/manage/${adId ? "ads" : "adsets"}?${params}`} target="_blank" rel="noopener noreferrer" className="inline-block whitespace-nowrap text-sm text-[#9f0019] hover:underline" aria-label="View in Ads Manager">View ↗</a>;
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
