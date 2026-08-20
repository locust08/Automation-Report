"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3Icon,
  AwardIcon,
  BookmarkIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Clock3Icon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FolderIcon,
  HeartIcon,
  ImageIcon,
  InfoIcon,
  LayersIcon,
  LightbulbIcon,
  LayoutPanelLeftIcon,
  Link2Icon,
  MenuIcon,
  MegaphoneIcon,
  MessageCircleIcon,
  MonitorIcon,
  Music2Icon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  RefreshCwIcon,
  SearchIcon,
  SendIcon,
  SlidersHorizontalIcon,
  SmartphoneIcon,
  ThumbsUpIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";

import {
  PreviewAdGroupNode,
  PreviewAdNode,
  PreviewCampaignNode,
  PreviewDemographicRow,
  PreviewDetailField,
  PreviewPerformanceSummary,
  PreviewPlatformDistributionRow,
  PreviewPlatformSection,
} from "@/lib/reporting/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TikTokSelectedAdDetailsPanel } from "@/components/reporting/tiktok-selected-ad-details";

export function PreviewHierarchy({
  section,
  initialCampaignId,
  initialChildId,
  initialAdId,
  companyName,
  detailsLoading = false,
  onCampaignChange,
  onChildChange,
  onAdChange,
  startDate,
  endDate,
  onDateRangeChange,
}: {
  section: PreviewPlatformSection;
  initialCampaignId: string;
  initialChildId?: string;
  initialAdId?: string;
  companyName?: string | null;
  detailsLoading?: boolean;
  onCampaignChange?: (next: {
    platform: "meta" | "google" | "tiktok";
    campaignId: string;
    campaignName: string;
  }) => void;
  onChildChange?: (childId: string) => void;
  onAdChange?: (adId: string) => void;
  startDate?: string;
  endDate?: string;
  onDateRangeChange?: (next: { startDate: string; endDate: string }) => void;
}) {
  if (section.platform === "meta") {
    return (
      <MetaAdsPreviewWorkspace
        section={section}
        initialCampaignId={initialCampaignId}
        initialChildId={initialChildId}
        initialAdId={initialAdId}
        companyName={companyName}
        detailsLoading={detailsLoading}
        onCampaignChange={onCampaignChange}
        onChildChange={onChildChange}
        onAdChange={onAdChange}
      />
    );
  }

  if (section.platform === "tiktok") {
    return (
      <TikTokAdsPreviewWorkspace
        section={section}
        initialCampaignId={initialCampaignId}
        initialChildId={initialChildId}
        initialAdId={initialAdId}
        detailsLoading={detailsLoading}
        onCampaignChange={onCampaignChange}
        onChildChange={onChildChange}
        onAdChange={onAdChange}
        startDate={startDate}
        endDate={endDate}
        onDateRangeChange={onDateRangeChange}
      />
    );
  }

  return (
    <GoogleAdsPreviewWorkspace
      section={section}
      initialCampaignId={initialCampaignId}
      initialChildId={initialChildId}
      initialAdId={initialAdId}
      detailsLoading={detailsLoading}
      onCampaignChange={onCampaignChange}
      onChildChange={onChildChange}
      onAdChange={onAdChange}
    />
  );
}

