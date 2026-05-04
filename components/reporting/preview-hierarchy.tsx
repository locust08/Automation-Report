"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3Icon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FolderIcon,
  ImageIcon,
  InfoIcon,
  LayoutPanelLeftIcon,
  Link2Icon,
  MegaphoneIcon,
  SearchIcon,
  SmartphoneIcon,
  XIcon,
} from "lucide-react";

import {
  PreviewAdNode,
  PreviewDemographicRow,
  PreviewDetailField,
  PreviewPerformanceSummary,
  PreviewPlatformSection,
} from "@/lib/reporting/types";

export function PreviewHierarchy({
  section,
  initialCampaignId,
  onCampaignChange,
}: {
  section: PreviewPlatformSection;
  initialCampaignId: string;
  onCampaignChange?: (next: {
    platform: "meta" | "google";
    campaignId: string;
    campaignName: string;
  }) => void;
}) {
  if (section.platform === "meta") {
    return (
      <MetaAdsPreviewWorkspace
        section={section}
        initialCampaignId={initialCampaignId}
        onCampaignChange={onCampaignChange}
      />
    );
  }

  return (
    <GoogleAdsPreviewWorkspace
      section={section}
      initialCampaignId={initialCampaignId}
      onCampaignChange={onCampaignChange}
    />
  );
}

function MetaAdsPreviewWorkspace({
  section,
  initialCampaignId,
  onCampaignChange,
}: WorkspaceProps) {
  const {
    selectedCampaign,
    selectedChild,
    selectedAd,
    children,
    ads,
    selectCampaign,
    selectChild,
    selectAd,
  } = usePreviewSelection(section, initialCampaignId, onCampaignChange);

  const detailFields = [
    ...(selectedCampaign?.details ?? []),
    ...(selectedChild?.details ?? []),
    ...(selectedAd?.details ?? []),
  ];
  const performance =
    selectedAd?.performance ?? selectedChild?.performance ?? selectedCampaign?.performance ?? null;
  const demographics =
    selectedAd?.demographics ?? selectedChild?.demographics ?? selectedCampaign?.demographics ?? [];
  const previewLinks = selectedAd?.previewLinks ?? [];

  return (
    <section className="space-y-6">
      <div className="rounded-[32px] border border-[#dbe3ee] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#5b6471]">
          <div className="flex size-8 items-center justify-center rounded-2xl bg-[#eaf2ff] text-[#1b74e4] shadow-sm">
            <FolderIcon className="size-4" />
          </div>
          <span>{selectedCampaign?.name || "Campaign"}</span>
          <span>/</span>
          <span>{selectedChild?.name || "Ad Set"}</span>
          <span>/</span>
          <span>{selectedAd?.name || "Ad"}</span>
        </div>

        <div className="mt-4 space-y-4">
          <div className="grid items-start gap-3 lg:grid-cols-3 xl:gap-4">
            <SelectionPicker
              title="Campaign"
              icon={<FolderIcon className="size-4" />}
              items={section.campaigns}
              selectedId={selectedCampaign?.id ?? ""}
              selectedLabel={selectedCampaign?.name ?? "Choose campaign"}
              onSelect={selectCampaign}
            />
            <SelectionPicker
              title="Ad Set"
              icon={<LayoutPanelLeftIcon className="size-4" />}
              items={children}
              selectedId={selectedChild?.id ?? ""}
              selectedLabel={selectedChild?.name ?? "Choose ad set"}
              onSelect={selectChild}
              emptyMessage="No ad sets were returned for the selected campaign."
            />
            <SelectionPicker
              title="Ad"
              icon={<MegaphoneIcon className="size-4" />}
              items={ads}
              selectedId={selectedAd?.id ?? ""}
              selectedLabel={selectedAd?.name ?? "Choose ad"}
              onSelect={selectAd}
              emptyMessage="No ads were returned for the selected ad set."
            />
          </div>
          <DetailPanel fields={detailFields} previewLinks={previewLinks} />
        </div>
      </div>

      {children.length === 0 ? (
        <EmptyState message="No ad sets are available under the selected campaign." />
      ) : null}

      <div className="rounded-[32px] border border-[#dbe3ee] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-[#1b74e4]">
          <BarChart3Icon className="size-5" />
          <h3 className="text-xl font-semibold text-[#111827]">Performance section</h3>
        </div>
        <PerformanceSection
          performance={performance}
          emptyMessage="No performance data was returned for the current Meta Ads selection."
        />
      </div>

      <div className="rounded-[32px] border border-[#dbe3ee] bg-white p-5 shadow-sm">
        <h3 className="text-xl font-semibold text-[#111827]">Demographic section</h3>
        <DemographicSection
          rows={demographics}
          resultLabel={performance?.resultLabel ?? "Results"}
          emptyMessage="No demographic data was returned for the current Meta Ads selection."
        />
      </div>
    </section>
  );
}