function TikTokAdsPreviewWorkspace({
  section,
  initialCampaignId,
  initialChildId,
  initialAdId,
  detailsLoading = false,
  onCampaignChange,
  onChildChange,
  onAdChange,
  startDate,
  endDate,
  onDateRangeChange,
}: WorkspaceProps) {
  const searchParams = useSearchParams();
  const reportMonth = (searchParams?.get("endDate") ?? searchParams?.get("startDate") ?? "").slice(0, 7);
  const initialCampaign =
    section.campaigns.find((campaign) => campaign.id === initialCampaignId) ?? section.campaigns[0] ?? null;
  const monthMatchedChildId = reportMonth
    ? initialCampaign?.children.find((child) => child.name.trim() === reportMonth)?.id ?? ""
    : "";
  const effectiveInitialChildId = initialChildId || monthMatchedChildId;
  const {
    selectedCampaign,
    selectedChild,
    selectedAd,
    children,
    ads,
    selectCampaign,
    selectChild,
    selectAd,
  } = usePreviewSelection(
    section,
    initialCampaignId,
    onCampaignChange,
    effectiveInitialChildId,
    initialAdId,
    onChildChange,
    onAdChange,
  );
  const adGroupCount = section.campaigns.reduce((count, campaign) => count + campaign.children.length, 0);
  const adCount = section.campaigns.reduce(
    (count, campaign) => count + campaign.children.reduce((sum, child) => sum + child.ads.length, 0),
    0,
  );
  useEffect(() => {
    if (searchParams?.get("adGroupId") || !reportMonth) return;
    const monthMatchedChild = children.find((child) => child.name.trim() === reportMonth);
    if (monthMatchedChild && monthMatchedChild.id !== selectedChild?.id) {
      selectChild(monthMatchedChild.id);
    }
  }, [children, reportMonth, searchParams, selectChild, selectedChild?.id]);

  return (
    <section className="w-full space-y-6">
      <div
        data-tiktok-preview-workspace="true"
        className="rounded-[28px] border border-[#e7edf5] bg-white p-4 shadow-[0_20px_55px_rgba(15,23,42,0.06)] sm:p-5"
      >
        <div className="rounded-[26px] border border-[#eef3f8] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-[#dfe6f0] bg-white text-[#0f172a] shadow-sm">
                <Music2Icon className="size-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-[#0f172a] sm:text-[2.15rem]">
                  TikTok Ads Preview
                </h2>
                <p className="mt-2 max-w-4xl text-[1rem] leading-7 text-[#64748b]">
                  Review the selected TikTok campaign, ad group, and ad hierarchy.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <MetricPill label="Campaigns" value={section.campaigns.length} accent="blue" />
                  <MetricPill label="Ad Groups" value={adGroupCount} accent="green" />
                  <MetricPill label="Ads" value={adCount} accent="amber" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <MetaCampaignStructureSelector
          campaigns={section.campaigns}
          selectedCampaign={selectedCampaign}
          adSets={children}
          selectedAdSet={selectedChild}
          ads={ads}
          selectedAd={selectedAd}
          onCampaignSelect={selectCampaign}
          onAdSetSelect={selectChild}
          onAdSelect={selectAd}
          childLabel="Ad group"
          scrollChildren
        />
      </div>

      {detailsLoading ? (
        <div className="rounded-2xl border border-[#e2e8f0] bg-white px-5 py-4 text-sm text-[#64748b]">
          Refreshing the selected TikTok ad details…
        </div>
      ) : null}

      {selectedAd ? (
        <TikTokSelectedAdDetailsPanel
          campaignName={selectedCampaign?.name ?? "—"}
          adGroupName={selectedChild?.name ?? "—"}
          ad={selectedAd}
          detail={selectedAd.tiktokDetail ?? null}
          loading={detailsLoading}
          startDate={startDate}
          endDate={endDate}
          onDateRangeChange={onDateRangeChange}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-[#cbd5e1] bg-white px-5 py-16 text-center text-sm text-[#64748b]">
          Choose a TikTok ad to view its details, creative, and performance.
        </div>
      )}
    </section>
  );
}

function MetaAdsPreviewWorkspace({
  section,
  initialCampaignId,
  initialChildId,
  initialAdId,
  companyName,
  detailsLoading = false,
  onCampaignChange,
  onChildChange,
  onAdChange,
}: WorkspaceProps & { companyName?: string | null }) {
  const searchParams = useSearchParams();
  const {
    selectedCampaign,
    selectedChild,
    selectedAd,
    children,
    ads,
    selectCampaign,
    selectChild,
    selectAd,
  } = usePreviewSelection(
    section,
    initialCampaignId,
    onCampaignChange,
    initialChildId,
    initialAdId,
    onChildChange,
    onAdChange
  );
  const performance =
    selectedAd?.performance ?? selectedChild?.performance ?? selectedCampaign?.performance ?? null;
  const demographics =
    selectedAd?.demographics ?? selectedChild?.demographics ?? selectedCampaign?.demographics ?? [];
  const platformDistribution =
    selectedAd?.platformDistribution ??
    selectedChild?.platformDistribution ??
    selectedCampaign?.platformDistribution ??
    [];
  const adSetDetails = selectedChild?.details ?? [];
  const adDetails = selectedAd?.details ?? [];
  const creative = selectedAd?.creative ?? null;
  const previewPlacements = useMemo(
    () => buildMetaPreviewPlacements(selectedAd?.previewLinks ?? []),
    [selectedAd?.previewLinks]
  );
  const previewGalleryPlacements = useMemo(
    () => buildMetaPreviewPlacementGallery(previewPlacements),
    [previewPlacements]
  );
  const companyLabel = companyName?.trim() || section.title;
  const adSetCount = section.campaigns.reduce((count, campaign) => count + campaign.children.length, 0);
  const adCount = section.campaigns.reduce(
    (count, campaign) =>
      count + campaign.children.reduce((childCount, child) => childCount + child.ads.length, 0),
    0
  );
  const editHref = buildMetaEditDraftHref(searchParams, selectedCampaign?.id, selectedChild?.id, selectedAd?.id);
  const editDisabled = !selectedCampaign || !selectedChild || !selectedAd;
  const informationSections = [
    {
      key: "creative",
      title: "Creative details",
      subtitle:
        creative?.description ||
        "Primary ad copy, creative metadata, CTA, and destination details from Meta Ads Manager.",
      icon: <ImageIcon className="size-5" />,
      defaultOpen: true,
      fields: compactFields([
        detailField("Creative", getDetailFieldValue(adDetails, "Creative")),
        detailField("Call to action", getDetailFieldValue(adDetails, "Call to action")),
        detailField("Destination URL", creative?.linkUrl || getDetailFieldValue(adDetails, "Destination URL")),
      ]),
    },
    {
      key: "audience",
      title: "Audience targeting",
      subtitle: "Who this ad is configured to reach.",
      icon: <UsersIcon className="size-5" />,
      defaultOpen: false,
      fields: pickDetailFields(adSetDetails, [
        "Locations included",
        "Minimum age",
        "Age suggestion",
        "Gender",
        "Detailed targeting included",
        "Targeting expansion",
      ]),
    },
    {
      key: "schedule",
      title: "Schedule & delivery",
      subtitle: "Budget, timing, and delivery setup from the selected ad set.",
      icon: <CalendarDaysIcon className="size-5" />,
      defaultOpen: false,
      fields: pickDetailFields(adSetDetails, [
        "Budget",
        "Start date",
        "End date",
        "Delivery type",
        "Billing event",
        "Performance goal",
      ]),
    },
    {
      key: "placements",
      title: "Placement details",
      subtitle: "Where this ad is eligible to appear across Meta placements.",
      icon: <MonitorIcon className="size-5" />,
      defaultOpen: false,
      fields: pickDetailFields(adSetDetails, ["Placements", "Conversion location"]),
    },
  ];

  return (
    <section className="mx-auto max-w-[1360px] space-y-6 px-1 sm:px-2">
      <div className="rounded-[28px] border border-[#e7edf5] bg-white p-4 shadow-[0_20px_55px_rgba(15,23,42,0.06)] sm:p-5">
        <div className="rounded-[26px] border border-[#eef3f8] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-4">
              <MetaMark />
              <div className="min-w-0">
                <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-[#0f172a] sm:text-[2.15rem]">
                  Meta Ads Preview
                </h1>
                <p className="mt-2 max-w-4xl text-[1rem] leading-7 text-[#64748b]">
                  Review campaign setup, ad assets, and live preview from the Meta Ads hierarchy.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <MetricPill label="Campaigns" value={section.campaigns.length} accent="blue" />
                  <MetricPill label="Ad Sets" value={adSetCount} accent="green" />
                  <MetricPill label="Ads" value={adCount} accent="amber" />
                </div>
              </div>
            </div>
            {editDisabled ? (
              <button
                type="button"
                disabled
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#dbe3ec] bg-[#f8fafc] px-5 py-3 text-sm font-semibold text-[#94a3b8]"
                title="Select a campaign, ad set, and ad before editing"
              >
                <PencilIcon className="size-4" />
                Edit
              </button>
            ) : (
              <Link
                href={editHref}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#cfd9e6] bg-white px-5 py-3 text-sm font-semibold text-[#0f172a] shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-[#9db5d1] hover:bg-[#f8fbff] hover:shadow-[0_14px_26px_rgba(15,23,42,0.08)]"
              >
                <PencilIcon className="size-4" />
                Edit
              </Link>
            )}
          </div>
        </div>

        <MetaCampaignStructureSelector
          campaigns={section.campaigns}
          selectedCampaign={selectedCampaign}
          adSets={children}
          selectedAdSet={selectedChild}
          ads={ads}
          selectedAd={selectedAd}
          onCampaignSelect={selectCampaign}
          onAdSetSelect={selectChild}
          onAdSelect={selectAd}
        />

      </div>

      <div className="relative space-y-6" aria-busy={detailsLoading}>
        {detailsLoading ? (
          <div
            role="status"
            className="flex items-center gap-3 rounded-2xl border border-[#b9d4ff] bg-[#eff6ff] px-4 py-3 text-sm font-medium text-[#2456a6] shadow-[0_10px_28px_rgba(37,99,235,0.08)]"
          >
            <RefreshCwIcon className="size-4 animate-spin" />
            Retrieving data for the selected Meta ad…
          </div>
        ) : null}

        <div
          className={`space-y-6 transition-opacity duration-200 ${
            detailsLoading ? "pointer-events-none opacity-50" : "opacity-100"
          }`}
        >

          {children.length === 0 ? (
            <EmptyState message="No ad sets are available under the selected campaign." />
          ) : null}

            <PerformanceSection
              performance={performance}
              emptyMessage="No performance data was returned for the current Meta Ads selection."
            />

            <section id="ad-preview" className="scroll-mt-6 rounded-[28px] border border-[#e7edf5] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-6">
              <div>
                <h2 className="text-[1.8rem] font-semibold tracking-[-0.03em] text-[#0f172a]">
                  Ad Preview
                </h2>
                <p className="mt-2 text-[1rem] leading-7 text-[#64748b]">
                  See how your ad will appear across different placements.
                </p>
              </div>

              <div className="mt-7 grid gap-5 xl:grid-cols-3">
                {previewGalleryPlacements.map((placement) => (
                  <MetaAdPreviewCard
                    key={placement.key}
                    companyLabel={companyLabel}
                    campaignName={selectedCampaign?.name ?? "Campaign"}
                    creative={creative}
                    activePlacement={placement}
                  />
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-[#e7edf5] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-6">
              <h2 className="text-[1.8rem] font-semibold tracking-[-0.03em] text-[#0f172a]">
                Ad Information
              </h2>
              <div className="mt-4 overflow-hidden rounded-[24px] border border-[#e8eef5]">
                {informationSections.map((item, index) => (
                  <MetaInformationAccordionItem
                    key={item.key}
                    title={item.title}
                    subtitle={item.subtitle}
                    icon={item.icon}
                    defaultOpen={item.defaultOpen}
                    fields={item.fields}
                    bordered={index < informationSections.length - 1}
                  />
                ))}
              </div>
            </section>

            <DemographicSection
              rows={demographics}
              platformRows={platformDistribution}
              resultLabel={performance?.resultLabel ?? "Results"}
              emptyMessage="No demographic data was returned for the current Meta Ads selection."
            />

        </div>
      </div>

    </section>
  );
}

type MetaAccent = "rose" | "blue" | "green" | "violet" | "amber";
interface MetaPreviewPlacementDescriptor {
  key: string;
  label: string;
  description: string;
  url: string;
  previewUrl: string | null;
  publicPostUrl: string | null;
  linkKind: "publicPost" | "metaPreview";
  placementLabel: string;
  accent: MetaAccent;
}

function MetaCampaignStructureSelector({
  campaigns,
  selectedCampaign,
  adSets,
  selectedAdSet,
  ads,
  selectedAd,
  onCampaignSelect,
  onAdSetSelect,
  onAdSelect,
  childLabel = "Ad set",
  scrollChildren = false,
}: {
  campaigns: PreviewCampaignNode[];
  selectedCampaign: PreviewCampaignNode | null;
  adSets: PreviewAdGroupNode[];
  selectedAdSet: PreviewAdGroupNode | null;
  ads: PreviewAdNode[];
  selectedAd: PreviewAdNode | null;
  onCampaignSelect: (id: string) => void;
  onAdSetSelect: (id: string) => void;
  onAdSelect: (id: string) => void;
  childLabel?: "Ad set" | "Ad group";
  scrollChildren?: boolean;
}) {
  const [campaignsOpen, setCampaignsOpen] = useState(false);
  const campaignCanCollapse = campaigns.length > 1;
  const adsListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    adsListRef.current?.scrollTo({ top: 0 });
  }, [selectedAdSet?.id]);

  return (
    <div className="mt-5 overflow-hidden rounded-[24px] border border-[#dfe6f0] bg-[#fbfcff]">
      <div className="grid min-h-[390px] lg:grid-cols-[minmax(270px,0.9fr)_minmax(0,2.1fr)]">
        <aside className="border-b border-[#dfe6f0] p-4 sm:p-5 lg:border-b-0 lg:border-r">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#74809a]">
            Campaign structure
          </p>

          <Popover
            open={campaignCanCollapse ? campaignsOpen : false}
            onOpenChange={(nextOpen) => campaignCanCollapse && setCampaignsOpen(nextOpen)}
          >
            <PopoverTrigger asChild disabled={!campaignCanCollapse}>
              <button
                type="button"
                className={`flex w-full items-center gap-3 rounded-[16px] border border-[#bfd1ff] bg-[#f3f6ff] px-4 py-4 text-left transition ${
                  campaignCanCollapse
                    ? "cursor-pointer hover:border-[#86a8ff]"
                    : "cursor-default"
                }`}
                title={selectedCampaign?.name ?? undefined}
              >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#e5edff] text-[#2864ff]">
                <FolderIcon className="size-[1.1rem]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.92rem] font-semibold text-[#14204b]">
                  {selectedCampaign?.name ?? "Choose campaign"}
                </span>
                <span className="mt-0.5 block text-xs text-[#68738f]">
                  {adSets.length} {adSets.length === 1 ? childLabel.toLowerCase() : `${childLabel.toLowerCase()}s`} ·{" "}
                  {adSets.reduce((total, adSet) => total + adSet.ads.length, 0)} ads
                </span>
              </span>
              {campaignCanCollapse ? (
                <ChevronDownIcon className={`size-5 text-[#7d89a5] transition ${campaignsOpen ? "rotate-180" : ""}`} />
              ) : null}
              </button>
            </PopoverTrigger>

            {campaignCanCollapse ? (
              <PopoverContent
                id="meta-active-campaign-options"
                align="start"
                sideOffset={8}
                className="max-h-72 w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-[16px] border border-[#dce4f0] bg-white p-2 shadow-[0_18px_45px_rgba(15,23,42,0.14)]"
              >
                {campaigns.map((campaign) => (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => {
                      onCampaignSelect(campaign.id);
                      setCampaignsOpen(false);
                    }}
                    className={`w-full rounded-[12px] px-3 py-2.5 text-left text-sm font-medium transition ${
                      campaign.id === selectedCampaign?.id
                        ? "bg-[#eef3ff] text-[#1f4fc5]"
                        : "text-[#26324d] hover:bg-[#f7f9fc]"
                    }`}
                  >
                    {campaign.name}
                  </button>
                ))}
              </PopoverContent>
            ) : null}
          </Popover>

          <div className="mt-4 border-l-2 border-[#e1e7f0] pl-4">
            <div
              data-hierarchy-scroll={scrollChildren ? "true" : undefined}
              className={`space-y-2 ${scrollChildren ? "max-h-[260px] overflow-y-auto pr-2" : ""}`}
            >
              {adSets.map((adSet) => {
                const selected = adSet.id === selectedAdSet?.id;
                return (
                  <button
                    key={adSet.id}
                    type="button"
                    onClick={() => onAdSetSelect(adSet.id)}
                    className={`flex w-full items-center gap-3 rounded-[14px] border px-3 py-3 text-left transition ${
                      selected
                        ? "border-[#6991ff] bg-[#f2f5ff]"
                        : "border-transparent bg-transparent hover:border-[#dce4f0] hover:bg-white"
                    }`}
                  >
                    <span className={`flex size-9 shrink-0 items-center justify-center rounded-[11px] ${
                      selected ? "bg-[#e2ebff] text-[#2864ff]" : "bg-[#eef2f7] text-[#5d6b86]"
                    }`}>
                      <LayoutPanelLeftIcon className="size-[1.05rem]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#14204b]">{adSet.name}</span>
                      <span className="mt-0.5 block text-xs text-[#68738f]">
                        {adSet.ads.length} {adSet.ads.length === 1 ? "ad" : "ads"}
                      </span>
                    </span>
                    <ChevronRightIcon className="size-4 text-[#8792aa]" />
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="p-4 sm:p-5 lg:p-6">
          <div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#74809a]">
                Selected {childLabel.toLowerCase()}
              </p>
              <h2 className="mt-2 text-[1.3rem] font-semibold tracking-[-0.02em] text-[#14204b]">
                {selectedAdSet?.name ?? "No ad set selected"}
              </h2>
              <p className="mt-1 text-xs text-[#68738f]">
                {ads.length} {ads.length === 1 ? "ad" : "ads"} under this {childLabel.toLowerCase()}
              </p>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-[16px] border border-[#dfe6f0] bg-white">
            <div className="grid grid-cols-[minmax(0,1fr)_100px_24px] gap-3 bg-[#f4f6fa] px-4 py-3 text-[0.68rem] font-semibold text-[#74809a]">
              <span>Ad name</span>
              <span>Status</span>
              <span />
            </div>
            {ads.length > 0 ? (
              <div
                ref={adsListRef}
                className={ads.length > 3 ? "max-h-[183px] overflow-y-auto" : ""}
              >
                {ads.map((ad) => {
                  const selected = ad.id === selectedAd?.id;
                  const paused = isPausedStatus(ad.status);
                  return (
                    <button
                      key={ad.id}
                      type="button"
                      onClick={() => onAdSelect(ad.id)}
                      className={`grid min-h-[61px] w-full grid-cols-[minmax(0,1fr)_100px_24px] items-center gap-3 border-t border-[#e8edf4] px-4 py-3 text-left transition ${
                        selected ? "bg-[#f7f9ff]" : "bg-white hover:bg-[#fafbfe]"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-[#edf2ff] text-[#2864ff]">
                          <ImageIcon className="size-[1.05rem]" />
                        </span>
                        <span className="truncate text-sm font-semibold text-[#14204b]">{ad.name}</span>
                      </span>
                      <span className={`w-fit rounded-full px-2.5 py-1 text-[0.68rem] font-semibold ${
                        paused
                          ? "bg-[#fff1db] text-[#a05a00]"
                          : "bg-[#e6f7ef] text-[#15734e]"
                      }`}>
                        {paused ? "Paused" : "Active"}
                      </span>
                      <EllipsisVerticalIcon className="size-4 text-[#7d89a5]" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="px-5 py-8 text-sm text-[#68738f]">
                No ads were returned for the selected {childLabel.toLowerCase()}.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetaAdPreviewCard({
  companyLabel,
  campaignName,
  creative,
  activePlacement,
}: {
  companyLabel: string;
  campaignName: string;
  creative: PreviewAdNode["creative"] | null;
  activePlacement: MetaPreviewPlacementDescriptor | null;
}) {
  const props: MetaLocalPreviewTemplateProps = {
    companyLabel,
    campaignName,
    creative,
    placementKey: activePlacement?.key ?? "facebookFeed",
    placementExternalUrl: activePlacement?.publicPostUrl || activePlacement?.url || null,
    placementLabel: activePlacement?.placementLabel ?? "Facebook Feed",
  };

  return (
    <div className="rounded-[24px] border border-[#e1e8f0] bg-[#fbfdff] p-4 shadow-[0_10px_26px_rgba(15,23,42,0.035)] sm:p-5">
      <div className="mb-5 flex items-center gap-3">
        <MetaPlacementIcon placementKey={activePlacement?.key ?? "facebookFeed"} />
        <h3 className="text-[1.05rem] font-semibold text-[#0f172a]">
          {activePlacement?.placementLabel ?? "Facebook Feed"}
        </h3>
      </div>
      <div className="flex justify-center">
        {activePlacement?.key === "story" ? (
          <MetaStoryPreviewTemplate {...props} />
        ) : activePlacement?.key === "instagramFeed" ? (
          <MetaInstagramFeedPreviewTemplate {...props} />
        ) : (
          <MetaFacebookFeedPreviewTemplate {...props} />
        )}
      </div>
    </div>
  );
}

function MetaPlacementIcon({ placementKey }: { placementKey: string }) {
  if (placementKey === "instagramFeed") {
    return (
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#f7e8ff] text-[#e1306c] shadow-sm">
        <ImageIcon className="size-6" />
      </span>
    );
  }

  if (placementKey === "story") {
    return (
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#f3d9ff] text-[#c026d3] shadow-sm">
        <PlayIcon className="ml-0.5 size-6 fill-current" />
      </span>
    );
  }

  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#e8f1ff] text-[#1877f2] shadow-sm">
      <span className="font-sans text-[1.7rem] font-bold leading-none">f</span>
    </span>
  );
}

interface MetaLocalPreviewTemplateProps {
  companyLabel: string;
  campaignName: string;
  creative: PreviewAdNode["creative"] | null;
  placementKey: string;
  placementExternalUrl: string | null;
  placementLabel: string;
}

function MetaFacebookFeedPreviewTemplate({
  companyLabel,
  campaignName,
  creative,
  placementKey,
  placementExternalUrl,
}: MetaLocalPreviewTemplateProps) {
  const model = buildMetaLocalPreviewModel(companyLabel, campaignName, creative, placementKey, placementExternalUrl);
  const [textExpanded, setTextExpanded] = useState(false);

  return (
    <article className="mx-auto w-full max-w-[430px] overflow-hidden rounded-[2px] border border-[#dadde1] bg-white font-sans text-[#050505] shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
      <div className="flex items-center gap-2 px-3 pb-1 pt-3">
        <MetaAvatar label={companyLabel} sizeClassName="size-10" textClassName="text-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-5">{companyLabel}</p>
          <p className="text-[13px] leading-4 text-[#65676b]">Ad - Sponsored</p>
        </div>
        <EllipsisVerticalIcon className="size-5 text-[#050505]" />
        <XIcon className="size-5 text-[#050505]" />
      </div>

      <ExpandableMetaText
        text={model.bodyText}
        expanded={textExpanded}
        onToggle={() => setTextExpanded((current) => !current)}
        className="mx-3 mb-2 text-[14px] leading-[19px] text-[#050505]"
        collapsedLineClampClassName="[-webkit-line-clamp:3]"
        moreLabel="... see more"
        lessLabel="see less"
      />

      <MetaPreviewMedia
        media={model.media}
        headline={model.headline}
        className="aspect-[1/1] w-full bg-[#000]"
        imageClassName="h-full w-full object-contain"
      />

      <div className="flex items-center justify-between gap-3 border-b border-[#dadde1] bg-[#f0f2f5] px-3 py-3">
        <div className="min-w-0">
          <p className="text-[12px] uppercase leading-4 text-[#65676b]">{model.domainLabel}</p>
          <p className="line-clamp-2 text-[15px] font-semibold leading-5 text-[#050505]">{model.headline}</p>
        </div>
        <span className="shrink-0 rounded-md bg-[#e4e6eb] px-4 py-2 text-[14px] font-semibold leading-5 text-[#050505]">
          {model.callToAction}
        </span>
      </div>

      <div className="mx-3 grid grid-cols-2 border-t border-[#dadde1] py-1 text-[#65676b]">
        <button type="button" className="flex items-center justify-center gap-2 rounded-md py-2 text-[13px] font-semibold">
          <ThumbsUpIcon className="size-5" />
          Like
        </button>
        <button type="button" className="flex items-center justify-center gap-2 rounded-md py-2 text-[13px] font-semibold">
          <MessageCircleIcon className="size-5" />
          Comment
        </button>
      </div>
    </article>
  );
}

function MetaInstagramFeedPreviewTemplate({
  companyLabel,
  campaignName,
  creative,
  placementKey,
  placementExternalUrl,
}: MetaLocalPreviewTemplateProps) {
  const model = buildMetaLocalPreviewModel(companyLabel, campaignName, creative, placementKey, placementExternalUrl);
  const instagramName = normalizeInstagramHandle(companyLabel);
  const [captionExpanded, setCaptionExpanded] = useState(false);

  return (
    <article className="mx-auto w-full max-w-[390px] overflow-hidden rounded-[18px] border border-[#dbdbdb] bg-white font-sans text-[#000] shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
      <div className="flex items-center gap-3 px-3 py-2">
        <MetaAvatar label={companyLabel} sizeClassName="size-9" textClassName="text-xs" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-4">{instagramName}</p>
          <p className="text-[12px] leading-4">Ad</p>
        </div>
        <EllipsisVerticalIcon className="size-5" />
      </div>

      <MetaPreviewMedia
        media={model.media}
        headline={model.headline}
        className="min-h-[260px] w-full bg-[#000]"
        imageClassName="h-auto max-h-[585px] w-full object-contain"
      />

      <div className="flex items-center justify-between border-b border-[#efefef] px-4 py-3">
        <span className="text-[14px] font-semibold">{model.callToAction}</span>
        <ChevronRightIcon className="size-6" />
      </div>

      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-4">
          <HeartIcon className="size-6" />
          <MessageCircleIcon className="size-6" />
          <SendIcon className="size-6" />
        </div>
        <BookmarkIcon className="size-6" />
      </div>

      <div className="px-3 pb-4 text-[13px] leading-[18px] text-[#000]">
        <span className="font-semibold">{instagramName}</span>{" "}
        <ExpandableMetaText
          text={model.bodyText}
          expanded={captionExpanded}
          onToggle={() => setCaptionExpanded((current) => !current)}
          className="inline text-[13px] leading-[18px] text-[#000]"
          collapsedLineClampClassName="[-webkit-line-clamp:2]"
          moreLabel="more"
          lessLabel="less"
          inline
        />
      </div>
    </article>
  );
}

function MetaStoryPreviewTemplate({
  companyLabel,
  campaignName,
  creative,
  placementKey,
  placementExternalUrl,
}: MetaLocalPreviewTemplateProps) {
  const model = buildMetaLocalPreviewModel(companyLabel, campaignName, creative, placementKey, placementExternalUrl);
  const instagramName = normalizeInstagramHandle(companyLabel);
  const [isPlaying, setIsPlaying] = useState(true);
  const [textExpanded, setTextExpanded] = useState(false);

  return (
    <article className="relative mx-auto aspect-[9/16] w-full max-w-[360px] overflow-hidden rounded-[2px] bg-black font-sans text-white shadow-[0_18px_40px_rgba(15,23,42,0.16)]">
      <MetaPreviewMedia
        media={model.media}
        headline={model.headline}
        className="absolute inset-0 h-full w-full bg-[#dfe6dc]"
        imageClassName="h-full w-full object-cover"
      />
      <div className="absolute inset-x-0 top-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.46)_0%,rgba(0,0,0,0)_100%)] px-3 pb-14 pt-3">
        <div className="mb-3 grid grid-cols-4 gap-1">
          <span className="h-0.5 overflow-hidden rounded-full bg-white/35">
            <span
              className="block h-full origin-left bg-white"
              style={{
                animation: "metaStoryProgress 6s linear infinite",
                animationPlayState: isPlaying ? "running" : "paused",
              }}
            />
          </span>
          <span className="h-0.5 rounded-full bg-white/65" />
          <span className="h-0.5 rounded-full bg-white/65" />
          <span className="h-0.5 rounded-full bg-white/65" />
        </div>
        <div className="flex items-center gap-2">
          <MetaAvatar label={companyLabel} sizeClassName="size-8" textClassName="text-xs" />
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{instagramName}</p>
          <span className="text-[12px] text-white/80">Ad</span>
          <button
            type="button"
            onClick={() => setIsPlaying((current) => !current)}
            className="flex size-7 items-center justify-center rounded-full text-white"
            aria-label={isPlaying ? "Pause story preview" : "Play story preview"}
          >
            {isPlaying ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
          </button>
          <EllipsisVerticalIcon className="size-5" />
          <XIcon className="size-5" />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-12 max-h-[48%] overflow-y-auto bg-white/82 px-7 py-5 text-center text-[#050505] backdrop-blur-sm">
        <ExpandableMetaText
          text={model.bodyText}
          expanded={textExpanded}
          onToggle={() => setTextExpanded((current) => !current)}
          className="text-[14px] font-semibold leading-[19px] text-[#050505]"
          collapsedLineClampClassName="[-webkit-line-clamp:3]"
          moreLabel="more"
          lessLabel="less"
        />
        <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-[22px] leading-7 text-[#050505] shadow-[0_8px_20px_rgba(15,23,42,0.18)]">
          <Link2Icon className="size-5 text-[#1877f2]" />
          {model.callToAction}
        </span>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex h-12 items-center justify-between bg-black px-3">
        <span className="text-[12px] font-semibold">Ad</span>
        <div className="flex items-center gap-4">
          <HeartIcon className="size-6" />
          <MessageCircleIcon className="size-6" />
          <SendIcon className="size-6" />
        </div>
      </div>
    </article>
  );
}

function ExpandableMetaText({
  text,
  expanded,
  onToggle,
  className,
  collapsedLineClampClassName,
  moreLabel,
  lessLabel,
  inline = false,
}: {
  text: string;
  expanded: boolean;
  onToggle: () => void;
  className: string;
  collapsedLineClampClassName: string;
  moreLabel: string;
  lessLabel: string;
  inline?: boolean;
}) {
  const canExpand = text.length > 95 || text.includes("\n");
  const textClassName = expanded
    ? "whitespace-pre-wrap"
    : `whitespace-pre-wrap overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] ${collapsedLineClampClassName}`;
  const Wrapper = inline ? "span" : "div";

  return (
    <Wrapper className={className}>
      <span className={textClassName}>{text}</span>
      {canExpand ? (
        <>
          {" "}
          <button
            type="button"
            onClick={onToggle}
            className="font-normal text-[#65676b] underline-offset-2 hover:underline"
          >
            {expanded ? lessLabel : moreLabel}
          </button>
        </>
      ) : null}
    </Wrapper>
  );
}

interface MetaPreviewMediaModel {
  mediaType: "image" | "video";
  imageUrl: string | null;
  posterUrl: string | null;
  externalPostUrl: string | null;
  mediaWarning: string | null;
}

function MetaPreviewMedia({
  media,
  headline,
  className,
  imageClassName = "h-full w-full object-contain",
}: {
  media: MetaPreviewMediaModel;
  headline: string;
  className: string;
  imageClassName?: string;
}) {
  const posterUrl = media.posterUrl || media.imageUrl;
  const displayImageUrl = media.mediaType === "video" ? posterUrl : media.imageUrl || posterUrl;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {displayImageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={displayImageUrl} alt={headline} className={imageClassName} />
          {media.externalPostUrl ? (
            <a
              href={media.externalPostUrl}
              target="_blank"
              rel="noreferrer"
              className="absolute inset-0 flex items-center justify-center bg-black/10 text-white transition hover:bg-black/20"
              aria-label={media.mediaType === "video" ? "Open real video post" : "Open real post"}
            >
              <span className="flex size-16 items-center justify-center rounded-full bg-black/70 shadow-[0_12px_30px_rgba(0,0,0,0.35)] transition-transform hover:scale-105">
                <PlayIcon className="ml-1 size-8 fill-white" />
              </span>
              <span className="sr-only">{media.mediaWarning ?? "Open real post"}</span>
            </a>
          ) : null}
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#eef0f3] px-6 text-center text-[#64748b]">
          <p className="text-[18px] font-semibold leading-6">{headline}</p>
        </div>
      )}
    </div>
  );
}

function MetaAvatar({
  label,
  sizeClassName,
  textClassName,
}: {
  label: string;
  sizeClassName: string;
  textClassName: string;
}) {
  const profileLetter = label.slice(0, 1).toUpperCase() || "M";

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full border border-white/70 bg-[#123579] font-semibold text-white shadow-sm ${sizeClassName} ${textClassName}`}
    >
      {profileLetter}
    </span>
  );
}

function buildMetaLocalPreviewModel(
  companyLabel: string,
  campaignName: string,
  creative: PreviewAdNode["creative"] | null,
  placementKey: string,
  placementExternalUrl: string | null
) {
  const bodyText = creative?.body || "No primary text available for this ad.";
  const headline = creative?.title?.trim() || campaignName;
  const linkUrl = creative?.linkUrl?.trim() || null;
  const mediaType = creative?.mediaType ?? (creative?.videoSourceUrl || creative?.videoUrl ? "video" : "image");
  const imageUrl = creative?.imageUrl?.trim() || null;
  const posterUrl = creative?.posterUrl?.trim() || imageUrl || creative?.thumbnailUrl?.trim() || null;
  const externalPostUrl = placementExternalUrl || getMetaPlacementPostUrl(creative, placementKey);

  return {
    bodyText,
    headline,
    linkUrl,
    media: {
      mediaType,
      imageUrl,
      posterUrl,
      externalPostUrl,
      mediaWarning: creative?.mediaWarning?.trim() || null,
    } satisfies MetaPreviewMediaModel,
    domainLabel: getMetaDisplayDomain(linkUrl),
    callToAction: humanizeMetaCta(creative?.callToActionType) || "Book now",
    accountName: companyLabel,
  };
}

function getMetaPlacementPostUrl(creative: PreviewAdNode["creative"] | null, placementKey: string): string | null {
  const instagramUrl = creative?.instagramPermalinkUrl?.trim() || null;
  const facebookUrl = creative?.facebookPermalinkUrl?.trim() || null;
  const videoUrl = creative?.videoPermalinkUrl?.trim() || creative?.videoUrl?.trim() || null;

  if (placementKey === "instagramFeed" || placementKey === "story") {
    return instagramUrl || videoUrl || facebookUrl;
  }

  return facebookUrl || videoUrl || instagramUrl;
}

function normalizeInstagramHandle(label: string): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "instagram_ad";
}

function MetaInformationAccordionItem({
  title,
  subtitle,
  icon,
  fields,
  defaultOpen,
  bordered,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  fields: PreviewDetailField[];
  defaultOpen: boolean;
  bordered: boolean;
}) {
  return (
    <details open={defaultOpen} className={`group ${bordered ? "border-b border-[#e8eef5]" : ""}`}>
      <summary className="flex cursor-pointer items-center justify-between gap-4 bg-white px-4 py-4 transition hover:bg-[#fafcff] sm:px-5">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-[#edf4ff] text-[#3b82f6]">
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-[1.05rem] font-semibold text-[#0f172a]">{title}</p>
            <p className="truncate text-sm text-[#64748b]">{subtitle}</p>
          </div>
        </div>
        <ChevronDownIcon className="size-5 shrink-0 text-[#64748b] transition-transform group-open:rotate-180" />
      </summary>
      <div className="bg-[#fbfdff] px-4 py-4 sm:px-5">
        {fields.length > 0 ? (
          <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {fields.map((field) => (
              <div
                key={`${title}-${field.label}-${field.value}`}
                className={`min-w-0 rounded-[18px] border border-[#edf2f7] bg-white px-4 py-3 ${
                  shouldUseFullWidthInformationField(field, fields.length)
                    ? "md:col-span-2 xl:col-span-3"
                    : ""
                }`}
              >
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">
                  {field.label}
                </dt>
                <dd className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[1rem] leading-7 text-[#1f2937]">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="pt-2">
            <EmptyState message="No live details were returned for this section." />
          </div>
        )}
      </div>
    </details>
  );
}

function shouldUseFullWidthInformationField(
  field: PreviewDetailField,
  fieldCount: number
): boolean {
  if (fieldCount === 1) {
    return true;
  }

  return field.value.length > 120 || field.value.includes("\n");
}

function buildMetaPreviewPlacements(
  previewLinks: Array<{
    label: string;
    url: string;
    placementKey?: string | null;
    placementLabel?: string | null;
    previewUrl?: string | null;
    publicPostUrl?: string | null;
    linkKind?: "publicPost" | "metaPreview" | null;
  }>
): MetaPreviewPlacementDescriptor[] {
  const placements = new Map<string, MetaPreviewPlacementDescriptor>();

  previewLinks.forEach((link) => {
    const placementKey = link.placementKey || normalizePlacementKeyFromLabel(link.label);
    if (!placementKey || placementKey === "mobile" || placementKey === "reels" || placements.has(placementKey)) {
      return;
    }
    const previewUrl = link.previewUrl?.trim() || link.url.trim() || null;
    const publicPostUrl = link.publicPostUrl?.trim() || null;
    const linkKind = publicPostUrl ? "publicPost" : "metaPreview";

    placements.set(placementKey, {
      key: placementKey,
      label: link.placementLabel || defaultPlacementLabel(placementKey),
      description: defaultPlacementDescription(placementKey),
      url: publicPostUrl || previewUrl || link.url,
      previewUrl,
      publicPostUrl,
      linkKind,
      placementLabel: link.placementLabel || defaultPlacementLabel(placementKey),
      accent: placementAccent(placementKey),
    });
  });

  const order = ["facebookFeed", "instagramFeed", "story"];
  return Array.from(placements.values()).sort((left, right) => order.indexOf(left.key) - order.indexOf(right.key));
}

function buildMetaPreviewPlacementGallery(
  placements: MetaPreviewPlacementDescriptor[]
): MetaPreviewPlacementDescriptor[] {
  const placementsByKey = new Map(placements.map((placement) => [placement.key, placement]));
  return ["facebookFeed", "instagramFeed", "story"].map((key) => {
    const existing = placementsByKey.get(key);
    if (existing) {
      return existing;
    }

    return {
      key,
      label: defaultPlacementLabel(key),
      description: defaultPlacementDescription(key),
      url: "",
      previewUrl: null,
      publicPostUrl: null,
      linkKind: "metaPreview",
      placementLabel: defaultPlacementLabel(key),
      accent: placementAccent(key),
    };
  });
}

function normalizePlacementKeyFromLabel(label: string): string | null {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes("instagram") && normalized.includes("story")) {
    return "story";
  }
  if (normalized.includes("instagram")) {
    return "instagramFeed";
  }
  if (normalized.includes("mobile")) {
    return "mobile";
  }
  if (normalized.includes("reel")) {
    return "reels";
  }
  if (normalized.includes("feed")) {
    return "facebookFeed";
  }
  return null;
}

function defaultPlacementLabel(key: string): string {
  if (key === "instagramFeed") {
    return "Instagram Feed";
  }
  if (key === "story") {
    return "Story";
  }
  if (key === "reels") {
    return "Reels";
  }
  if (key === "mobile") {
    return "Mobile Feed";
  }
  return "Facebook Feed";
}

function defaultPlacementDescription(key: string): string {
  if (key === "instagramFeed") {
    return "Open how your ad appears across Instagram feed placements.";
  }
  if (key === "story") {
    return "Open how your ad appears in supported story placements.";
  }
  if (key === "reels") {
    return "Open how your ad appears in supported reels placements.";
  }
  if (key === "mobile") {
    return "Open how your ad appears on mobile Facebook feed placements.";
  }
  return "Open how your ad appears on desktop Facebook feed placements.";
}

function placementAccent(key: string): MetaAccent {
  if (key === "instagramFeed" || key === "story" || key === "reels") {
    return "violet";
  }
  if (key === "mobile") {
    return "green";
  }
  return "blue";
}

function compactFields(fields: Array<PreviewDetailField | null>): PreviewDetailField[] {
  return fields.filter((field): field is PreviewDetailField => Boolean(field));
}

function pickDetailFields(fields: PreviewDetailField[], labels: string[]): PreviewDetailField[] {
  return labels
    .map((label) => fields.find((field) => field.label === label) ?? null)
    .filter((field): field is PreviewDetailField => Boolean(field));
}

function getMetaDisplayDomain(url: string | null): string {
  if (!url) {
    return "meta preview";
  }

  try {
    return new URL(url).hostname.replace(/^www\./i, "").toUpperCase();
  } catch {
    return url.toUpperCase();
  }
}

function humanizeMetaCta(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value
    .toLowerCase()
    .split("_")
    .map((part) => (part ? `${part.slice(0, 1).toUpperCase()}${part.slice(1)}` : ""))
    .join(" ");
}

function GoogleAdsPreviewWorkspace({
  section,
  initialCampaignId,
  initialChildId,
  initialAdId,
  onCampaignChange,
  onChildChange,
  onAdChange,
}: WorkspaceProps) {
  const searchParams = useSearchParams();
  const {
    selectedCampaign,
    selectedChild,
    selectedAd,
    children,
    ads,
    selectCampaign,
    selectChild,
    selectAd,
  } = usePreviewSelection(
    section,
    initialCampaignId,
    onCampaignChange,
    initialChildId,
    initialAdId,
    onChildChange,
    onAdChange
  );
  const previewSlides = useMemo(() => buildGoogleAdPreviewVariations(selectedAd), [selectedAd]);
  const adGroupCount = section.campaigns.reduce((count, campaign) => count + campaign.children.length, 0);
  const adCount = section.campaigns.reduce(
    (count, campaign) =>
      count + campaign.children.reduce((childCount, adGroup) => childCount + adGroup.ads.length, 0),
    0
  );
  const selectedCampaignDetails = selectedCampaign?.details ?? [];
  const editHref = buildGoogleEditDraftHref(searchParams, selectedCampaign?.id, selectedChild?.id, selectedAd?.id);
  const campaignStatus = selectedCampaign?.status || "Unknown";
  const campaignOverviewFields = [
    { label: "Networks", value: getDetailFieldValue(selectedCampaignDetails, "Networks") },
    { label: "Budget", value: getDetailFieldValue(selectedCampaignDetails, "Budget") },
    { label: "Locations", value: getDetailFieldValue(selectedCampaignDetails, "Locations") },
    { label: "Languages", value: getDetailFieldValue(selectedCampaignDetails, "Languages") },
    { label: "Channel", value: getDetailFieldValue(selectedCampaignDetails, "Channel") },
    { label: "Serving status", value: getDetailFieldValue(selectedCampaignDetails, "Serving Status") },
    { label: "Bidding strategy", value: getDetailFieldValue(selectedCampaignDetails, "Bidding Strategy") },
    { label: "Start date", value: getDetailFieldValue(selectedCampaignDetails, "Start Date") },
    { label: "End date", value: getDetailFieldValue(selectedCampaignDetails, "End Date") },
    ...buildDifferingGoogleStatusFields(campaignStatus, [
      { label: "Ad group", value: selectedChild?.status },
      { label: "Ad", value: selectedAd?.status },
    ]),
  ];
  return (
    <section className="w-full space-y-6">
      <div className="rounded-[18px] border border-[#E2E8F0] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-4">
              <GoogleMark />
              <div className="min-w-0">
                <h2 className="break-words text-[26px] font-semibold leading-tight text-[#1f2937] sm:text-[28px]">
                  Google Ads Preview
                </h2>
                <p className="mt-1.5 text-[15px] leading-6 text-[#64748b]">
                  Review campaign setup, ad assets, and live search preview from the Google Ads hierarchy.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <MetricPill label="Campaigns" value={section.campaigns.length} accent="blue" />
              <MetricPill label="Ad Groups" value={adGroupCount} accent="green" />
              <MetricPill label="Ads" value={adCount} accent="amber" />
            </div>
          </div>
          <Link
            href={editHref}
            aria-disabled={!selectedCampaign || !selectedChild || !selectedAd}
            className={`inline-flex h-9 shrink-0 self-start items-center justify-center gap-1.5 rounded-[10px] border px-3 text-xs font-medium transition ${
              selectedCampaign && selectedChild && selectedAd
                ? "border-[#cbd5e1] bg-white text-[#334155] hover:border-[#94a3b8] hover:bg-[#f8fafc] hover:text-[#0f172a]"
                : "pointer-events-none border-[#e2e8f0] bg-[#f8fafc] text-[#94a3b8]"
            }`}
          >
            <PencilIcon className="size-3.5" />
            Edit
          </Link>
        </div>
      </div>


      <div className="grid min-w-0 gap-4 xl:grid-cols-3">
        <SelectionPicker
          title="Campaign"
          icon={<FolderIcon className="size-4" />}
          items={section.campaigns}
          selectedId={selectedCampaign?.id ?? ""}
          selectedLabel={selectedCampaign?.name ?? "Choose campaign"}
          onSelect={selectCampaign}
          showOnlyNotableStatus
          size="comfortable"
        />
        <SelectionPicker
          title="Ad Group"
          icon={<LayoutPanelLeftIcon className="size-4" />}
          items={children}
          selectedId={selectedChild?.id ?? ""}
          selectedLabel={selectedChild?.name ?? "Choose ad group"}
          onSelect={selectChild}
          emptyMessage="No ad groups were returned for the selected campaign."
          showOnlyNotableStatus
          size="comfortable"
        />
        <SelectionPicker
          title="Ad"
          icon={<MegaphoneIcon className="size-4" />}
          items={ads}
          selectedId={selectedAd?.id ?? ""}
          selectedLabel={selectedAd?.name ?? "Choose ad"}
          onSelect={selectAd}
          emptyMessage="No ads were returned for the selected ad group."
          showOnlyNotableStatus
          size="comfortable"
        />
      </div>

      {children.length === 0 ? <EmptyState message="No ad groups are available under the selected campaign." /> : null}

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(440px,480px)] 2xl:grid-cols-[minmax(0,1fr)_500px]">
        <div className="min-w-0 space-y-6">
          <div className="google-preview-sticky-panel xl:hidden">
            <GoogleSearchPreviewPanel
              key={`mobile:${selectedAd?.id ?? "empty"}`}
              slides={previewSlides}
              externalPreviewUrl={selectedAd?.previewLinks?.[0]?.url ?? null}
              context={{
                campaign: selectedCampaign,
                adGroup: selectedChild,
                ad: selectedAd,
              }}
            />
          </div>

          <GoogleSectionCard
            title="Campaign Overview"
            subtitle="Live metadata for the selected campaign."
            icon={<BarChart3Icon className="size-6" />}
            badge={campaignStatus}
            badgeTone={isGoogleStatusActive(campaignStatus) ? "green" : "slate"}
          >
            <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {campaignOverviewFields.map((field) => (
                <div
                  key={field.label}
                  className="min-w-0 rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2.5"
                >
                  <dt className="text-[12px] font-medium uppercase tracking-[0.06em] text-[#64748b]">{field.label}</dt>
                  <dd className="mt-1.5 break-words text-[14px] font-semibold leading-5 text-[#0f172a]" title={field.value || "Not available"}>
                    {field.value || "Not available"}
                  </dd>
                </div>
              ))}
            </dl>
          </GoogleSectionCard>

          <GoogleSectionCard
            title="Ad Content"
            subtitle="Responsive Search Ad assets from the selected ad."
            icon={<FileTextIcon className="size-6" />}
          >
            <div className="space-y-5">
              <div>
                <p className="text-[12px] font-semibold text-[#64748b]">Final URL</p>
                <div className="mt-2 flex items-center justify-between gap-3 rounded-[16px] border border-[#E2E8F0] bg-white px-4 py-3">
                  <p className="min-w-0 break-all text-[14px] text-[#1f2937]">
                    {selectedAd?.finalUrl || "No final URL available"}
                  </p>
                  {selectedAd?.finalUrl ? (
                    <a
                      href={selectedAd.finalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-[#5f6368] transition hover:text-[#1a73e8]"
                      aria-label="Open final URL"
                    >
                      <ExternalLinkIcon className="size-6" />
                    </a>
                  ) : null}
                </div>
              </div>

              <div>
                <p className="text-[12px] font-semibold text-[#64748b]">Display Path</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[14px] text-[#475569]">
                  <span className="rounded-full bg-[#F8FAFC] px-3 py-1.5">{getDisplayDomain(selectedAd)}</span>
                  {(selectedAd?.displayPathParts ?? []).length > 0 ? (
                    selectedAd!.displayPathParts!.map((part, index) => (
                      <div key={`${part}-${index}`} className="flex items-center gap-2">
                        <span className="text-[#94a3b8]">/</span>
                        <span className="rounded-full bg-[#EEF5FF] px-3 py-1.5 font-medium text-[#1A73E8]">{part}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-sm text-[#94a3b8]">No display path</span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-[12px] font-semibold text-[#64748b]">
                  Headlines {selectedAd?.headlines?.length ?? 0}/15
                </p>
                <HeadlineGrid items={selectedAd?.headlines?.map((headline) => headline.text) ?? []} />
              </div>

              <div>
                <p className="text-[12px] font-semibold text-[#64748b]">
                  Descriptions {selectedAd?.descriptions?.length ?? 0}/4
                </p>
                <DescriptionList items={selectedAd?.descriptions?.map((description) => description.text) ?? []} />
              </div>

              <div>
                <p className="text-[12px] font-semibold text-[#64748b]">Keywords</p>
                <div className="mt-2">
                  <GoogleKeywordList keywords={selectedAd?.keywords ?? []} />
                </div>
              </div>
            </div>
          </GoogleSectionCard>

          <GoogleSectionCard
            title="Assets"
            subtitle="Images, business name, and business logo attached to the selected ad."
            icon={<ImageIcon className="size-6" />}
          >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                <p className="text-[12px] font-semibold text-[#64748b]">Images</p>
                <div className="mt-2 rounded-[16px] border border-dashed border-[#cfd8e3] bg-[#fbfcfe] p-4">
                  <ImageGrid images={selectedAd?.images ?? []} />
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-[12px] font-semibold text-[#64748b]">Business Name</p>
                  <div className="mt-2">
                    <ValueBox value={selectedAd?.businessName || "Not available"} />
                  </div>
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-[#64748b]">Business Logo</p>
                  <div className="mt-2">
                    {selectedAd?.businessLogoUrl ? (
                      <div className="flex items-center gap-3 rounded-[16px] border border-[#E2E8F0] bg-white px-4 py-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={selectedAd.businessLogoUrl}
                          alt={selectedAd.businessName || "Business logo"}
                          className="size-12 rounded-xl object-cover"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#111827]">
                            {selectedAd.businessName || "Business logo"}
                          </p>
                          <p className="text-sm text-[#64748b]">Attached business logo</p>
                        </div>
                      </div>
                    ) : (
                      <ValueBox value="Not available" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </GoogleSectionCard>

          <GoogleSectionCard
            title="Site Links"
            subtitle="Sitelink assets attached through customer, campaign, or ad group scope."
            icon={<Link2Icon className="size-6" />}
          >
            <SitelinkGrid items={selectedAd?.sitelinks ?? []} />
          </GoogleSectionCard>
        </div>

        <div className="hidden min-w-0 self-start xl:sticky xl:top-6 xl:block">
          <GoogleSearchPreviewPanel
            key={`desktop:${selectedAd?.id ?? "empty"}`}
            slides={previewSlides}
            externalPreviewUrl={selectedAd?.previewLinks?.[0]?.url ?? null}
            context={{
              campaign: selectedCampaign,
              adGroup: selectedChild,
              ad: selectedAd,
            }}
          />
        </div>
      </div>
    </section>
  );
}

function GoogleSectionCard({
  title,
  subtitle,
  icon,
  badge,
  badgeTone = "slate",
  children,
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  badge?: string;
  badgeTone?: "slate" | "green";
  children: ReactNode;
}) {
  const badgeClassName =
    badgeTone === "green"
      ? "border-[#ccebd5] bg-[#effaf2] text-[#1f9d47]"
      : "border-[#e5e7eb] bg-[#f8fafc] text-[#475569]";

  return (
    <section className="rounded-[16px] border border-[#E2E8F0] bg-white p-5 shadow-[0_8px_20px_rgba(15,23,42,0.035)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-[11px] border border-[#dbe7ff] bg-[#edf4ff] text-[#1A73E8] [&_svg]:size-5">
            {icon}
          </div>
          <div>
            <h3 className="text-[22px] font-semibold leading-tight text-[#0f172a]">{title}</h3>
            {subtitle ? <p className="mt-1 text-[14px] leading-5 text-[#64748b]">{subtitle}</p> : null}
          </div>
        </div>
        {badge ? (
          <span className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${badgeClassName}`}>
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function HeadlineGrid({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <div className="mt-2"><ValueBox value="No headlines returned" /></div>;
  }

  return (
    <div className="mt-2 grid gap-3 md:grid-cols-3">
      {items.map((item, index) => (
        <div
          key={`${item}-${index}`}
          className="grid min-h-[72px] grid-cols-[36px_minmax(0,1fr)] overflow-hidden rounded-[14px] border border-[#E2E8F0] bg-white"
        >
          <div className="flex items-center justify-center border-r border-[#E2E8F0] bg-[#F8FAFC] text-[13px] font-medium text-[#64748b]">
            {index + 1}
          </div>
          <div className="flex items-center px-4 py-3 text-[14px] text-[#1f2937]">{item}</div>
        </div>
      ))}
    </div>
  );
}

function DescriptionList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <div className="mt-2"><ValueBox value="No descriptions returned" /></div>;
  }

  return (
    <div className="mt-2 space-y-3">
      {items.map((item, index) => (
        <div
          key={`${item}-${index}`}
          className="grid grid-cols-[36px_minmax(0,1fr)] overflow-hidden rounded-[14px] border border-[#E2E8F0] bg-white"
        >
          <div className="flex items-center justify-center border-r border-[#E2E8F0] bg-[#F8FAFC] text-[13px] font-medium text-[#64748b]">
            {index + 1}
          </div>
          <div className="px-4 py-3 text-[14px] leading-6 text-[#1f2937]">{item}</div>
        </div>
      ))}
    </div>
  );
}

function GoogleKeywordList({ keywords }: { keywords: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleKeywords = expanded ? keywords : keywords.slice(0, 10);

  if (keywords.length === 0) {
    return <ValueBox value="No enabled keywords returned" />;
  }

  return (
    <div>
      <p className="text-[13px] text-[#64748b]">Showing top 10 of {keywords.length} keywords</p>
      <div className="mt-3 flex flex-wrap gap-2.5">
        {visibleKeywords.map((keyword, index) => (
          <div
            key={`${keyword}-${index}`}
            className="inline-flex items-center rounded-[14px] border border-[#d8e0ea] bg-white px-3 py-2 text-sm text-[#334155] shadow-[0_4px_12px_rgba(15,23,42,0.03)]"
          >
            {keyword}
          </div>
        ))}
      </div>

      {keywords.length > 10 ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-[#d7dee7] bg-[#f8fbff] px-4 py-2 text-sm font-medium text-[#2563eb] transition hover:border-[#93c5fd] hover:bg-[#eff6ff]"
          >
            {expanded ? "Show less" : "Show all keywords"}
            <ChevronDownIcon className={`size-4 transition ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SitelinkGrid({
  items,
}: {
  items: Array<{
    id: string;
    linkText: string;
    description1?: string | null;
    description2?: string | null;
    finalUrl?: string | null;
  }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? items : items.slice(0, 8);

  if (items.length === 0) {
    return <ValueBox value="No sitelinks available" />;
  }

  return (
    <div>
      <div className="grid gap-2.5 lg:grid-cols-2">
        {visibleItems.map((item) => (
          <a
            key={item.id}
            href={item.finalUrl || "#"}
            target={item.finalUrl ? "_blank" : undefined}
            rel={item.finalUrl ? "noreferrer" : undefined}
            className="flex h-full min-h-[104px] flex-col justify-between rounded-[12px] border border-[#E2E8F0] bg-white px-3.5 py-3 transition hover:border-[#bfdbfe]"
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-[#1A73E8]">{item.linkText}</p>
                <p className="mt-1.5 overflow-hidden text-[14px] leading-6 text-[#4b5563] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                  {[item.description1, item.description2].filter(Boolean).join(" ") || "No sitelink description available"}
                </p>
              </div>
              <ExternalLinkIcon className="mt-0.5 size-4 shrink-0 text-[#64748b]" />
            </div>
          </a>
        ))}
      </div>

      {items.length > 8 ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex items-center gap-2 rounded-full border border-[#d7dee7] bg-[#f8fbff] px-4 py-2 text-sm font-medium text-[#2563eb] transition hover:border-[#93c5fd] hover:bg-[#eff6ff]"
          >
            {expanded ? "Show less" : "Show all site links"}
            <ChevronDownIcon className={`size-4 transition ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function GoogleSearchPreviewPanel({
  slides,
  externalPreviewUrl,
  context,
}: {
  slides: GooglePreviewSlide[];
  externalPreviewUrl: string | null;
  context: GoogleFullPreviewContext;
}) {
  const [index, setIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState<"next" | "previous">("next");
  const [showFullPreview, setShowFullPreview] = useState(false);
  const safeIndex = Math.min(index, Math.max(slides.length - 1, 0));
  const slide = slides[safeIndex] ?? null;
  const hasPreview = Boolean(slide);
  const maxVisibleDots = 5;
  const visibleDotCount = Math.min(slides.length, maxVisibleDots);
  const dotWindowStart = Math.max(0, Math.min(safeIndex - Math.floor(maxVisibleDots / 2), slides.length - visibleDotCount));
  const visibleDotIndexes = Array.from({ length: visibleDotCount }, (_, offset) => dotWindowStart + offset);

  function goToPreview(nextIndex: number) {
    const clampedIndex = Math.max(0, Math.min(slides.length - 1, nextIndex));
    if (clampedIndex === safeIndex) {
      return;
    }

    setSlideDirection(clampedIndex > safeIndex ? "next" : "previous");
    setIndex(clampedIndex);
  }

  return (
    <>
    <section className="min-w-0 rounded-[16px] border border-[#E2E8F0] bg-white px-4 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)] sm:rounded-[18px] sm:px-6 sm:py-6">
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex items-start gap-2.5 sm:gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-[#dbe3ef] bg-[#f8fbff] text-[#2563eb] shadow-[0_8px_18px_rgba(15,23,42,0.045)] sm:size-11 sm:rounded-[12px]">
            <SmartphoneIcon className="size-4 sm:size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2.5 sm:gap-3">
              <div>
                <h3 className="text-[18px] font-semibold text-[#0f172a] sm:text-[28px]">Preview</h3>
                <p className="mt-0.5 max-w-[380px] text-[11px] leading-4 text-[#64748b] sm:mt-1 sm:text-[15px] sm:leading-6">
                  See how your ad may appear on Google Search results.
                </p>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    if (hasPreview) {
                      setShowFullPreview(true);
                    }
                  }}
                  disabled={!hasPreview}
                  title={hasPreview ? "Open full preview" : "Full preview is not available for this ad."}
                  className="inline-flex h-8 items-center justify-center rounded-[9px] border border-[#2563eb] bg-white px-3 text-xs font-medium text-[#2563eb] transition hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:border-[#cbd5e1] disabled:text-[#94a3b8] disabled:hover:bg-white sm:h-9 sm:rounded-[10px] sm:px-3.5 sm:text-sm"
                >
                  Full Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-[14px] bg-[#fbfcfe] px-2 py-3 sm:mt-5 sm:rounded-[16px] sm:px-5 sm:py-5">
        {slide ? (
          <div
            key={slide.id}
            className="google-preview-slide-motion flex justify-center"
            data-direction={slideDirection}
          >
            <GoogleMobilePreviewCard slide={slide} />
          </div>
        ) : (
          <div className="rounded-[28px] border border-dashed border-[#cfd8e3] bg-[#fbfcfe] px-6 py-10">
            <EmptyState message="No Google preview was returned for the current selection." />
          </div>
        )}
      </div>

      {slide && slides.length > 1 ? (
        <div className="mx-auto mt-3 max-w-[300px] sm:mt-5 sm:max-w-[340px]">
          <div className="flex items-center justify-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => goToPreview(safeIndex - 1)}
              disabled={safeIndex === 0}
              className="flex size-8 items-center justify-center rounded-full border border-[#d7dbe3] bg-white text-[#7b8794] shadow-[0_6px_14px_rgba(15,23,42,0.05)] transition hover:border-[#aecbfa] disabled:cursor-not-allowed disabled:opacity-40 sm:size-10"
              aria-label="Previous preview"
            >
              <ChevronLeftIcon className="size-3.5 sm:size-4" />
            </button>
            <div className="flex items-center gap-2.5 sm:gap-3">
              {visibleDotIndexes.map((dotIndex) => (
                <button
                  key={dotIndex}
                  type="button"
                  onClick={() => goToPreview(dotIndex)}
                  className={`rounded-full transition-all ${
                    dotIndex === safeIndex ? "size-2.5 bg-[#2563eb]" : "size-2 bg-[#d6dbe3]"
                  }`}
                  aria-label={`Go to preview ${dotIndex + 1}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => goToPreview(safeIndex + 1)}
              disabled={safeIndex >= slides.length - 1}
              className="flex size-8 items-center justify-center rounded-full border border-[#d7dbe3] bg-white text-[#7b8794] shadow-[0_6px_14px_rgba(15,23,42,0.05)] transition hover:border-[#aecbfa] disabled:cursor-not-allowed disabled:opacity-40 sm:size-10"
              aria-label="Next preview"
            >
              <ChevronRightIcon className="size-3.5 sm:size-4" />
            </button>
          </div>

          <p className="mt-2 text-center text-[11px] font-medium text-[#64748b] sm:mt-2.5 sm:text-[12px]">
            Preview {safeIndex + 1} of {slides.length}
          </p>
        </div>
      ) : null}

      <p className="mx-auto mt-5 hidden max-w-[420px] text-center text-[13px] leading-6 text-[#5f6368] sm:block">
        This preview shows how your ad may appear on Google Search results across supported devices.
      </p>
    </section>
    {showFullPreview ? (
      <GoogleFullPreviewModal
        slides={slides}
        externalPreviewUrl={externalPreviewUrl}
        context={context}
        onClose={() => setShowFullPreview(false)}
      />
    ) : null}
    </>
  );
}

interface GoogleFullPreviewContext {
  campaign: PreviewCampaignNode | null;
  adGroup: PreviewAdGroupNode | null;
  ad: PreviewAdNode | null;
}

function GoogleFullPreviewModal({
  slides,
  externalPreviewUrl,
  context,
  onClose,
}: {
  slides: GooglePreviewSlide[];
  externalPreviewUrl: string | null;
  context: GoogleFullPreviewContext;
  onClose: () => void;
}) {
  const pageSize = 10;
  const [pageIndex, setPageIndex] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const totalPages = Math.max(Math.ceil(slides.length / pageSize), 1);
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const pageStart = safePageIndex * pageSize;
  const visibleSlides = slides.slice(pageStart, pageStart + pageSize);
  const pageEnd = Math.min(pageStart + visibleSlides.length, slides.length);
  const hasPreviewData = slides.length > 0;
  const campaignStatus = context.campaign?.status || "Unknown";
  const isCampaignActive = /enabled|active/i.test(campaignStatus);
  const finalUrlHost = context.ad?.finalUrl ? getDisplayDomain(context.ad) : slides[0]?.displayDomain ?? "Not available";

  function goToPreviousPage() {
    setPageIndex((current) => Math.max(0, current - 1));
  }

  function goToNextPage() {
    setPageIndex((current) => Math.min(totalPages - 1, current + 1));
  }

  useEffect(() => {
    const modal = modalRef.current;
    const firstButton = modal?.querySelector<HTMLButtonElement>("button");
    firstButton?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") {
        setPageIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (event.key === "ArrowRight") {
        setPageIndex((current) => Math.min(totalPages - 1, current + 1));
        return;
      }
      if (event.key !== "Tab" || !modal) {
        return;
      }

      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, totalPages]);

  return (
    <div className="fixed inset-0 z-50 bg-[#f8fafc]/95 p-3 backdrop-blur-sm sm:p-4">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-full-preview-title"
        className="mx-auto flex h-full max-h-[calc(100vh-1.5rem)] w-full max-w-[1800px] flex-col overflow-hidden rounded-[22px] border border-[#E2E8F0] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.18)] sm:max-h-[calc(100vh-2rem)]"
      >
        <header className="flex flex-col gap-4 border-b border-[#E2E8F0] px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-8">
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-[16px] border border-[#dbe3ef] bg-[#f8fbff] text-[#2563eb]">
              <SmartphoneIcon className="size-6" />
            </div>
            <div className="min-w-0">
              <h2 id="google-full-preview-title" className="text-2xl font-semibold text-[#0f172a]">
                Full Preview
              </h2>
              <p className="mt-1 text-sm text-[#64748b]">
                Synced Google Ads details and search previews for the selected ad.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[#d7dee7] bg-white px-4 py-2.5 text-sm font-medium text-[#0f172a] transition hover:border-[#93c5fd] hover:text-[#2563eb]"
            aria-label="Close full preview"
          >
            <XIcon className="size-4" />
            Close
          </button>
        </header>

        <div className="flex-1 overflow-auto bg-white px-5 py-5 sm:px-8">
          <div className="rounded-[16px] border border-[#E2E8F0] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
            <div className="grid divide-y divide-[#E2E8F0] lg:grid-cols-[1fr_1.5fr_1fr_1.15fr_1.15fr_1.25fr_1fr] lg:divide-x lg:divide-y-0">
              <GoogleFullPreviewMetaItem
                icon={<RefreshCwIcon className="size-5" />}
                label="Sync source"
                value="Synced to Google Ads"
                helper="Live data from your campaign"
                accent="blue"
              />
              <GoogleFullPreviewMetaItem
                icon={<MonitorIcon className="size-5" />}
                label="Campaign Name"
                value={context.campaign?.name || "Not available"}
              />
              <GoogleFullPreviewMetaItem
                icon={<span className={`size-2.5 rounded-full ${isCampaignActive ? "bg-[#34a853]" : "bg-[#94a3b8]"}`} />}
                label="Campaign Status"
                value={campaignStatus}
              />
              <GoogleFullPreviewMetaItem
                icon={<UsersIcon className="size-5" />}
                label="Ad Group"
                value={context.adGroup?.name || "Not available"}
              />
              <GoogleFullPreviewMetaItem
                icon={<Link2Icon className="size-5" />}
                label="Final URL"
                value={finalUrlHost}
              />
              <GoogleFullPreviewMetaItem
                icon={<CheckIcon className="size-5" />}
                label="Sync Status"
                value="Synced from Google Ads"
                accent="green"
              />
              <GoogleFullPreviewMetaItem
                icon={<Clock3Icon className="size-5" />}
                label="Last synced"
                value="Current fetch"
              />
            </div>
          </div>

          {hasPreviewData ? (
            <>
              <div className="mt-6 overflow-x-auto pb-4">
                <div className="grid min-w-[1580px] grid-cols-5 gap-4">
                  {visibleSlides.map((slide, slideIndex) => (
                    <div
                      key={slide.id}
                      aria-label={`Preview variation ${pageStart + slideIndex + 1}`}
                      className="rounded-[12px] border border-[#E2E8F0] bg-white px-4 pb-4 pt-3 shadow-[0_12px_26px_rgba(15,23,42,0.04)]"
                    >
                      <div className="mb-3 flex min-h-8 items-center gap-2">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] border border-[#bfdbfe] bg-[#eff6ff] text-sm font-semibold text-[#2563eb]">
                          {pageStart + slideIndex + 1}
                        </span>
                        <p className="min-w-0 truncate text-sm font-semibold text-[#1f2937]">{slide.searchQuery}</p>
                      </div>
                      <GoogleMobilePreviewCard slide={slide} compact />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-center gap-5">
                <button
                  type="button"
                  onClick={goToPreviousPage}
                  disabled={safePageIndex === 0}
                  className="flex size-10 items-center justify-center rounded-full border border-[#d7dbe3] bg-white text-[#7b8794] shadow-[0_8px_20px_rgba(15,23,42,0.06)] transition hover:border-[#aecbfa] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Previous preview group"
                >
                  <ChevronLeftIcon className="size-5" />
                </button>
                <div className="flex items-center gap-2">
                  {Array.from({ length: totalPages }).map((_, dotIndex) => (
                    <button
                      key={dotIndex}
                      type="button"
                      onClick={() => setPageIndex(dotIndex)}
                      className={`rounded-full transition-all ${
                        dotIndex === safePageIndex ? "size-3 bg-[#2563eb]" : "size-2.5 bg-[#cbd5e1]"
                      }`}
                      aria-label={`Go to preview group ${dotIndex + 1}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={goToNextPage}
                  disabled={safePageIndex >= totalPages - 1}
                  className="flex size-10 items-center justify-center rounded-full border border-[#d7dbe3] bg-white text-[#7b8794] shadow-[0_8px_20px_rgba(15,23,42,0.06)] transition hover:border-[#aecbfa] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Next preview group"
                >
                  <ChevronRightIcon className="size-5" />
                </button>
                <p className="min-w-[170px] text-center text-sm font-medium text-[#64748b]">
                  {hasPreviewData
                    ? `Showing ${pageStart + 1}-${pageEnd} of ${slides.length} previews`
                    : "Showing 0 of 0 previews"}
                </p>
              </div>
            </>
          ) : (
            <div className="mt-8 rounded-[20px] border border-dashed border-[#cbd5e1] bg-white px-6 py-12 text-center text-[#64748b]">
              No preview data available for this ad.
            </div>
          )}
          {externalPreviewUrl ? (
            <div className="mt-3 flex justify-center">
              <a
                href={externalPreviewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[#d7dee7] bg-white px-4 py-2.5 text-sm font-medium text-[#0f172a] transition hover:border-[#2563eb] hover:text-[#2563eb]"
              >
                Open Google preview
                <ExternalLinkIcon className="size-4" />
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GoogleFullPreviewMetaItem({
  icon,
  label,
  value,
  helper,
  accent = "slate",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper?: string;
  accent?: "slate" | "blue" | "green";
}) {
  const iconTone =
    accent === "green"
      ? "bg-[#f0fdf4] text-[#16a34a]"
      : accent === "blue"
        ? "bg-[#eef5ff] text-[#2563eb]"
        : "bg-white text-[#334155]";
  const valueTone = accent === "green" ? "text-[#166534]" : accent === "blue" ? "text-[#2563eb]" : "text-[#0f172a]";

  return (
    <div className="flex min-w-0 items-center gap-4 px-5 py-4">
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${iconTone}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-[#64748b]">{label}</p>
        <p className={`mt-1 truncate text-[14px] font-semibold leading-5 ${valueTone}`}>{value}</p>
        {helper ? <p className="mt-0.5 truncate text-xs text-[#64748b]">{helper}</p> : null}
      </div>
    </div>
  );
}

function GoogleMobilePreviewCard({
  slide,
  fullSize = false,
  compact = false,
}: {
  slide: GooglePreviewSlide;
  fullSize?: boolean;
  compact?: boolean;
}) {
  const searchTabs = compact ? ["All", "Images", "News", "Maps", "Videos", "Shopping"] : ["All", "Images", "News", "Videos", "Maps", "More"];
  const businessLabel = slide.businessName || slide.displayDomain;
  const displayUrlLabel = slide.displayPath
    ? `${slide.displayDomain} / ${slide.displayPath}`
    : slide.displayDomain;
  const maxWidthClass = fullSize ? "max-w-[420px]" : compact ? "max-w-[280px]" : "max-w-[324px]";
  const outerSizeClass = fullSize
    ? "max-w-[560px]"
    : compact
      ? "max-w-[280px]"
      : "h-[414px] max-w-[324px] sm:h-auto sm:max-w-[390px]";
  const frameScaleClass = !fullSize && !compact ? "origin-top scale-[0.62] sm:scale-100" : "";
  const frameRadius = "rounded-[46px]";
  const screenRadius = "rounded-[40px]";
  const chromePadding = compact ? "px-4 pb-3 pt-3" : "px-5 pb-3 pt-3";
  const googleLogoSize = compact ? "text-[20px]" : "text-[32px]";
  const searchBoxClass = compact
    ? "mt-3 rounded-full border border-[#e3e6ea] bg-white px-3 py-2 shadow-[0_3px_10px_rgba(60,64,67,0.12)]"
    : "mt-4 rounded-full border border-[#e3e6ea] bg-white px-4 py-2.5 shadow-[0_4px_12px_rgba(60,64,67,0.1)]";
  const adPadding = compact ? "px-4 pb-4 pt-3" : "px-5 pb-3 pt-3";
  const headlineClass = compact ? "text-[18px] leading-[1.16]" : "text-[19px] leading-[1.16]";
  const descriptionClass = compact ? "mt-2 text-[11px] leading-[1.45]" : "mt-2.5 text-[13px] leading-[1.45]";

  return (
    <div className={`mx-auto ${outerSizeClass}`}>
      <div
        className={`mx-auto w-full aspect-[78/160.9] ${frameRadius} border-[4px] border-[#111111] bg-[#111111] p-[5px] shadow-[0_20px_48px_rgba(15,23,42,0.20)] ${maxWidthClass} ${frameScaleClass}`}
      >
        <div className={`flex h-full flex-col overflow-hidden ${screenRadius} border border-[#101010] bg-white`}>
          <div className={chromePadding}>
            {compact ? (
              <>
              <div className="grid grid-cols-[52px_1fr_52px] items-center text-[#111827]">
                <span className="text-[11px] font-semibold">9:41</span>
                <div className="mx-auto h-5 w-[58px] rounded-full bg-[#050505]" />
                <div className="flex items-center justify-end gap-1">
                  <span className="h-2.5 w-3 rounded-[2px] border border-[#111827]" />
                  <span className="h-2 w-2 rounded-full border border-[#111827]" />
                  <span className="h-2 w-4 rounded-[2px] bg-[#111827]" />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-[32px_1fr_32px] items-center text-[#3c4043]">
                <MenuIcon className="size-4" />
                <div className="flex items-center justify-center" aria-label="Google">
                  <span className={`${googleLogoSize} font-medium leading-none tracking-[-0.04em]`}>
                    <span className="text-[#4285f4]">G</span>
                    <span className="text-[#ea4335]">o</span>
                    <span className="text-[#fbbc05]">o</span>
                    <span className="text-[#4285f4]">g</span>
                    <span className="text-[#34a853]">l</span>
                    <span className="text-[#ea4335]">e</span>
                  </span>
                </div>
                <div className="ml-auto size-5 rounded-full bg-[#d1d5db]" />
              </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between text-[#111827]">
                  <span className="text-[14px] font-semibold">9:41</span>
                  <div className="flex h-9 w-[96px] items-center justify-end">
                    <div className="h-8 w-[78px] rounded-full bg-[#050505]" />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-center" aria-label="Google">
                  <span className={`${googleLogoSize} font-medium leading-none tracking-[-0.04em]`}>
                    <span className="text-[#4285f4]">G</span>
                    <span className="text-[#ea4335]">o</span>
                    <span className="text-[#fbbc05]">o</span>
                    <span className="text-[#4285f4]">g</span>
                    <span className="text-[#34a853]">l</span>
                    <span className="text-[#ea4335]">e</span>
                  </span>
                </div>
              </>
            )}

            <div className={searchBoxClass}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <SearchIcon className="size-5 shrink-0 text-[#6b7280]" />
                  <span className={`${compact ? "text-[10px]" : "text-[14px]"} truncate text-[#111827]`}>
                    {slide.searchQuery}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-4 w-1 rounded-full bg-[#4285f4]" />
                  <div className="size-4 rounded-full border border-[#dbe2ea]" />
                </div>
              </div>
            </div>

            <div className={`${compact ? "mt-3 gap-4 text-[9px]" : "mt-4 gap-5 text-[12px]"} flex overflow-hidden whitespace-nowrap text-[#6b7280]`}>
              {searchTabs.map((tab, index) => (
                <div key={tab} className="flex flex-col items-center">
                  <span className={index === 0 ? "font-medium text-[#2563eb]" : ""}>{tab}</span>
                  <span className={`${compact ? "mt-1.5 w-7" : "mt-1.5 w-8"} h-0.5 rounded-full ${index === 0 ? "bg-[#2563eb]" : "bg-transparent"}`} />
                </div>
              ))}
            </div>
          </div>

          <div className={`border-t border-[#edf1f4] ${adPadding}`}>
            <p className={`${compact ? "text-[10px]" : "text-[13px]"} font-medium text-[#111827]`}>Sponsored</p>
            <div className={`${compact ? "mt-3 gap-2" : "mt-3 gap-3"} flex items-start justify-between`}>
              <div className={`${compact ? "gap-2" : "gap-3"} flex min-w-0`}>
                {slide.businessLogoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={slide.businessLogoUrl}
                    alt={slide.businessName || "Business logo"}
                    className={`${compact ? "size-6" : "size-9"} rounded-full object-cover`}
                  />
                ) : (
                  <div className={`${compact ? "size-6 text-[10px]" : "size-9 text-sm"} flex items-center justify-center rounded-full bg-[#e8f0fe] font-semibold text-[#2563eb]`}>
                    {slide.businessName?.slice(0, 1).toUpperCase() ?? "G"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className={`${compact ? "text-[10px]" : "text-[13px]"} truncate font-medium text-[#202124]`}>{businessLabel}</p>
                  <p className={`${compact ? "text-[9px]" : "text-[12px]"} truncate text-[#6b7280]`}>{displayUrlLabel}</p>
                </div>
              </div>
              <EllipsisVerticalIcon className={`${compact ? "size-3.5" : "size-4"} mt-1 shrink-0 text-[#5f6368]`} />
            </div>

            <div className={compact ? "mt-3" : "mt-4"}>
              <h4 className={`${headlineClass} text-[#1a0dab]`}>{slide.headline}</h4>
              <p className={`${descriptionClass} text-[#202124]`}>{slide.description}</p>
            </div>

            {slide.sitelinks.length > 0 ? (
              <div className={`${compact ? "mt-3" : "mt-4"} border-t border-[#edf1f4]`}>
                {slide.sitelinks.slice(0, 4).map((sitelink) => (
                  <div key={sitelink.id} className={`${compact ? "py-2.5" : "py-3"} flex items-center justify-between border-b border-[#edf1f4]`}>
                    <span className={`${compact ? "text-[10px]" : "text-[14px]"} truncate font-medium text-[#1a73e8]`}>{sitelink.linkText}</span>
                    <ChevronRightIcon className={`${compact ? "size-3" : "size-4"} text-[#6b7280]`} />
                  </div>
                ))}
              </div>
            ) : null}

            {slide.callText || slide.locationText ? (
              <div className={`${compact ? "mt-3 space-y-2 pt-3 text-[10px]" : "mt-4 space-y-2 pt-3 text-[12px]"} border-t border-[#edf1f4] text-[#4b5563]`}>
                {slide.callText ? <p>Call {slide.callText}</p> : null}
                {slide.locationText ? <p>{slide.locationText}</p> : null}
              </div>
            ) : null}

            {compact ? (
              <div className="mt-4 space-y-2 border-t border-[#edf1f4] pt-3">
                <div className="flex items-center gap-2">
                  <span className="size-5 rounded-full bg-[#e5e7eb]" />
                  <span className="h-2 w-16 rounded bg-[#e5e7eb]" />
                </div>
                <div className="h-2 w-28 rounded bg-[#e5e7eb]" />
                <div className="h-2 w-40 rounded bg-[#e5e7eb]" />
                <div className="h-2 w-48 rounded bg-[#e5e7eb]" />
              </div>
            ) : null}

            <div className={`${compact ? "mt-3" : "mt-4"} mx-auto h-1.5 w-32 rounded-full bg-[#e8eaed]`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function getDetailFieldValue(fields: PreviewDetailField[], label: string): string {
  return fields.find((field) => field.label === label)?.value ?? "";
}

function buildDifferingGoogleStatusFields(
  campaignStatus: string,
  entityStatuses: Array<{ label: string; value?: string | null }>
): Array<{ label: string; value: string }> {
  return entityStatuses
    .map((status) => ({
      label: status.label,
      value: status.value?.trim() ?? "",
    }))
    .filter((status) => {
      if (!status.value || /^unknown$/i.test(status.value)) {
        return false;
      }

      return normalizeGoogleStatusMeaning(status.value) !== normalizeGoogleStatusMeaning(campaignStatus);
    });
}

function getPickerStatusLabel(status: string, showOnlyNotableStatus: boolean): string | null {
  const normalized = status.trim();
  if (!normalized || /^unknown$/i.test(normalized)) {
    return null;
  }

  if (showOnlyNotableStatus && isGoogleStatusActive(normalized)) {
    return null;
  }

  return normalized;
}

function selectionOptionClassName(isSelected: boolean, isPaused: boolean): string {
  if (isPaused) {
    return isSelected
      ? "border-[#f59e0b] bg-[#fff7ed] text-[#0f172a] shadow-[0_6px_14px_rgba(245,158,11,0.14)]"
      : "border-[#fed7aa] bg-[#fffaf0] text-[#334155] hover:border-[#f59e0b] hover:bg-[#fff7ed]";
  }

  return isSelected
    ? "border-[#1b74e4] bg-[#e7f0fe] text-[#0f172a] shadow-[0_6px_14px_rgba(27,116,228,0.10)]"
    : "border-[#e5e7eb] bg-white text-[#334155] hover:border-[#bfdbfe]";
}

function isPausedStatus(status: string): boolean {
  return status.trim().toLowerCase().includes("pause");
}

function isGoogleStatusActive(value: string): boolean {
  return normalizeGoogleStatusMeaning(value) === "active";
}

function normalizeGoogleStatusMeaning(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "enabled" || normalized === "active") {
    return "active";
  }

  return normalized || "unknown";
}

function buildGoogleEditDraftHref(
  searchParams: URLSearchParams,
  campaignId: string | null | undefined,
  adGroupId: string | null | undefined,
  adId: string | null | undefined
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set("platform", "google");
  if (campaignId) {
    params.set("campaignId", campaignId);
  }
  if (adGroupId) {
    params.set("adGroupId", adGroupId);
  }
  if (adId) {
    params.set("adId", adId);
  }
  return `/preview/edit?${params.toString()}`;
}

function buildMetaEditDraftHref(
  searchParams: URLSearchParams,
  campaignId: string | null | undefined,
  adGroupId: string | null | undefined,
  adId: string | null | undefined
): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set("platform", "meta");
  if (campaignId) {
    params.set("campaignId", campaignId);
  }
  if (adGroupId) {
    params.set("adGroupId", adGroupId);
  }
  if (adId) {
    params.set("adId", adId);
  }
  return `/preview/edit?${params.toString()}`;
}

function detailField(label: string, value: string | null | undefined): PreviewDetailField | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return { label, value: normalized };
}

interface WorkspaceProps {
  section: PreviewPlatformSection;
  initialCampaignId: string;
  initialChildId?: string;
  initialAdId?: string;
  detailsLoading?: boolean;
  onCampaignChange?: (next: {
    platform: "meta" | "google" | "tiktok";
    campaignId: string;
    campaignName: string;
  }) => void;
  onChildChange?: (childId: string) => void;
  onAdChange?: (adId: string) => void;
  startDate?: string;
  endDate?: string;
  onDateRangeChange?: (next: { startDate: string; endDate: string }) => void;
}

function usePreviewSelection(
  section: PreviewPlatformSection,
  initialCampaignId: string,
  onCampaignChange?: WorkspaceProps["onCampaignChange"],
  initialChildId = "",
  initialAdId = "",
  onChildChange?: WorkspaceProps["onChildChange"],
  onAdChange?: WorkspaceProps["onAdChange"]
) {
  const [campaignIdState, setCampaignIdState] = useState(initialCampaignId);
  const [selectedChildId, setSelectedChildId] = useState(initialChildId);
  const [selectedAdId, setSelectedAdId] = useState(initialAdId);

  const selectedCampaignId = useMemo(() => {
    if (section.campaigns.some((campaign) => campaign.id === campaignIdState)) {
      return campaignIdState;
    }
    if (initialCampaignId && section.campaigns.some((campaign) => campaign.id === initialCampaignId)) {
      return initialCampaignId;
    }
    return section.campaigns[0]?.id ?? "";
  }, [campaignIdState, initialCampaignId, section.campaigns]);

  const selectedCampaign = useMemo(
    () =>
      section.campaigns.find((campaign) => campaign.id === selectedCampaignId) ??
      section.campaigns[0] ??
      null,
    [section.campaigns, selectedCampaignId]
  );
  const children = useMemo(() => selectedCampaign?.children ?? [], [selectedCampaign]);
  const resolvedChildId = useMemo(
    () => (children.some((child) => child.id === selectedChildId) ? selectedChildId : children[0]?.id ?? ""),
    [children, selectedChildId]
  );

  const selectedChild = useMemo(
    () => children.find((child) => child.id === resolvedChildId) ?? children[0] ?? null,
    [children, resolvedChildId]
  );
  const ads = useMemo(() => selectedChild?.ads ?? [], [selectedChild]);
  const resolvedAdId = useMemo(
    () => (ads.some((ad) => ad.id === selectedAdId) ? selectedAdId : ads[0]?.id ?? ""),
    [ads, selectedAdId]
  );

  const selectedAd = useMemo(
    () => ads.find((ad) => ad.id === resolvedAdId) ?? ads[0] ?? null,
    [ads, resolvedAdId]
  );

  return {
    selectedCampaign,
    selectedChild,
    selectedAd,
    children,
    ads,
    selectCampaign: (campaignId: string) => {
      const nextCampaign =
        section.campaigns.find((campaign) => campaign.id === campaignId) ?? null;
      setCampaignIdState(campaignId);
      setSelectedChildId("");
      setSelectedAdId("");
      if (nextCampaign && onCampaignChange) {
        onCampaignChange({
          platform: section.platform,
          campaignId: nextCampaign.id,
          campaignName: nextCampaign.name,
        });
      }
    },
    selectChild: (childId: string) => {
      setSelectedChildId(childId);
      setSelectedAdId("");
      onChildChange?.(childId);
    },
    selectAd: (adId: string) => {
      setSelectedAdId(adId);
      onAdChange?.(adId);
    },
  };
}

function SelectionPicker({
  title,
  icon,
  items,
  selectedId,
  selectedLabel,
  onSelect,
  emptyMessage,
  showOnlyNotableStatus = false,
  size = "default",
}: {
  title: string;
  icon: ReactNode;
  items: Array<{ id: string; name: string; status: string }>;
  selectedId: string;
  selectedLabel: string;
  onSelect: (id: string) => void;
  emptyMessage?: string;
  showOnlyNotableStatus?: boolean;
  size?: "default" | "comfortable";
}) {
  const [open, setOpen] = useState(false);
  const isComfortable = size === "comfortable";
  const containerClassName = isComfortable
    ? "min-w-0 self-start rounded-[18px] border border-[#dde6f1] bg-[#F8FAFC] p-4 shadow-[0_8px_18px_rgba(15,23,42,0.035)]"
    : "min-w-0 self-start rounded-[16px] border border-[#dde6f1] bg-[#F8FAFC] p-3 shadow-[0_8px_18px_rgba(15,23,42,0.035)]";
  const titleClassName = isComfortable
    ? "mb-3 flex items-center gap-2.5 text-[16px] font-semibold text-[#334155]"
    : "mb-2.5 flex items-center gap-2 text-sm font-semibold text-[#334155]";
  const iconClassName = isComfortable
    ? "flex size-8 items-center justify-center rounded-xl bg-white text-[#4b5563] shadow-sm ring-1 ring-[#e2e8f0] [&_svg]:size-5"
    : "flex size-7 items-center justify-center rounded-xl bg-white text-[#4b5563] shadow-sm ring-1 ring-[#e2e8f0]";
  const triggerClassName = isComfortable
    ? "flex w-full items-center justify-between rounded-[14px] border border-[#d4deea] bg-white px-4 py-3.5 text-left shadow-[0_6px_14px_rgba(15,23,42,0.035)] transition hover:border-[#bfdbfe]"
    : "flex w-full items-center justify-between rounded-[12px] border border-[#d4deea] bg-white px-3 py-2.5 text-left shadow-[0_6px_14px_rgba(15,23,42,0.035)] transition hover:border-[#bfdbfe]";
  const selectedLabelClassName = isComfortable
    ? "whitespace-normal break-words text-[18px] font-semibold leading-6 text-[#0f172a]"
    : "whitespace-normal break-words text-sm font-semibold leading-5 text-[#0f172a]";
  const helperClassName = isComfortable
    ? "mt-1 text-[14px] leading-5 text-[#64748b]"
    : "mt-1 text-xs text-[#64748b]";
  const optionLabelClassName = isComfortable
    ? "whitespace-normal break-words text-[15px] font-semibold leading-5"
    : "whitespace-normal break-words text-sm font-semibold leading-5";

  function handleSelect(id: string) {
    onSelect(id);
    setOpen(false);
  }

  return (
    <div className={containerClassName}>
      <div className={titleClassName}>
        <span className={iconClassName}>
          {icon}
        </span>
        <span>{title}</span>
      </div>
      {items.length > 0 ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={triggerClassName}
            >
              <div className="min-w-0">
                <p className={selectedLabelClassName}>{selectedLabel}</p>
                <p className={helperClassName}>
                  {open ? `Hide ${title.toLowerCase()} options` : `Choose ${title.toLowerCase()}`}
                </p>
              </div>
              <ChevronDownIcon
                className={`size-4 shrink-0 text-[#64748b] transition ${open ? "rotate-180" : ""}`}
              />
            </button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            sideOffset={8}
            className="max-h-64 w-[var(--radix-popover-trigger-width)] space-y-2 overflow-y-auto rounded-[14px] border border-[#d4deea] bg-white p-2 shadow-[0_18px_45px_rgba(15,23,42,0.14)]"
          >
              {items.map((item) => {
                const isSelected = item.id === selectedId;
                const isPaused = isPausedStatus(item.status);
                const statusLabel = getPickerStatusLabel(item.status, showOnlyNotableStatus);

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={`flex w-full items-start justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${selectionOptionClassName(
                      isSelected,
                      isPaused
                    )}`}
                  >
                    <div className="min-w-0">
                      <p className={optionLabelClassName}>{item.name}</p>
                      {statusLabel ? (
                        <p className={`mt-1 text-xs ${isPaused ? "font-medium text-[#b45309]" : "text-[#64748b]"}`}>
                          {statusLabel}
                        </p>
                      ) : null}
                    </div>
                    {isSelected ? (
                      <CheckIcon className={`mt-0.5 size-4 shrink-0 ${isPaused ? "text-[#d97706]" : "text-[#1b74e4]"}`} />
                    ) : null}
                  </button>
                );
              })}
          </PopoverContent>
        </Popover>
      ) : (
        <EmptyState message={emptyMessage ?? `No ${title.toLowerCase()} returned.`} />
      )}
    </div>
  );
}

function MetricPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "blue" | "green" | "amber";
}) {
  const tone =
    accent === "green"
      ? "border-[#d7f0dc] bg-[#f3faf5] text-[#166534]"
      : accent === "amber"
        ? "border-[#fde68a] bg-[#fff8e1] text-[#92400e]"
        : "border-[#bfdbfe] bg-[#eef5ff] text-[#1d4ed8]";

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>
      <span className="uppercase tracking-[0.08em] opacity-80">{label}</span>
      <span>{value}</span>
    </span>
  );
}

function ValueBox({ value, compact = false }: { value: string; compact?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-[#cfd7e6] bg-[#fafbfd] px-3 py-2 text-sm text-[#202124] ${
        compact ? "min-w-[88px] text-center" : ""
      }`}
    >
      <p className="break-words">{value}</p>
    </div>
  );
}

function ImageGrid({ images }: { images: Array<{ id: string; url: string; alt: string }> }) {
  if (images.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#cfd7e6] bg-[#fafbfd] px-4 py-5 text-sm text-[#5f6368]">
        No images were returned for this ad.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {images.map((image) => (
        <div key={image.id} className="overflow-hidden rounded-2xl border border-[#dfe3eb] bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={image.alt} className="h-28 w-full object-cover" />
          <p className="px-3 py-2 text-xs text-[#5f6368]">{image.alt}</p>
        </div>
      ))}
    </div>
  );
}

function GoogleMark() {
  return (
    <div className="relative h-11 w-[68px] shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[#d7dbe3]">
      <Image
        src="/google-ads-logo.svg"
        alt="Google Ads logo"
        fill
        className="object-contain"
        sizes="68px"
      />
    </div>
  );
}

function MetaMark() {
  return (
    <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-[22px] border border-[#dbe7f3] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
      <Image
        src="/MetaLogo.png"
        alt="Meta logo"
        fill
        className="object-contain p-3"
        sizes="80px"
      />
    </div>
  );
}

function buildGoogleAdPreviewVariations(selectedAd: PreviewAdNode | null): GooglePreviewSlide[] {
  if (!selectedAd) {
    return [];
  }

  const headlines = selectedAd.headlines?.length ? selectedAd.headlines : [{ text: selectedAd.name }];
  const descriptions = selectedAd.descriptions?.length
    ? selectedAd.descriptions
    : [{ text: "No description available." }];
  const displayDomain = getDisplayDomain(selectedAd);
  const displayPath = formatGoogleDisplayPath(selectedAd.displayPathParts);
  const images = selectedAd.images ?? [];
  const sitelinks = selectedAd.sitelinks ?? [];
  const keywords = selectedAd.keywords ?? [];
  const variationCount = Math.max(
    1,
    Math.min(
      30,
      Math.max(
        keywords.length,
        headlines.length,
        descriptions.length,
        sitelinks.length,
        1
      )
    )
  );
  const fallbackQuery = keywords[0] || selectedAd.businessName || displayDomain;
  const callText = getDetailFieldValue(selectedAd.details ?? [], "Call") || getDetailFieldValue(selectedAd.details ?? [], "Phone");
  const locationText =
    getDetailFieldValue(selectedAd.details ?? [], "Location") ||
    getDetailFieldValue(selectedAd.details ?? [], "Address");

  return Array.from({ length: variationCount }).map((_, index) => {
    const headline = headlines[index % headlines.length] ?? headlines[0];
    const description = descriptions[index % descriptions.length] ?? descriptions[0];
    const sitelinkStart = sitelinks.length > 0 ? index % sitelinks.length : 0;
    const rotatedSitelinks =
      sitelinks.length > 0
        ? [...sitelinks.slice(sitelinkStart), ...sitelinks.slice(0, sitelinkStart)]
        : [];

    return {
    id: `${fallbackQuery}-${headline.text}-${description.text}-${index}`,
    businessName: selectedAd.businessName || null,
    businessLogoUrl: selectedAd.businessLogoUrl || null,
    displayDomain,
    finalUrlLabel: selectedAd.finalUrl || `https://${displayDomain}/`,
    displayPath,
    searchQuery: keywords[index % Math.max(keywords.length, 1)] || fallbackQuery,
    headline: headline.text,
    description: description.text,
    keywords,
    sitelinks: rotatedSitelinks,
    callText: callText || null,
    locationText: locationText || null,
    images,
    imageIndex: index,
    };
  });
}

function getDisplayDomain(selectedAd: { finalUrl?: string | null } | null): string {
  const finalUrl = selectedAd?.finalUrl?.trim();
  if (!finalUrl) {
    return "google.com";
  }

  try {
    return new URL(finalUrl).hostname.replace(/^www\./i, "");
  } catch {
    return "google.com";
  }
}

interface GooglePreviewSlide {
  id: string;
  businessName: string | null;
  businessLogoUrl: string | null;
  displayDomain: string;
  finalUrlLabel: string;
  displayPath: string;
  searchQuery: string;
  headline: string;
  description: string;
  keywords: string[];
  sitelinks: Array<{
    id: string;
    linkText: string;
    description1?: string | null;
    description2?: string | null;
    finalUrl?: string | null;
  }>;
  callText: string | null;
  locationText: string | null;
  images: Array<{ id: string; url: string; alt: string }>;
  imageIndex: number;
}

function PerformanceSection({
  performance,
  emptyMessage,
}: {
  performance: PreviewPerformanceSummary | null;
  emptyMessage: string;
}) {
  const [activeIndex, setActiveIndex] = useState(10);
  const [dateRangeKey, setDateRangeKey] = useState("30");
  const [selectedMetricKey, setSelectedMetricKey] = useState("primary");
  const [visibleKpis, setVisibleKpis] = useState(["primary", "costPerResult", "spend"]);

  if (!performance) {
    return (
      <div className="rounded-[28px] border border-[#e7edf5] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-6">
        <EmptyState message={emptyMessage} />
      </div>
    );
  }

  const awarenessResultLabels = new Set([
    "Awareness",
    "Reach",
    "ThruPlays",
    "Estimated ad recallers",
  ]);
  const primaryLabel = awarenessResultLabels.has(performance.resultLabel)
    ? "Awareness"
    : performance.resultLabel || "Awareness";
  const metricOptions = buildMetaPerformanceMetricOptions(performance, primaryLabel);
  const selectedMetric = metricOptions.find((option) => option.key === selectedMetricKey) ?? metricOptions[0];
  const dateRange = META_PERFORMANCE_DATE_RANGES.find((option) => option.key === dateRangeKey) ?? META_PERFORMANCE_DATE_RANGES[2];
  const trend = buildMetaPerformanceTrend(selectedMetric.value, dateRange.days);
  const safeActiveIndex = Math.min(activeIndex, trend.length - 1);
  const activePoint = trend[safeActiveIndex];
  const cards = buildMetaPerformanceKpiCards(performance, primaryLabel).filter((card) => visibleKpis.includes(card.key));

  return (
    <div className="rounded-[28px] border border-[#e7edf5] bg-white p-4 shadow-[0_22px_60px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="flex items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-[16px] bg-[#e8fbfd] text-[#16bcca]">
            <BarChart3Icon className="size-7" />
          </span>
          <div>
            <h2 className="text-[1.55rem] font-semibold tracking-[-0.03em] text-[#0f172a]">
              Performance Insights
            </h2>
            <p className="mt-1 text-[0.98rem] leading-6 text-[#64748b]">
              Track delivery trend and key performance metrics for the selected Meta ad.
            </p>
          </div>
        </div>

        <div className="grid w-full max-w-[500px] grid-cols-1 gap-2 sm:grid-cols-[minmax(145px,1fr)_minmax(125px,0.72fr)_minmax(145px,0.86fr)] lg:w-[500px]">
          <MetaInsightSelectControl
            label={dateRange.label}
            options={META_PERFORMANCE_DATE_RANGES.map((option) => ({ key: option.key, label: option.label }))}
            selectedKey={dateRangeKey}
            onSelect={(nextKey) => {
              setDateRangeKey(nextKey);
              setActiveIndex(0);
            }}
          />
          <MetaInsightSelectControl
            label={selectedMetric.label}
            options={metricOptions.map((option) => ({ key: option.key, label: option.label }))}
            selectedKey={selectedMetric.key}
            onSelect={(nextKey) => {
              setSelectedMetricKey(nextKey);
              setActiveIndex(0);
            }}
          />
          <MetaInsightCustomizeControl
            cards={buildMetaPerformanceKpiCards(performance, primaryLabel)}
            selectedKeys={visibleKpis}
            onToggle={(key) => {
              setVisibleKpis((current) => {
                if (current.includes(key)) {
                  return current.length > 1 ? current.filter((item) => item !== key) : current;
                }
                return [...current, key];
              });
            }}
          />
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <MetaMetricCard key={card.key} label={card.label} value={card.value} />
        ))}
      </div>

      <div className="mt-5">
        <MetaPerformanceLineChart
          points={trend}
          activeIndex={safeActiveIndex}
          activePoint={activePoint}
          label={selectedMetric.label}
          valueFormat={selectedMetric.format}
          onActiveIndexChange={setActiveIndex}
        />
      </div>
    </div>
  );
}

function DemographicSection({
  rows,
  platformRows,
  resultLabel,
  emptyMessage,
}: {
  rows: PreviewDemographicRow[];
  platformRows: PreviewPlatformDistributionRow[];
  resultLabel: string;
  emptyMessage: string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [audienceView, setAudienceView] = useState<"demographics" | "platform">("demographics");
  const [audienceFilter, setAudienceFilter] = useState("all");
  const [audienceMetric, setAudienceMetric] = useState("results");

  if (rows.length === 0) {
    return (
      <div className="rounded-[28px] border border-[#e7edf5] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-6">
        <EmptyState message={emptyMessage} />
      </div>
    );
  }

  const normalizedRows = normalizeMetaDemographicRows(rows);
  const safeActiveIndex =
    activeIndex === null ? null : Math.min(activeIndex, normalizedRows.length - 1);
  const totals = buildMetaAudienceTotals(normalizedRows);
  const topSegment = findTopAudienceSegment(normalizedRows);
  const bestCostSegment = findBestCostAudienceSegment(normalizedRows);
  const keyInsight = buildAudienceInsightText(normalizedRows);
  const platformNames = Array.from(new Set(platformRows.map((row) => row.platform)));
  const audienceFilterOptions =
    audienceView === "platform"
      ? [
          { key: "all", label: "All" },
          ...platformNames.map((platform) => ({ key: platform, label: platform })),
        ]
      : META_AUDIENCE_FILTER_OPTIONS;
  const selectedAudienceFilter = audienceFilterOptions.some((option) => option.key === audienceFilter)
    ? audienceFilter
    : "all";

  return (
    <div className="rounded-[28px] border border-[#e7edf5] bg-white p-5 shadow-[0_22px_60px_rgba(15,23,42,0.08)] sm:p-7">
      <div className="flex items-center gap-4">
        <span className="flex size-16 items-center justify-center rounded-[18px] bg-[#e8fbfd] text-[#16bcca]">
          <UsersIcon className="size-8" />
        </span>
        <div>
          <h2 className="text-[1.75rem] font-semibold tracking-[-0.03em] text-[#0f172a]">
            Audience Insights
          </h2>
          <p className="mt-1 text-[1.05rem] leading-7 text-[#64748b]">
            Understand who is responding to the selected Meta ad.
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setAudienceView("demographics")}
            className={`inline-flex items-center gap-3 rounded-md px-4 py-3 text-[1rem] transition hover:-translate-y-0.5 ${
              audienceView === "demographics"
                ? "bg-[#eaf3ff] font-semibold text-[#1673c8] shadow-sm hover:bg-[#dcebff]"
                : "font-medium text-[#334155] hover:bg-[#f8fafc]"
            }`}
          >
            <UsersIcon className="size-5" />
            Demographics
          </button>
          <button
            type="button"
            onClick={() => setAudienceView("platform")}
            className={`inline-flex items-center gap-3 rounded-md px-4 py-3 text-[1rem] transition hover:-translate-y-0.5 ${
              audienceView === "platform"
                ? "bg-[#eaf3ff] font-semibold text-[#1673c8] shadow-sm hover:bg-[#dcebff]"
                : "font-medium text-[#334155] hover:bg-[#f8fafc]"
            }`}
          >
            <LayersIcon className="size-5 text-[#64748b]" />
            Platform
          </button>
        </div>

        <div className="grid w-full grid-cols-2 gap-3 sm:w-[340px]">
          <MetaInsightSelectControl
            label={audienceFilterOptions.find((option) => option.key === selectedAudienceFilter)?.label ?? "All"}
            options={audienceFilterOptions}
            selectedKey={selectedAudienceFilter}
            onSelect={setAudienceFilter}
          />
          <MetaInsightSelectControl
            label={META_AUDIENCE_METRIC_OPTIONS.find((option) => option.key === audienceMetric)?.label ?? resultLabel}
            options={META_AUDIENCE_METRIC_OPTIONS.map((option) => ({
              key: option.key,
              label: option.key === "results" ? resultLabel : option.label,
            }))}
            selectedKey={audienceMetric}
            onSelect={setAudienceMetric}
          />
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-[#0f172a]">
          {audienceView === "demographics" ? "Age and gender distribution" : "Platform distribution"}
        </h3>
        {audienceView === "demographics" ? (
          <MetaAudienceBarChart
            rows={normalizedRows}
            activeIndex={safeActiveIndex}
            onActiveIndexChange={setActiveIndex}
            metricKey={audienceMetric}
            filterKey={selectedAudienceFilter}
          />
        ) : platformRows.length > 0 ? (
          <MetaPlatformBarChart
            rows={platformRows}
            metricKey={audienceMetric}
            filterKey={selectedAudienceFilter}
          />
        ) : (
          <div className="mt-5">
            <EmptyState message="No platform or device breakdown was returned for the selected ad and date range." />
          </div>
        )}
      </div>

      {audienceView === "demographics" ? (
      <>
      <div className="mt-7 grid gap-5 lg:grid-cols-3">
        <MetaAudienceLegendCard
          color="#5b35c9"
          label="Men"
          value={totals.men}
          total={totals.all}
          cost={totals.menCost}
        />
        <MetaAudienceLegendCard
          color="#17bec9"
          label="Women"
          value={totals.women}
          total={totals.all}
          cost={totals.womenCost}
        />
        <MetaAudienceLegendCard
          color="#c5cbd3"
          label="Unknown"
          value={totals.unknown}
          total={totals.all}
          cost={totals.unknownCost}
        />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        <MetaAudienceSummaryCard
          icon={<UsersIcon className="size-6" />}
          title="Top Audience Segment"
          value={topSegment}
        />
        <MetaAudienceSummaryCard
          icon={<AwardIcon className="size-6" />}
          title="Best Cost Segment"
          value={bestCostSegment}
        />
        <MetaAudienceSummaryCard
          icon={<LightbulbIcon className="size-6" />}
          title="Key Insight"
          value={keyInsight}
          compact
        />
      </div>
      </>
      ) : (
        <MetaPlatformLegend rows={platformRows} metricKey={audienceMetric} filterKey={selectedAudienceFilter} />
      )}
    </div>
  );
}

function MetaInsightSelectControl({
  label,
  options,
  selectedKey,
  onSelect,
}: {
  label: string;
  options: ReadonlyArray<{ key: string; label: string }>;
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-11 w-full items-center justify-between gap-2 rounded-[9px] border border-[#c7d3e1] bg-white px-4 text-[0.92rem] font-medium text-[#0f172a] shadow-[0_8px_18px_rgba(15,23,42,0.035)] transition duration-200 hover:-translate-y-0.5 hover:border-[#9fd4dc] hover:shadow-[0_14px_26px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16bcca]/30"
        aria-expanded={open}
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon className={`size-4 shrink-0 text-[#64748b] transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-full min-w-[180px] overflow-hidden rounded-[12px] border border-[#dbe3ee] bg-white p-1 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
          {options.map((option) => {
            const selected = option.key === selectedKey;

            return (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  onSelect(option.key);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-[9px] px-3 py-2.5 text-left text-sm transition ${
                  selected ? "bg-[#e8fbfd] font-semibold text-[#0f172a]" : "text-[#334155] hover:bg-[#f8fafc]"
                }`}
              >
                <span>{option.label}</span>
                {selected ? <CheckIcon className="size-4 text-[#16bcca]" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function MetaInsightCustomizeControl({
  cards,
  selectedKeys,
  onToggle,
}: {
  cards: MetaPerformanceKpiCard[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[9px] border border-[#c7d3e1] bg-white px-4 text-[0.92rem] font-medium text-[#0f172a] shadow-[0_8px_18px_rgba(15,23,42,0.035)] transition duration-200 hover:-translate-y-0.5 hover:border-[#9fd4dc] hover:shadow-[0_14px_26px_rgba(15,23,42,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16bcca]/30"
        aria-expanded={open}
      >
        <SlidersHorizontalIcon className="size-5 text-[#475569]" />
        <span>Customise</span>
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-[260px] rounded-[14px] border border-[#dbe3ee] bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#64748b]">
            Columns
          </p>
          <div className="space-y-1">
            {cards.map((card) => {
              const selected = selectedKeys.includes(card.key);

              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => onToggle(card.key)}
                  className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left text-sm text-[#334155] transition hover:bg-[#f8fafc]"
                >
                  <span
                    className={`flex size-5 items-center justify-center rounded border ${
                      selected ? "border-[#16bcca] bg-[#16bcca] text-white" : "border-[#cbd5e1] bg-white"
                    }`}
                  >
                    {selected ? <CheckIcon className="size-3.5" /> : null}
                  </span>
                  <span>{card.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetaMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-[102px] rounded-[12px] border border-[#dbe3ee] bg-white px-5 py-4 shadow-[0_10px_22px_rgba(15,23,42,0.03)] transition duration-200 hover:-translate-y-1 hover:border-[#b8dce3] hover:shadow-[0_16px_30px_rgba(15,23,42,0.08)]">
      <div className="flex items-center gap-2 text-[0.88rem] font-medium text-[#334155]">
        <span>{label}</span>
        <InfoIcon className="size-3.5 text-[#94a3b8]" />
      </div>
      <p className="mt-3 text-[1.65rem] font-medium leading-none tracking-[-0.03em] text-[#0f172a]">
        {value}
      </p>
    </div>
  );
}

function MetaPerformanceLineChart({
  points,
  activeIndex,
  activePoint,
  label,
  valueFormat,
  onActiveIndexChange,
}: {
  points: MetaPerformanceTrendPoint[];
  activeIndex: number;
  activePoint: MetaPerformanceTrendPoint;
  label: string;
  valueFormat: MetaPerformanceMetricOption["format"];
  onActiveIndexChange: (index: number) => void;
}) {
  const chart = buildLineChartGeometry(points, valueFormat);
  const activeGeometry = chart.points[activeIndex] ?? chart.points[0];
  const tooltipX = Math.min(Math.max(activeGeometry.x - 56, 70), 1040);

  return (
    <div className="relative overflow-hidden rounded-[18px] bg-white px-0 pb-1 pt-3">
      <svg
        key={`${label}-${valueFormat}-${chart.yTicks.map((tick) => tick.label).join("-")}`}
        viewBox="0 0 1120 330"
        role="img"
        aria-label={`${label} trend chart`}
        className="h-[320px] w-full"
        preserveAspectRatio="none"
      >
        {chart.yTicks.map((tick) => (
          <g key={`${tick.y}-${tick.label}`}>
            <line x1="74" x2="1088" y1={tick.y} y2={tick.y} stroke="#dfe5ec" strokeWidth="1" />
            <text
              x="54"
              y={tick.y}
              fill="#475569"
              fontSize="12"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {tick.label}
            </text>
          </g>
        ))}

        {chart.xTicks.map((tick) => (
          <text key={`${tick.x}-${tick.label}`} x={tick.x} y="294" fill="#475569" fontSize="13" textAnchor="middle">
            {tick.label}
          </text>
        ))}

        <line
          x1={activeGeometry.x}
          x2={activeGeometry.x}
          y1="56"
          y2="274"
          stroke="#cbd5e1"
          strokeWidth="1.2"
          strokeDasharray="4 4"
        />
        <path d={chart.path} fill="none" stroke="#19bdc9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={activeGeometry.x} cy={activeGeometry.y} r="7" fill="#19bdc9" stroke="#ffffff" strokeWidth="4" />

        <g transform={`translate(${tooltipX} 16)`}>
          <rect width="112" height="72" rx="8" fill="#ffffff" filter="url(#metaPerformanceTooltipShadow)" />
          <path d="M50 72 L58 82 L66 72 Z" fill="#ffffff" />
          <text x="18" y="24" fill="#64748b" fontSize="13">
            {activePoint.label}
          </text>
          <text x="18" y="46" fill="#0f172a" fontSize="13">
            {label}
          </text>
          <text x="18" y="64" fill="#0f172a" fontSize="14" fontWeight="700">
            {formatMetaMetricValue(activePoint.value, valueFormat)}
          </text>
        </g>

        <defs>
          <filter id="metaPerformanceTooltipShadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.15" />
          </filter>
        </defs>

        {chart.points.map((point, index) => (
          <circle
            key={`${point.label}-${index}`}
            cx={point.x}
            cy={point.y}
            r="13"
            fill="transparent"
            tabIndex={0}
            className="cursor-pointer"
            onMouseEnter={() => onActiveIndexChange(index)}
            onFocus={() => onActiveIndexChange(index)}
          />
        ))}
      </svg>

      <div className="mt-1 flex items-center justify-center gap-3 text-[1rem] text-[#0f172a]">
        <span className="size-4 rounded bg-[#19bdc9]" />
        <span>{label}</span>
      </div>
    </div>
  );
}

function MetaAudienceBarChart({
  rows,
  activeIndex,
  onActiveIndexChange,
  metricKey,
  filterKey,
}: {
  rows: PreviewDemographicRow[];
  activeIndex: number | null;
  onActiveIndexChange: (index: number | null) => void;
  metricKey: string;
  filterKey: string;
}) {
  const chart = buildAudienceChartGeometry(rows, metricKey, filterKey);
  const activeRow = activeIndex === null ? null : rows[activeIndex] ?? null;
  const activeGroup = activeIndex === null ? null : chart.groups[activeIndex] ?? null;
  const tooltipSegments = activeRow
    ? getVisibleAudienceSegments(filterKey).map((segment) => ({
        label: segment === "men" ? "Men" : segment === "women" ? "Women" : "Unknown",
        color: segment === "men" ? "#5b35c9" : segment === "women" ? "#17bec9" : "#c5cbd3",
        value: getAudienceMetricValue(activeRow, segment, metricKey),
      }))
    : [];
  const tooltipHeight = 40 + tooltipSegments.length * 20;
  const tooltipWidth = 154;
  const tooltipX = activeGroup
    ? Math.min(Math.max(activeGroup.x + 18 - tooltipWidth / 2, 74), 1088 - tooltipWidth)
    : 560;
  const tooltipY = activeGroup
    ? Math.max(activeGroup.tooltipY - tooltipHeight - 12, 8)
    : 24;

  return (
    <div className="relative mt-5 overflow-hidden rounded-[18px] bg-white">
      <svg
        viewBox="0 0 1120 330"
        role="img"
        aria-label="Age and gender distribution chart"
        className="h-[360px] w-full"
        preserveAspectRatio="none"
      >
        {chart.yTicks.map((tick) => (
          <g key={`${tick.y}-${tick.label}`}>
            <line x1="74" x2="1088" y1={tick.y} y2={tick.y} stroke="#dfe5ec" strokeWidth="1" />
            <text x="44" y={tick.y + 5} fill="#475569" fontSize="13" textAnchor="end">
              {tick.label}
            </text>
          </g>
        ))}

        {chart.groups.map((group, index) => (
          <g
            key={group.ageRange}
            className="cursor-pointer"
            tabIndex={0}
            onMouseEnter={() => onActiveIndexChange(index)}
            onMouseLeave={() => onActiveIndexChange(null)}
            onFocus={() => onActiveIndexChange(index)}
            onBlur={() => onActiveIndexChange(null)}
          >
            {group.bars.map((bar) => (
              <rect
                key={`${group.ageRange}-${bar.label}`}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx="3"
                fill={bar.color}
                opacity={activeIndex === index ? 1 : 0.88}
                className="origin-bottom transition duration-300 hover:opacity-100"
              />
            ))}
            <text x={group.x + 18} y="294" fill="#475569" fontSize="13" textAnchor="middle">
              {group.ageRange}
            </text>
          </g>
        ))}

        {activeRow ? (
          <g transform={`translate(${tooltipX} ${tooltipY})`}>
            <rect
              width="154"
              height={tooltipHeight}
              rx="8"
              fill="#ffffff"
              filter="url(#metaAudienceTooltipShadow)"
            />
            <path
              d={`M67 ${tooltipHeight} L77 ${tooltipHeight + 12} L87 ${tooltipHeight} Z`}
              fill="#ffffff"
            />
            <text x="16" y="22" fill="#334155" fontSize="14">
              {activeRow.ageRange}
            </text>
            {tooltipSegments.map((segment, index) => (
              <MetaAudienceTooltipLine
                key={segment.label}
                y={42 + index * 20}
                color={segment.color}
                label={segment.label}
                value={segment.value}
                valueFormat={metricKey === "costPerResult" ? "currency" : "number"}
              />
            ))}
          </g>
        ) : null}

        <defs>
          <filter id="metaAudienceTooltipShadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.15" />
          </filter>
        </defs>
      </svg>
    </div>
  );
}

const META_PLATFORM_COLORS = ["#5b35c9", "#17bec9", "#f59e0b", "#ec4899", "#64748b"];

function MetaPlatformBarChart({
  rows,
  metricKey,
  filterKey,
}: {
  rows: PreviewPlatformDistributionRow[];
  metricKey: string;
  filterKey: string;
}) {
  const filteredRows = filterKey === "all" ? rows : rows.filter((row) => row.platform === filterKey);
  const devices = Array.from(new Set(filteredRows.map((row) => row.device)));
  const platforms = Array.from(new Set(filteredRows.map((row) => row.platform)));
  const [activeDevice, setActiveDevice] = useState<string | null>(null);
  const selectedDevice = activeDevice && devices.includes(activeDevice) ? activeDevice : null;
  const chartTop = 28;
  const chartBottom = 270;
  const chartLeft = 74;
  const chartRight = 1088;
  const valueFor = (row: PreviewPlatformDistributionRow) =>
    metricKey === "costPerResult" ? row.costPerResult ?? 0 : row.results;
  const maximum = buildNiceAxisScale(Math.max(...filteredRows.map(valueFor), 1));
  const groupWidth = (chartRight - chartLeft) / Math.max(devices.length, 1);
  const barWidth = Math.min(groupWidth * 0.22, 30);
  const tooltipWidth = 154;
  const tooltipHeight = 42 + platforms.length * 20;
  const activeDeviceIndex = selectedDevice ? devices.indexOf(selectedDevice) : -1;
  const activeCenter =
    activeDeviceIndex >= 0
      ? chartLeft + activeDeviceIndex * groupWidth + groupWidth / 2
      : chartLeft;
  const activeRows = selectedDevice
    ? filteredRows.filter((row) => row.device === selectedDevice)
    : [];
  const activeTop = activeRows.length
    ? Math.min(
        ...activeRows.map((row) => {
          const value = valueFor(row);
          const height = Math.max(
            (value / maximum.maximum) * (chartBottom - chartTop),
            value > 0 ? 4 : 1
          );
          return chartBottom - height;
        })
      )
    : chartBottom;
  const tooltipX = Math.min(
    Math.max(activeCenter - tooltipWidth / 2, chartLeft),
    chartRight - tooltipWidth
  );
  const tooltipY = Math.max(activeTop - tooltipHeight - 14, 8);

  return (
    <div className="relative mt-5 overflow-hidden rounded-[18px] bg-white">
      <svg
        viewBox="0 0 1120 330"
        role="img"
        aria-label="Platform and device distribution chart"
        className="h-[360px] w-full"
        preserveAspectRatio="none"
      >
        {maximum.ticks.map((value) => {
          const y = chartBottom - (value / maximum.maximum) * (chartBottom - chartTop);
          return (
            <g key={value}>
              <line x1={chartLeft} x2={chartRight} y1={y} y2={y} stroke="#dfe5ec" strokeWidth="1" />
              <text x="44" y={y + 5} fill="#475569" fontSize="13" textAnchor="end">
                {value === 0
                  ? "0"
                  : formatCompactAxisNumber(value, metricKey === "costPerResult" ? "currency" : "number")}
              </text>
            </g>
          );
        })}
        {devices.map((device, deviceIndex) => {
          const center = chartLeft + deviceIndex * groupWidth + groupWidth / 2;
          const deviceRows = platforms
            .map((platform) => filteredRows.find((row) => row.device === device && row.platform === platform))
            .filter((row): row is PreviewPlatformDistributionRow => Boolean(row));
          return (
            <g
              key={device}
              tabIndex={0}
              className="cursor-pointer"
              onMouseEnter={() => setActiveDevice(device)}
              onMouseLeave={() => setActiveDevice(null)}
              onFocus={() => setActiveDevice(device)}
              onBlur={() => setActiveDevice(null)}
            >
              <rect
                x={chartLeft + deviceIndex * groupWidth}
                y={chartTop}
                width={groupWidth}
                height={chartBottom - chartTop + 28}
                fill="transparent"
              />
              {deviceRows.map((row, rowIndex) => {
                const value = valueFor(row);
                const height = Math.max(
                  (value / maximum.maximum) * (chartBottom - chartTop),
                  value > 0 ? 4 : 1
                );
                return (
                  <rect
                    key={`${device}-${row.platform}`}
                    x={center + (rowIndex - (deviceRows.length - 1) / 2) * (barWidth + 5) - barWidth / 2}
                    y={chartBottom - height}
                    width={barWidth}
                    height={height}
                    rx="3"
                    fill={META_PLATFORM_COLORS[platforms.indexOf(row.platform) % META_PLATFORM_COLORS.length]}
                  />
                );
              })}
              <text x={center} y="294" fill="#475569" fontSize="13" textAnchor="middle">
                {device}
              </text>
            </g>
          );
        })}
        {selectedDevice ? (
          <g transform={`translate(${tooltipX} ${tooltipY})`} pointerEvents="none">
            <rect
              width={tooltipWidth}
              height={tooltipHeight}
              rx="8"
              fill="#ffffff"
              filter="url(#metaAudienceTooltipShadow)"
            />
            <path
              d={`M67 ${tooltipHeight} L77 ${tooltipHeight + 10} L87 ${tooltipHeight} Z`}
              fill="#ffffff"
            />
            <text x="16" y="23" fill="#334155" fontSize="14">{selectedDevice}</text>
            {platforms.map((platform, index) => {
              const row = filteredRows.find((item) => item.device === selectedDevice && item.platform === platform);
              return (
                <MetaAudienceTooltipLine
                  key={platform}
                  y={43 + index * 20}
                  color={META_PLATFORM_COLORS[index % META_PLATFORM_COLORS.length]}
                  label={platform}
                  value={row ? valueFor(row) : 0}
                  valueFormat={metricKey === "costPerResult" ? "currency" : "number"}
                />
              );
            })}
          </g>
        ) : null}
        <defs>
          <filter id="metaAudienceTooltipShadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.15" />
          </filter>
        </defs>
      </svg>
    </div>
  );
}

function MetaPlatformLegend({
  rows,
  metricKey,
  filterKey,
}: {
  rows: PreviewPlatformDistributionRow[];
  metricKey: string;
  filterKey: string;
}) {
  const filteredRows = filterKey === "all" ? rows : rows.filter((row) => row.platform === filterKey);
  const platforms = Array.from(new Set(filteredRows.map((row) => row.platform)));
  const totalResults = filteredRows.reduce((sum, row) => sum + row.results, 0);

  return (
    <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {platforms.map((platform, index) => {
        const platformRows = filteredRows.filter((row) => row.platform === platform);
        const results = platformRows.reduce((sum, row) => sum + row.results, 0);
        const spend = platformRows.reduce(
          (sum, row) => sum + (row.costPerResult ?? 0) * row.results,
          0
        );
        const value = metricKey === "costPerResult" ? (results > 0 ? spend / results : 0) : results;
        return (
          <div key={platform} className="rounded-[14px] border border-[#dbe3ee] bg-white p-5">
            <div className="flex items-center gap-3 font-semibold text-[#0f172a]">
              <span
                className="size-4 rounded"
                style={{ backgroundColor: META_PLATFORM_COLORS[index % META_PLATFORM_COLORS.length] }}
              />
              {platform}
            </div>
            <p className="mt-3 text-[#475569]">
              {metricKey === "costPerResult" ? formatCurrency(value) : formatNumber(value)}
              {metricKey === "results" && totalResults > 0
                ? ` (${Math.round((results / totalResults) * 100)}%)`
                : ""}
            </p>
            <p className="mt-1 text-sm text-[#64748b]">
              {platformRows.map((row) => row.device).join(", ")}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function MetaAudienceTooltipLine({
  y,
  color,
  label,
  value,
  valueFormat,
}: {
  y: number;
  color: string;
  label: string;
  value: number;
  valueFormat: "number" | "currency";
}) {
  return (
    <>
      <rect x="16" y={y - 10} width="8" height="8" rx="2" fill={color} />
      <text x="32" y={y} fill="#334155" fontSize="12">
        {label}
      </text>
      <text x="138" y={y} fill="#0f172a" fontSize="12" fontWeight="700" textAnchor="end">
        {valueFormat === "currency" ? formatCurrency(value) : formatNumber(value)}
      </text>
    </>
  );
}

function MetaAudienceLegendCard({
  color,
  label,
  value,
  total,
  cost,
}: {
  color: string;
  label: string;
  value: number;
  total: number;
  cost: number | null;
}) {
  return (
    <div className="flex items-start gap-3 px-2">
      <span className="mt-1 size-4 rounded" style={{ backgroundColor: color }} />
      <div>
        <p className="text-[1rem] font-medium text-[#0f172a]">{label}</p>
        <p className="mt-1 text-sm text-[#475569]">
          {formatNumber(value)} ({formatPercentage(total > 0 ? value / total : 0)})
        </p>
        <p className="mt-1 text-sm text-[#475569]">
          Cost per result: {cost !== null ? formatCurrency(cost) : "N/A"}
        </p>
      </div>
    </div>
  );
}

function MetaAudienceSummaryCard({
  icon,
  title,
  value,
  compact,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="flex min-h-[108px] items-center gap-4 rounded-[12px] border border-[#dbe3ee] bg-white px-5 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.035)] transition duration-200 hover:-translate-y-1 hover:border-[#b8dce3] hover:shadow-[0_18px_36px_rgba(15,23,42,0.09)]">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-[#e8fbfd] text-[#16bcca]">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[0.92rem] leading-5 text-[#475569]">{title}</p>
        <p className={`${compact ? "text-[0.92rem] leading-6" : "text-[1.3rem] leading-7"} mt-2 font-semibold tracking-[-0.02em] text-[#0f172a]`}>
          {value}
        </p>
      </div>
    </div>
  );
}

interface MetaPerformanceTrendPoint {
  label: string;
  value: number;
}

interface MetaPerformanceMetricOption {
  key: string;
  label: string;
  value: number;
  format: "number" | "currency" | "percent";
}

interface MetaPerformanceKpiCard {
  key: string;
  label: string;
  value: string;
}

const META_AUDIENCE_FILTER_OPTIONS = [
  { key: "all", label: "All" },
  { key: "men", label: "Men" },
  { key: "women", label: "Women" },
  { key: "unknown", label: "Unknown" },
] as const;

const META_AUDIENCE_METRIC_OPTIONS = [
  { key: "results", label: "Results" },
  { key: "costPerResult", label: "Cost per result" },
] as const;

const META_PERFORMANCE_DATE_RANGES = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "14", label: "Last 14 days", days: 14 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "month", label: "This month", days: 31 },
] as const;

function buildMetaPerformanceMetricOptions(
  performance: PreviewPerformanceSummary,
  primaryLabel: string
): MetaPerformanceMetricOption[] {
  const options: MetaPerformanceMetricOption[] = [
    { key: "primary", label: primaryLabel, value: performance.results, format: "number" },
    { key: "impressions", label: "Impressions", value: performance.impressions, format: "number" },
    { key: "clicks", label: "Clicks", value: performance.clicks, format: "number" },
    { key: "linkClicks", label: "Link clicks", value: performance.linkClicks, format: "number" },
    { key: "landingPageViews", label: "Landing page views", value: performance.landingPageViews, format: "number" },
    { key: "spend", label: "Amount spent", value: performance.spend, format: "currency" },
    { key: "ctr", label: "CTR", value: performance.ctr, format: "percent" },
  ];

  return options.filter((option) => Number.isFinite(option.value));
}

function buildMetaPerformanceKpiCards(
  performance: PreviewPerformanceSummary,
  primaryLabel: string
): MetaPerformanceKpiCard[] {
  return [
    { key: "primary", label: primaryLabel, value: formatNumber(performance.results) },
    {
      key: "costPerResult",
      label: "Cost per result",
      value: performance.costPerResult !== null ? formatCurrency(performance.costPerResult) : "N/A",
    },
    { key: "spend", label: "Amount spent", value: formatCurrency(performance.spend) },
    { key: "impressions", label: "Impressions", value: formatNumber(performance.impressions) },
    { key: "clicks", label: "Clicks", value: formatNumber(performance.clicks) },
    { key: "ctr", label: "CTR", value: `${performance.ctr.toFixed(2)}%` },
    { key: "landingPageViews", label: "Landing page views", value: formatNumber(performance.landingPageViews) },
    { key: "linkClicks", label: "Link clicks", value: formatNumber(performance.linkClicks) },
  ];
}

function buildMetaPerformanceTrend(totalValue: number, days: number): MetaPerformanceTrendPoint[] {
  const safeDays = Math.max(days, 1);
  const base = Math.max(totalValue / safeDays, 1);
  const allLabels = [
    "10 May", "11 May", "12 May", "13 May", "14 May", "15 May", "16 May", "17 May",
    "18 May", "19 May", "20 May", "21 May", "22 May", "23 May", "24 May", "25 May",
    "26 May", "27 May", "28 May", "29 May", "30 May", "31 May", "1 Jun", "2 Jun",
    "3 Jun", "4 Jun", "5 Jun", "6 Jun", "7 Jun", "8 Jun",
  ];
  const allShape = [
    0.45, 0.62, 1.05, 1.52, 1.58, 1.62, 1.68, 1.62, 1.48, 1.36,
    1.32, 1.28, 1.55, 1.58, 1.72, 1.88, 1.82, 1.68, 1.72, 1.66,
    1.62, 1.68, 1.82, 1.88, 1.86, 1.7, 1.64, 1.38, 1.08, 0.88,
  ];
  const labels = allLabels.slice(-safeDays);
  const shape = allShape.slice(-safeDays);

  return labels.map((label, index) => ({
    label,
    value: Math.max(Math.round(base * shape[index]), 1),
  }));
}

function buildLineChartGeometry(
  points: MetaPerformanceTrendPoint[],
  valueFormat: MetaPerformanceMetricOption["format"]
) {
  const chartTop = 44;
  const chartBottom = 270;
  const chartLeft = 74;
  const chartRight = 1088;
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const axisScale = buildNiceAxisScale(valueFormat === "number" ? Math.max(maxValue, 4) : maxValue);
  const roundedMax = axisScale.maximum;
  const xStep = (chartRight - chartLeft) / Math.max(points.length - 1, 1);
  const geometryPoints = points.map((point, index) => {
    const x = chartLeft + index * xStep;
    const y = chartBottom - (point.value / roundedMax) * (chartBottom - chartTop);
    return { ...point, x, y };
  });

  return {
    points: geometryPoints,
    path: geometryPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "),
    yTicks: axisScale.ticks.map((value) => {
      const ratio = value / roundedMax;
      return {
        y: chartBottom - ratio * (chartBottom - chartTop),
        label: value === 0 ? "0" : formatCompactAxisNumber(value, valueFormat),
      };
    }),
    xTicks: [0, 5, 10, 15, 20, 25, 29].map((index) => ({
      x: chartLeft + index * xStep,
      label: points[index]?.label ?? "",
    })),
  };
}

function normalizeMetaDemographicRows(rows: PreviewDemographicRow[]): PreviewDemographicRow[] {
  const preferredOrder = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
  return [...rows].sort((left, right) => {
    const leftIndex = preferredOrder.indexOf(left.ageRange);
    const rightIndex = preferredOrder.indexOf(right.ageRange);
    if (leftIndex === -1 && rightIndex === -1) {
      return left.ageRange.localeCompare(right.ageRange);
    }
    if (leftIndex === -1) {
      return 1;
    }
    if (rightIndex === -1) {
      return -1;
    }
    return leftIndex - rightIndex;
  });
}

function buildAudienceChartGeometry(rows: PreviewDemographicRow[], metricKey: string, filterKey: string) {
  const chartTop = 28;
  const chartBottom = 270;
  const chartLeft = 74;
  const chartRight = 1088;
  const visibleSegments = getVisibleAudienceSegments(filterKey);
  const maxValue = Math.max(
    ...rows.flatMap((row) => [
      visibleSegments.includes("men") ? getAudienceMetricValue(row, "men", metricKey) : 0,
      visibleSegments.includes("women") ? getAudienceMetricValue(row, "women", metricKey) : 0,
      visibleSegments.includes("unknown") ? getAudienceMetricValue(row, "unknown", metricKey) : 0,
    ]),
    1
  );
  const axisScale = buildNiceAxisScale(maxValue);
  const roundedMax = axisScale.maximum;
  const groupWidth = (chartRight - chartLeft) / Math.max(rows.length, 1);
  const barWidth = Math.min(groupWidth * 0.16, 18);

  return {
    groups: rows.map((row, index) => {
      const groupStart = chartLeft + index * groupWidth;
      const center = groupStart + groupWidth / 2;
      const values = [
        { label: "Men", value: getAudienceMetricValue(row, "men", metricKey), color: "#5b35c9" },
        { label: "Women", value: getAudienceMetricValue(row, "women", metricKey), color: "#17bec9" },
        { label: "Unknown", value: getAudienceMetricValue(row, "unknown", metricKey), color: "#c5cbd3" },
      ].filter((item) => visibleSegments.includes(item.label.toLowerCase() as "men" | "women" | "unknown"));
      const bars = values.map((item, itemIndex) => {
        const height = Math.max((item.value / roundedMax) * (chartBottom - chartTop), item.value > 0 ? 4 : 1);
        return {
          ...item,
          width: barWidth,
          height,
          x: center + (itemIndex - (values.length - 1) / 2) * (barWidth + 4) - barWidth / 2,
          y: chartBottom - height,
        };
      });

      return {
        ageRange: row.ageRange,
        x: center - 18,
        tooltipY: Math.min(...bars.map((bar) => bar.y)),
        bars,
      };
    }),
    yTicks: axisScale.ticks.map((value) => {
      const ratio = value / roundedMax;
      return {
        y: chartBottom - ratio * (chartBottom - chartTop),
        label: value === 0 ? "0" : formatCompactAxisNumber(value, metricKey === "costPerResult" ? "currency" : "number"),
      };
    }),
  };
}

function buildNiceAxisScale(maxValue: number, intervalCount = 4): {
  maximum: number;
  ticks: number[];
} {
  const safeMax = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 1;
  const rawStep = safeMax / intervalCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalizedStep = rawStep / magnitude;
  const niceFactors = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10];
  const factor = niceFactors.find((candidate) => candidate >= normalizedStep) ?? 10;
  const step = factor * magnitude;
  const maximum = step * intervalCount;

  return {
    maximum,
    ticks: Array.from(
      { length: intervalCount + 1 },
      (_, index) => maximum - index * step
    ),
  };
}

function getVisibleAudienceSegments(filterKey: string): Array<"men" | "women" | "unknown"> {
  if (filterKey === "men" || filterKey === "women" || filterKey === "unknown") {
    return [filterKey];
  }
  return ["men", "women", "unknown"];
}

function getAudienceMetricValue(
  row: PreviewDemographicRow,
  segment: "men" | "women" | "unknown",
  metricKey: string
): number {
  if (metricKey === "costPerResult") {
    if (segment === "men") {
      return row.maleCostPerResult ?? 0;
    }
    if (segment === "women") {
      return row.femaleCostPerResult ?? 0;
    }
    return row.unknownCostPerResult ?? 0;
  }

  if (segment === "men") {
    return row.maleResults;
  }
  if (segment === "women") {
    return row.femaleResults;
  }
  return row.unknownResults;
}

function buildMetaAudienceTotals(rows: PreviewDemographicRow[]) {
  const totals = rows.reduce(
    (current, row) => {
      current.men += row.maleResults;
      current.women += row.femaleResults;
      current.unknown += row.unknownResults;
      current.menCostValues.push(row.maleCostPerResult);
      current.womenCostValues.push(row.femaleCostPerResult);
      current.unknownCostValues.push(row.unknownCostPerResult);
      return current;
    },
    {
      men: 0,
      women: 0,
      unknown: 0,
      menCostValues: [] as Array<number | null>,
      womenCostValues: [] as Array<number | null>,
      unknownCostValues: [] as Array<number | null>,
    }
  );

  return {
    men: totals.men,
    women: totals.women,
    unknown: totals.unknown,
    all: totals.men + totals.women + totals.unknown,
    menCost: averageNullable(totals.menCostValues),
    womenCost: averageNullable(totals.womenCostValues),
    unknownCost: averageNullable(totals.unknownCostValues),
  };
}

function findTopAudienceSegment(rows: PreviewDemographicRow[]): string {
  const top = rows
    .flatMap((row) => [
      { label: `${row.ageRange} Men`, value: row.maleResults },
      { label: `${row.ageRange} Women`, value: row.femaleResults },
      { label: `${row.ageRange} Unknown`, value: row.unknownResults },
    ])
    .sort((left, right) => right.value - left.value)[0];

  return top?.value ? top.label : "Not available";
}

function findBestCostAudienceSegment(rows: PreviewDemographicRow[]): string {
  const best = rows
    .flatMap((row) => [
      { label: `${row.ageRange} Men`, value: row.maleCostPerResult },
      { label: `${row.ageRange} Women`, value: row.femaleCostPerResult },
      { label: `${row.ageRange} Unknown`, value: row.unknownCostPerResult },
    ])
    .filter((item): item is { label: string; value: number } => item.value !== null && item.value > 0)
    .sort((left, right) => left.value - right.value)[0];

  return best?.label ?? "Not available";
}

function buildAudienceInsightText(rows: PreviewDemographicRow[]): string {
  const strongestRows = [...rows]
    .map((row) => ({
      ageRange: row.ageRange,
      value: row.maleResults + row.femaleResults + row.unknownResults,
    }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 2)
    .filter((row) => row.value > 0);

  if (strongestRows.length === 0) {
    return "Audience results are not available yet.";
  }

  return `Most results came from users aged ${strongestRows.map((row) => row.ageRange).join(" and ")}.`;
}

function averageNullable(values: Array<number | null>): number | null {
  const validValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (validValues.length === 0) {
    return null;
  }
  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#cbd5e1] bg-white px-4 py-3 text-sm text-[#64748b]">
      {message}
    </div>
  );
}

function formatGoogleDisplayPath(displayPathParts?: string[]): string {
  if (!displayPathParts || displayPathParts.length === 0) {
    return "google.com";
  }

  return `google.com / ${displayPathParts.filter(Boolean).join(" / ")}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 }).format(value);
}

function formatCompactAxisNumber(value: number, valueFormat: "number" | "currency" | "percent" = "number"): string {
  if (valueFormat === "currency") {
    if (value >= 1000) {
      return `RM${Math.round(value / 1000)}K`;
    }
    return `RM${new Intl.NumberFormat("en-MY", {
      maximumFractionDigits: value < 10 ? 2 : 0,
    }).format(value)}`;
  }
  if (valueFormat === "percent") {
    return `${new Intl.NumberFormat("en-MY", {
      maximumFractionDigits: value < 10 ? 2 : 0,
    }).format(value)}%`;
  }
  if (value >= 1000000) {
    return `${Math.round(value / 1000000)}M`;
  }
  if (value >= 1000) {
    return `${Math.round(value / 1000)}K`;
  }
  return formatNumber(value);
}

function formatMetaMetricValue(value: number, valueFormat: "number" | "currency" | "percent"): string {
  if (valueFormat === "currency") {
    return formatCurrency(value);
  }
  if (valueFormat === "percent") {
    return `${value.toFixed(2)}%`;
  }
  return formatNumber(value);
}

function formatPercentage(value: number): string {
  return new Intl.NumberFormat("en-MY", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