function GoogleAdsPreviewWorkspace({
  section,
  initialCampaignId,
  onCampaignChange,
}: WorkspaceProps) {
  const {
    selectedCampaign,
    selectedChild,
    selectedAd,
    children,
    ads,
    selectCampaign,
    selectChild,
    selectAd,
  } = usePreviewSelection(section, initialCampaignId, onCampaignChange);
  const previewSlides = useMemo(() => buildGoogleAdPreviewVariations(selectedAd), [selectedAd]);
  const adGroupCount = section.campaigns.reduce((count, campaign) => count + campaign.children.length, 0);
  const adCount = section.campaigns.reduce(
    (count, campaign) =>
      count + campaign.children.reduce((childCount, adGroup) => childCount + adGroup.ads.length, 0),
    0
  );
  const selectedCampaignDetails = selectedCampaign?.details ?? [];
  const selectedChildDetails = selectedChild?.details ?? [];
  const campaignOverviewFields = [
    { label: "Campaign status", value: selectedCampaign?.status || "Unknown" },
    { label: "Networks", value: getDetailFieldValue(selectedCampaignDetails, "Networks") },
    { label: "Budget", value: getDetailFieldValue(selectedCampaignDetails, "Budget") },
    { label: "Locations", value: getDetailFieldValue(selectedCampaignDetails, "Locations") },
    { label: "Languages", value: getDetailFieldValue(selectedCampaignDetails, "Languages") },
    { label: "Channel", value: getDetailFieldValue(selectedCampaignDetails, "Channel") },
    { label: "Serving status", value: getDetailFieldValue(selectedCampaignDetails, "Serving Status") },
    { label: "Bidding strategy", value: getDetailFieldValue(selectedCampaignDetails, "Bidding Strategy") },
    { label: "Start date", value: getDetailFieldValue(selectedCampaignDetails, "Start Date") },
    { label: "End date", value: getDetailFieldValue(selectedCampaignDetails, "End Date") },
    { label: "Ad group status", value: selectedChild?.status || "Unknown" },
    { label: "Ad status", value: selectedAd?.status || "Unknown" },
  ];
  return (
    <section className="mx-auto max-w-[1360px] space-y-6 px-6">
      <div className="rounded-[20px] border border-[#E2E8F0] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-4">
              <GoogleMark />
              <div className="min-w-0">
                <h2 className="truncate text-[2rem] font-semibold text-[#1f2937]">
                  Google Ads Preview
                </h2>
                <p className="mt-1 text-[15px] leading-7 text-[#64748b]">
                  Review campaign setup, ad assets, and live search preview from the Google Ads hierarchy.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <MetricPill label="Campaigns" value={section.campaigns.length} accent="blue" />
              <MetricPill label="Ad Groups" value={adGroupCount} accent="green" />
              <MetricPill label="Ads" value={adCount} accent="amber" />
            </div>
          </div>
          <div className="rounded-[16px] border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">Selected path</p>
            <p className="mt-2 max-w-[420px] text-[14px] leading-7 text-[#334155]">
              <span className="font-semibold text-[#0f172a]">{selectedCampaign?.name || "Campaign"}</span>
              {" / "}
              <span className="font-semibold text-[#0f172a]">{selectedChild?.name || "Ad Group"}</span>
              {" / "}
              <span className="font-semibold text-[#0f172a]">{selectedAd?.name || "Ad"}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SelectionPicker
          title="Campaign"
          icon={<FolderIcon className="size-4" />}
          items={section.campaigns}
          selectedId={selectedCampaign?.id ?? ""}
          selectedLabel={selectedCampaign?.name ?? "Choose campaign"}
          onSelect={selectCampaign}
        />
        <SelectionPicker
          title="Ad Group"
          icon={<LayoutPanelLeftIcon className="size-4" />}
          items={children}
          selectedId={selectedChild?.id ?? ""}
          selectedLabel={selectedChild?.name ?? "Choose ad group"}
          onSelect={selectChild}
          emptyMessage="No ad groups were returned for the selected campaign."
        />
        <SelectionPicker
          title="Ad"
          icon={<MegaphoneIcon className="size-4" />}
          items={ads}
          selectedId={selectedAd?.id ?? ""}
          selectedLabel={selectedAd?.name ?? "Choose ad"}
          onSelect={selectAd}
          emptyMessage="No ads were returned for the selected ad group."
        />
      </div>

      {children.length === 0 ? <EmptyState message="No ad groups are available under the selected campaign." /> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(440px,480px)] 2xl:grid-cols-[minmax(0,1fr)_500px]">
        <div className="space-y-6">
          <GoogleSectionCard
            title="Campaign Overview"
            subtitle="Live campaign metadata from the selected Google Ads entities."
            icon={<BarChart3Icon className="size-6" />}
            badge={selectedCampaign?.status || "Unknown"}
            badgeTone={selectedCampaign?.status === "Enabled" ? "green" : "slate"}
          >
            <div className="grid overflow-hidden rounded-[16px] border border-[#E2E8F0] md:grid-cols-2">
              {campaignOverviewFields.map((field, index) => (
                <div
                  key={field.label}
                  className={`border-[#E2E8F0] px-5 py-4 ${
                    index < campaignOverviewFields.length - 2 ? "border-b" : ""
                  } ${index % 2 === 0 ? "border-r" : ""}`}
                >
                  <p className="text-[12px] font-medium text-[#64748b]">{field.label}</p>
                  <p className="mt-1.5 text-[15px] font-semibold text-[#0f172a]">
                    {field.value || "Not available"}
                  </p>
                </div>
              ))}
            </div>
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

        <div className="xl:sticky xl:top-6 xl:self-start">
          <GoogleSearchPreviewPanel
            key={selectedAd?.id ?? "empty"}
            slides={previewSlides}
            externalPreviewUrl={selectedAd?.previewLinks?.[0]?.url ?? null}
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
    <section className="rounded-[18px] border border-[#E2E8F0] bg-white p-6 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-[14px] border border-[#dbe7ff] bg-[#edf4ff] text-[#1A73E8]">
            {icon}
          </div>
          <div>
            <h3 className="text-[24px] font-semibold text-[#0f172a]">{title}</h3>
            {subtitle ? <p className="mt-1 text-[14px] leading-6 text-[#64748b]">{subtitle}</p> : null}
          </div>
        </div>
        {badge ? (
          <span className={`rounded-full border px-4 py-2 text-sm font-medium ${badgeClassName}`}>
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-6">{children}</div>
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
      <div className="grid gap-3 lg:grid-cols-2">
        {visibleItems.map((item) => (
          <a
            key={item.id}
            href={item.finalUrl || "#"}
            target={item.finalUrl ? "_blank" : undefined}
            rel={item.finalUrl ? "noreferrer" : undefined}
            className="flex h-full min-h-[132px] flex-col justify-between rounded-[16px] border border-[#E2E8F0] bg-white p-4 transition hover:border-[#bfdbfe]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-[#1A73E8]">{item.linkText}</p>
                <p className="mt-2 overflow-hidden text-[14px] leading-6 text-[#4b5563] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
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
}: {
  slides: GooglePreviewSlide[];
  externalPreviewUrl: string | null;
}) {
  const [index, setIndex] = useState(0);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const safeIndex = Math.min(index, Math.max(slides.length - 1, 0));
  const slide = slides[safeIndex] ?? null;
  const hasPreview = Boolean(slide);
  const maxVisibleDots = 5;
  const visibleDotCount = Math.min(slides.length, maxVisibleDots);
  const dotWindowStart = Math.max(0, Math.min(safeIndex - Math.floor(maxVisibleDots / 2), slides.length - visibleDotCount));
  const visibleDotIndexes = Array.from({ length: visibleDotCount }, (_, offset) => dotWindowStart + offset);

  return (
    <>
    <section className="min-w-0 rounded-[30px] border border-[#E2E8F0] bg-white px-6 py-7 shadow-[0_22px_60px_rgba(15,23,42,0.05)] sm:px-8 sm:py-8">
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-[20px] border border-[#dbe3ef] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] text-[#2563eb] shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
            <SmartphoneIcon className="size-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-[2rem] font-semibold tracking-[-0.04em] text-[#0f172a]">Preview</h3>
                <p className="mt-1 max-w-[420px] text-[15px] leading-7 text-[#64748b]">
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
                  className="inline-flex min-h-12 items-center justify-center rounded-[16px] border border-[#2563eb] bg-white px-5 py-3 text-base font-medium text-[#2563eb] transition hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:border-[#cbd5e1] disabled:text-[#94a3b8] disabled:hover:bg-white"
                >
                  Full Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-[28px] bg-[radial-gradient(circle_at_center,rgba(255,255,255,1)_0%,rgba(248,250,252,0.92)_48%,rgba(255,255,255,1)_100%)] px-4 py-6 sm:px-8 sm:py-8">
        {slide ? (
          <div className="flex justify-center">
            <GoogleMobilePreviewCard slide={slide} />
          </div>
        ) : (
          <div className="rounded-[28px] border border-dashed border-[#cfd8e3] bg-[#fbfcfe] px-6 py-10">
            <EmptyState message="No Google preview was returned for the current selection." />
          </div>
        )}
      </div>

      {slide && slides.length > 1 ? (
        <div className="mx-auto mt-6 max-w-[360px]">
          <div className="flex items-center justify-center gap-5">
            <button
              type="button"
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
              disabled={safeIndex === 0}
              className="flex size-12 items-center justify-center rounded-full border border-[#d7dbe3] bg-white text-[#7b8794] shadow-[0_8px_20px_rgba(15,23,42,0.06)] transition hover:border-[#aecbfa] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous preview"
            >
              <ChevronLeftIcon className="size-5" />
            </button>
            <div className="flex items-center gap-4">
              {visibleDotIndexes.map((dotIndex) => (
                <button
                  key={dotIndex}
                  type="button"
                  onClick={() => setIndex(dotIndex)}
                  className={`rounded-full transition-all ${
                    dotIndex === safeIndex ? "size-3 bg-[#2563eb]" : "size-2.5 bg-[#d6dbe3]"
                  }`}
                  aria-label={`Go to preview ${dotIndex + 1}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setIndex((current) => Math.min(slides.length - 1, current + 1))}
              disabled={safeIndex >= slides.length - 1}
              className="flex size-12 items-center justify-center rounded-full border border-[#d7dbe3] bg-white text-[#7b8794] shadow-[0_8px_20px_rgba(15,23,42,0.06)] transition hover:border-[#aecbfa] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next preview"
            >
              <ChevronRightIcon className="size-5" />
            </button>
          </div>

          <p className="mt-3 text-center text-[13px] font-medium text-[#64748b]">
            Preview {safeIndex + 1} of {slides.length}
          </p>
        </div>
      ) : null}

      <p className="mx-auto mt-8 max-w-[520px] text-center text-base leading-8 text-[#5f6368]">
        This preview shows how your ad may appear on Google Search results across supported devices.
      </p>
    </section>
    {showFullPreview ? (
      <GoogleFullPreviewModal
        slides={slides}
        externalPreviewUrl={externalPreviewUrl}
        onClose={() => setShowFullPreview(false)}
      />
    ) : null}
    </>
  );
}

function GoogleFullPreviewModal({
  slides,
  externalPreviewUrl,
  onClose,
}: {
  slides: GooglePreviewSlide[];
  externalPreviewUrl: string | null;
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
    <div className="fixed inset-0 z-50 bg-[#f8fafc]/95 p-4 backdrop-blur-sm">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-full-preview-title"
        className="mx-auto flex h-full max-h-[calc(100vh-2rem)] w-full max-w-[1800px] flex-col overflow-hidden rounded-[28px] border border-[#E2E8F0] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.18)]"
      >
        <header className="flex flex-col gap-4 border-b border-[#E2E8F0] px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-14 items-center justify-center rounded-[16px] border border-[#dbe3ef] bg-[#f8fbff] text-[#2563eb]">
              <SmartphoneIcon className="size-6" />
            </div>
            <div>
              <h2 id="google-full-preview-title" className="text-2xl font-semibold text-[#0f172a]">
                Full Preview
              </h2>
              <p className="mt-1 text-sm text-[#64748b]">
                See how your ad may appear across different search queries on mobile devices
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

        <div className="flex-1 overflow-auto bg-[#f8fafc] px-6 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-base text-[#0f172a]">
              <span>
                {hasPreviewData
                  ? `Showing ${pageStart + 1}-${pageEnd} of ${slides.length} previews`
                  : "Showing 0 of 0 previews"}
              </span>
              <InfoIcon className="size-4 text-[#64748b]" aria-hidden="true" />
            </div>

            {externalPreviewUrl ? (
              <a
                href={externalPreviewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-[#d7dee7] bg-white px-4 py-2.5 text-sm font-medium text-[#0f172a] transition hover:border-[#2563eb] hover:text-[#2563eb]"
              >
                Open in Google
                <ExternalLinkIcon className="size-4" />
              </a>
            ) : (
              <button
                type="button"
                disabled
                title="Google external preview link is not available."
                className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-[12px] border border-[#d7dee7] bg-white px-4 py-2.5 text-sm font-medium text-[#94a3b8]"
              >
                Open in Google
                <ExternalLinkIcon className="size-4" />
              </button>
            )}
          </div>

          {hasPreviewData ? (
            <>
              <div className="mt-6 overflow-x-auto pb-4">
                <div className="grid min-w-[1240px] grid-cols-5 gap-6">
                  {visibleSlides.map((slide, slideIndex) => (
                    <div
                      key={slide.id}
                      aria-label={`Preview variation ${pageStart + slideIndex + 1}`}
                      className="rounded-[24px] border border-[#E2E8F0] bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.06)]"
                    >
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
              </div>
            </>
          ) : (
            <div className="mt-8 rounded-[20px] border border-dashed border-[#cbd5e1] bg-white px-6 py-12 text-center text-[#64748b]">
              No preview data available for this ad.
            </div>
          )}

          <div className="mt-6 flex items-center gap-3 rounded-[16px] border border-[#d7dee7] bg-white px-5 py-4 text-sm text-[#334155]">
            <InfoIcon className="size-5 shrink-0 text-[#2563eb]" />
            <p>These previews are generated based on your selected ad assets and may not reflect all possible variations.</p>
          </div>
        </div>
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
  const searchTabs = ["All", "Images", "News", "Videos", "Maps", "More"];
  const businessLabel = slide.businessName || slide.displayDomain;
  const displayUrlLabel = slide.displayPath
    ? `${slide.displayDomain} / ${slide.displayPath}`
    : slide.displayDomain;
  const maxWidthClass = fullSize ? "max-w-[420px]" : compact ? "max-w-[220px]" : "max-w-[360px]";

  return (
    <div className={`mx-auto ${fullSize ? "max-w-[560px]" : compact ? "max-w-[220px]" : "max-w-[470px]"}`}>
      <div
        className={`mx-auto w-full aspect-[78/160.9] rounded-[46px] border-[4px] border-[#2f2f2f] bg-[#111111] p-[5px] shadow-[0_28px_80px_rgba(15,23,42,0.2)] ${maxWidthClass}`}
      >
        <div className="flex h-full flex-col overflow-hidden rounded-[40px] border border-[#101010] bg-white">
          <div className="px-5 pb-4 pt-3">
            <div className="flex items-center justify-between text-[#111827]">
              <span className="text-[14px] font-semibold">9:41</span>
              <div className="flex h-9 w-[96px] items-center justify-end">
                <div className="h-8 w-[78px] rounded-full bg-[#050505]" />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center" aria-label="Google">
              <span className="text-[34px] font-medium leading-none tracking-[-0.04em]">
                <span className="text-[#4285f4]">G</span>
                <span className="text-[#ea4335]">o</span>
                <span className="text-[#fbbc05]">o</span>
                <span className="text-[#4285f4]">g</span>
                <span className="text-[#34a853]">l</span>
                <span className="text-[#ea4335]">e</span>
              </span>
            </div>

            <div className="mt-5 rounded-full border border-[#e3e6ea] bg-white px-4 py-3 shadow-[0_4px_12px_rgba(60,64,67,0.1)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <SearchIcon className="size-5 shrink-0 text-[#6b7280]" />
                  <span className="truncate text-[14px] text-[#111827]">
                    {slide.searchQuery}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-4 w-1 rounded-full bg-[#4285f4]" />
                  <div className="size-4 rounded-full border border-[#dbe2ea]" />
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-5 overflow-hidden whitespace-nowrap text-[13px] text-[#6b7280]">
              {searchTabs.map((tab, index) => (
                <div key={tab} className="flex flex-col items-center">
                  <span className={index === 0 ? "font-medium text-[#2563eb]" : ""}>{tab}</span>
                  <span className={`mt-2 h-0.5 w-8 rounded-full ${index === 0 ? "bg-[#2563eb]" : "bg-transparent"}`} />
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-[#edf1f4] px-5 pb-5 pt-4">
            <p className="text-[13px] font-medium text-[#111827]">Sponsored</p>
            <div className="mt-4 flex items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                {slide.businessLogoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={slide.businessLogoUrl}
                    alt={slide.businessName || "Business logo"}
                    className="size-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex size-9 items-center justify-center rounded-full bg-[#e8f0fe] text-sm font-semibold text-[#2563eb]">
                    {slide.businessName?.slice(0, 1).toUpperCase() ?? "G"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-[#202124]">{businessLabel}</p>
                  <p className="truncate text-[12px] text-[#6b7280]">{displayUrlLabel}</p>
                </div>
              </div>
              <EllipsisVerticalIcon className="mt-1 size-4 shrink-0 text-[#5f6368]" />
            </div>

            <div className="mt-4">
              <h4 className="text-[20px] leading-[1.2] text-[#1a0dab]">{slide.headline}</h4>
              <p className="mt-3 text-[14px] leading-[1.55] text-[#4b5563]">{slide.description}</p>
            </div>

            {slide.sitelinks.length > 0 ? (
              <div className="mt-5 border-t border-[#edf1f4]">
                {slide.sitelinks.slice(0, 4).map((sitelink) => (
                  <div key={sitelink.id} className="flex items-center justify-between border-b border-[#edf1f4] py-4">
                    <span className="text-[15px] font-medium text-[#1a73e8]">{sitelink.linkText}</span>
                    <ChevronRightIcon className="size-4 text-[#6b7280]" />
                  </div>
                ))}
              </div>
            ) : null}

            {slide.callText || slide.locationText ? (
              <div className="mt-4 space-y-2 border-t border-[#edf1f4] pt-3 text-[12px] text-[#4b5563]">
                {slide.callText ? <p>Call {slide.callText}</p> : null}
                {slide.locationText ? <p>{slide.locationText}</p> : null}
              </div>
            ) : null}

            <div className="mx-auto mt-4 h-1.5 w-32 rounded-full bg-[#e8eaed]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function getDetailFieldValue(fields: PreviewDetailField[], label: string): string {
  return fields.find((field) => field.label === label)?.value ?? "";
}

interface WorkspaceProps {
  section: PreviewPlatformSection;
  initialCampaignId: string;
  onCampaignChange?: (next: {
    platform: "meta" | "google";
    campaignId: string;
    campaignName: string;
  }) => void;
}

function usePreviewSelection(
  section: PreviewPlatformSection,
  initialCampaignId: string,
  onCampaignChange?: WorkspaceProps["onCampaignChange"]
) {
  const [campaignIdState, setCampaignIdState] = useState(initialCampaignId);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [selectedAdId, setSelectedAdId] = useState("");

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
    },
    selectAd: setSelectedAdId,
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
}: {
  title: string;
  icon: ReactNode;
  items: Array<{ id: string; name: string; status: string }>;
  selectedId: string;
  selectedLabel: string;
  onSelect: (id: string) => void;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);

  function handleSelect(id: string) {
    onSelect(id);
    setOpen(false);
  }

  return (
    <div className="self-start rounded-[24px] border border-[#dde6f1] bg-[linear-gradient(180deg,#f8fbff_0%,#f3f7fc_100%)] p-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-[#334155]">
        <span className="flex size-7 items-center justify-center rounded-xl bg-white text-[#4b5563] shadow-sm ring-1 ring-[#e2e8f0]">
          {icon}
        </span>
        <span>{title}</span>
      </div>
      {items.length > 0 ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="flex w-full items-center justify-between rounded-2xl border border-[#d4deea] bg-white px-3 py-3 text-left shadow-[0_6px_16px_rgba(15,23,42,0.04)] transition hover:border-[#bfdbfe]"
            aria-expanded={open}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#0f172a]">{selectedLabel}</p>
              <p className="mt-1 text-xs text-[#64748b]">
                {open ? `Hide ${title.toLowerCase()} options` : `Choose ${title.toLowerCase()}`}
              </p>
            </div>
            <ChevronDownIcon
              className={`size-4 shrink-0 text-[#64748b] transition ${open ? "rotate-180" : ""}`}
            />
          </button>

          {open ? (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`flex w-full items-start justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                    item.id === selectedId
                      ? "border-[#1b74e4] bg-[#e7f0fe] text-[#0f172a] shadow-[0_8px_18px_rgba(27,116,228,0.12)]"
                      : "border-[#e5e7eb] bg-white text-[#334155] hover:border-[#bfdbfe]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="mt-1 text-xs text-[#64748b]">{item.status}</p>
                  </div>
                  {item.id === selectedId ? <CheckIcon className="mt-0.5 size-4 shrink-0 text-[#1b74e4]" /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <EmptyState message={emptyMessage ?? `No ${title.toLowerCase()} returned.`} />
      )}
    </div>
  );
}

function DetailPanel({
  fields,
  previewLinks,
}: {
  fields: PreviewDetailField[];
  previewLinks: Array<{ label: string; url: string }>;
}) {
  return (
    <div className="rounded-[28px] border border-[#dde6f1] bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[#0f172a]">Detail panel</h3>
          <p className="mt-1 text-sm text-[#64748b]">
            Selected campaign, ad set, and ad metadata in one streamlined view.
          </p>
        </div>
        <span className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2563eb]">
          Meta preview
        </span>
      </div>
      {fields.length > 0 ? (
        <dl className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {fields.map((field) => (
            <div
              key={`${field.label}-${field.value}`}
              className="rounded-2xl border border-[#edf2f7] bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-3 py-3 shadow-[0_6px_18px_rgba(15,23,42,0.04)]"
            >
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">
                {field.label}
              </dt>
              <dd className="mt-1 text-sm text-[#0f172a]">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="mt-4">
          <EmptyState message="No detail fields were returned for the current selection." />
        </div>
      )}

      {previewLinks.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-[#dbeafe] bg-[#eff6ff] p-4">
          <p className="text-sm font-semibold text-[#1d4ed8]">Preview links</p>
          <div className="mt-3 space-y-2">
            {previewLinks.map((link) => (
              <a
                key={`${link.label}-${link.url}`}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm text-[#1b74e4] shadow-sm"
              >
                <span className="truncate">{link.label}</span>
                <ExternalLinkIcon className="ml-3 size-4 shrink-0" />
              </a>
            ))}
          </div>
        </div>
      ) : null}
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
  if (!performance) {
    return (
      <div className="mt-4">
        <EmptyState message={emptyMessage} />
      </div>
    );
  }

  const cards = [
    { label: performance.resultLabel, value: formatNumber(performance.results) },
    { label: "Amount spent", value: formatCurrency(performance.spend) },
    { label: "Impressions", value: formatNumber(performance.impressions) },
    { label: "Clicks", value: formatNumber(performance.clicks) },
    { label: "CTR", value: `${performance.ctr.toFixed(2)}%` },
    {
      label: "Cost per result",
      value: performance.costPerResult !== null ? formatCurrency(performance.costPerResult) : "N/A",
    },
    { label: "Landing page views", value: formatNumber(performance.landingPageViews) },
    { label: "Link clicks", value: formatNumber(performance.linkClicks) },
  ];

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-4">
          <p className="text-sm text-[#64748b]">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold text-[#0f172a]">{card.value}</p>
        </div>
      ))}
    </div>
  );
}

function DemographicSection({
  rows,
  resultLabel,
  emptyMessage,
}: {
  rows: PreviewDemographicRow[];
  resultLabel: string;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState message={emptyMessage} />
      </div>
    );
  }

  const maximum = Math.max(
    ...rows.flatMap((row) => [row.maleResults, row.femaleResults, row.unknownResults]),
    1
  );

  return (
    <div className="mt-4 space-y-4">
      {rows.map((row) => (
        <div key={row.ageRange} className="rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#0f172a]">{row.ageRange}</p>
            <p className="text-xs text-[#64748b]">{resultLabel}</p>
          </div>
          <DemographicBar label="Men" value={row.maleResults} max={maximum} color="bg-[#5b3cc4]" />
          <DemographicBar label="Women" value={row.femaleResults} max={maximum} color="bg-[#29c2c9]" />
          {row.unknownResults > 0 ? (
            <DemographicBar label="Unknown" value={row.unknownResults} max={maximum} color="bg-[#94a3b8]" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DemographicBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-sm text-[#475569]">
        <span>{label}</span>
        <span>{formatNumber(value)}</span>
      </div>
      <div className="h-3 rounded-full bg-[#e2e8f0]">
        <div
          className={`h-3 rounded-full ${color}`}
          style={{ width: `${Math.max((value / max) * 100, value > 0 ? 4 : 0)}%` }}
        />
      </div>
    </div>
  );
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
