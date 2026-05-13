"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3Icon,
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
  HouseIcon,
  ImageIcon,
  InfoIcon,
  LayoutPanelLeftIcon,
  Link2Icon,
  MenuIcon,
  MegaphoneIcon,
  MonitorIcon,
  PencilIcon,
  RefreshCwIcon,
  SearchIcon,
  Settings2Icon,
  SmartphoneIcon,
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
  PreviewPlatformSection,
} from "@/lib/reporting/types";

export function PreviewHierarchy({
  section,
  initialCampaignId,
  companyName,
  onCampaignChange,
}: {
  section: PreviewPlatformSection;
  initialCampaignId: string;
  companyName?: string | null;
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
        companyName={companyName}
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
  companyName,
  onCampaignChange,
}: WorkspaceProps & { companyName?: string | null }) {
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
  const performance =
    selectedAd?.performance ?? selectedChild?.performance ?? selectedCampaign?.performance ?? null;
  const demographics =
    selectedAd?.demographics ?? selectedChild?.demographics ?? selectedCampaign?.demographics ?? [];
  const campaignDetails = selectedCampaign?.details ?? [];
  const adSetDetails = selectedChild?.details ?? [];
  const adDetails = selectedAd?.details ?? [];
  const creative = selectedAd?.creative ?? null;
  const previewPlacements = useMemo(
    () => buildMetaPreviewPlacements(selectedAd?.previewLinks ?? []),
    [selectedAd?.previewLinks]
  );
  const [activePlacementKey, setActivePlacementKey] = useState("");
  const activePlacement =
    previewPlacements.find((placement) => placement.key === activePlacementKey) ??
    previewPlacements[0] ??
    null;
  const companyLabel = companyName?.trim() || section.title;
  const quickSummaryCards = [
    {
      label: "Objective",
      value: getDetailFieldValue(campaignDetails, "Objective") || "Not available",
      accent: "violet" as const,
      icon: <BarChart3Icon className="size-5" />,
    },
    {
      label: "Status",
      value: selectedAd?.status || selectedChild?.status || selectedCampaign?.status || "Unknown",
      accent: "green" as const,
      icon: <InfoIcon className="size-5" />,
    },
    {
      label: "Schedule",
      value: buildMetaScheduleSummary(adSetDetails),
      accent: "blue" as const,
      icon: <CalendarDaysIcon className="size-5" />,
    },
    {
      label: "CTA",
      value: getDetailFieldValue(adDetails, "Call to action") || "Not available",
      accent: "amber" as const,
      icon: <MegaphoneIcon className="size-5" />,
    },
    {
      label: "Audience",
      value: buildMetaAudienceSummary(adSetDetails),
      accent: "rose" as const,
      icon: <UsersIcon className="size-5" />,
    },
  ];
  const previewSummaryCards = [
    {
      label: "Headline",
      value: creative?.title || getDetailFieldValue(adDetails, "Headline") || "Not available",
      accent: "violet" as const,
      icon: <FileTextIcon className="size-5" />,
    },
    {
      label: "Primary Text",
      value: creative?.body || getDetailFieldValue(adDetails, "Primary text") || "Not available",
      accent: "blue" as const,
      icon: <FileTextIcon className="size-5" />,
    },
    {
      label: "Call to Action",
      value: getDetailFieldValue(adDetails, "Call to action") || "Not available",
      accent: "green" as const,
      icon: <MegaphoneIcon className="size-5" />,
    },
    {
      label: "Destination URL",
      value: creative?.linkUrl || getDetailFieldValue(adDetails, "Destination URL") || "Not available",
      accent: "amber" as const,
      icon: <Link2Icon className="size-5" />,
    },
  ];
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
        detailField("Creative ID", getDetailFieldValue(adDetails, "Creative ID")),
        detailField("Headline", creative?.title || getDetailFieldValue(adDetails, "Headline")),
        detailField("Primary text", creative?.body || getDetailFieldValue(adDetails, "Primary text")),
        detailField("Description", creative?.description),
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
    {
      key: "advanced",
      title: "Advanced settings",
      subtitle: "Bidding and hierarchy identifiers for troubleshooting and review.",
      icon: <Settings2Icon className="size-5" />,
      defaultOpen: false,
      fields: compactFields([
        detailField("Campaign ID", getDetailFieldValue(campaignDetails, "Campaign ID")),
        detailField("Ad Set ID", getDetailFieldValue(adSetDetails, "Ad Set ID")),
        detailField("Ad ID", getDetailFieldValue(adDetails, "Ad ID")),
        detailField("Buying Type", getDetailFieldValue(campaignDetails, "Buying Type")),
        detailField("Bid strategy", getDetailFieldValue(adSetDetails, "Bid strategy")),
      ]),
    },
  ];

  return (
    <section className="mx-auto max-w-[1360px] space-y-6 px-1 sm:px-2">
      <div className="rounded-[28px] border border-[#e7edf5] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-6">
        <div className="flex flex-wrap items-center gap-3 text-sm text-[#64748b]">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-[#f8fafc] text-[#64748b] shadow-sm ring-1 ring-[#e5e7eb]">
            <HouseIcon className="size-4" />
          </span>
          <span>Home</span>
          <ChevronRightIcon className="size-4 text-[#c0cad6]" />
          <span>Campaigns</span>
          <ChevronRightIcon className="size-4 text-[#c0cad6]" />
          <span className="truncate">{companyLabel}</span>
          <ChevronRightIcon className="size-4 text-[#c0cad6]" />
          <span className="font-semibold text-[#ef4444]">Campaign Preview</span>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          <MetaSelectionCard
            title="Campaign"
            icon={<FolderIcon className="size-5" />}
            accent="rose"
            items={section.campaigns}
            selectedId={selectedCampaign?.id ?? ""}
            selectedLabel={selectedCampaign?.name ?? "Choose campaign"}
            onSelect={selectCampaign}
          />
          <MetaSelectionCard
            title="Ad Set"
            icon={<LayoutPanelLeftIcon className="size-5" />}
            accent="blue"
            items={children}
            selectedId={selectedChild?.id ?? ""}
            selectedLabel={selectedChild?.name ?? "Choose ad set"}
            onSelect={selectChild}
            emptyMessage="No ad sets were returned for the selected campaign."
          />
          <MetaSelectionCard
            title="Ad"
            icon={<MegaphoneIcon className="size-5" />}
            accent="green"
            items={ads}
            selectedId={selectedAd?.id ?? ""}
            selectedLabel={selectedAd?.name ?? "Choose ad"}
            onSelect={selectAd}
            emptyMessage="No ads were returned for the selected ad set."
          />
        </div>

        <div className="mt-6 rounded-[28px] border border-[#edf2f7] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-[1.8rem] font-semibold tracking-[-0.03em] text-[#0f172a]">
              Quick Summary
            </h2>
            <InfoIcon className="size-4 text-[#94a3b8]" />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {quickSummaryCards.map((card) => (
              <MetaSummaryCard key={card.label} {...card} />
            ))}
          </div>
        </div>
      </div>

      {children.length === 0 ? (
        <EmptyState message="No ad sets are available under the selected campaign." />
      ) : null}

      <section className="rounded-[28px] border border-[#e7edf5] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
        <div className="border-b border-[#edf2f7] px-5 py-5 sm:px-6">
          <h2 className="text-[1.8rem] font-semibold tracking-[-0.03em] text-[#0f172a]">
            Ad Preview
          </h2>
        </div>

        {previewPlacements.length > 0 ? (
          <div className="border-b border-[#edf2f7] px-4 pt-3 sm:px-6">
            <div className="flex flex-wrap gap-2">
              {previewPlacements.map((placement) => (
                <button
                  key={placement.key}
                  type="button"
                  onClick={() => setActivePlacementKey(placement.key)}
                  className={`border-b-2 px-3 py-3 text-sm font-medium transition ${
                    activePlacement?.key === placement.key
                      ? "border-[#1b74e4] text-[#1b74e4]"
                      : "border-transparent text-[#64748b] hover:text-[#0f172a]"
                  }`}
                >
                  {placement.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,420px)]">
          <MetaAdPreviewCard
            companyLabel={companyLabel}
            campaignName={selectedCampaign?.name ?? "Campaign"}
            adName={selectedAd?.name ?? "Ad"}
            creative={creative}
            activePlacement={activePlacement}
          />
          <div className="rounded-[24px] border border-[#edf2f7] bg-[#fbfdff] p-5">
            <h3 className="text-[1.6rem] font-semibold tracking-[-0.03em] text-[#0f172a]">
              Preview Summary
            </h3>
            <div className="mt-5 space-y-4">
              {previewSummaryCards.map((card) => (
                <MetaPreviewSummaryTile key={card.label} {...card} />
              ))}
            </div>
          </div>
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

      <section className="rounded-[28px] border border-[#e7edf5] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-6">
        <h2 className="text-[1.8rem] font-semibold tracking-[-0.03em] text-[#0f172a]">
          Performance & Audience Insights
        </h2>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-[24px] border border-[#edf2f7] bg-[#fbfdff] p-5">
            {performance ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-[#edf4ff] text-[#3b82f6]">
                    <BarChart3Icon className="size-6" />
                  </span>
                  <div>
                    <h3 className="text-[1.35rem] font-semibold text-[#0f172a]">
                      Performance Insights
                    </h3>
                    <p className="text-sm text-[#64748b]">
                      Live delivery metrics from the selected Meta ad.
                    </p>
                  </div>
                </div>
                <PerformanceSection
                  performance={performance}
                  emptyMessage="No performance data was returned for the current Meta Ads selection."
                />
              </>
            ) : (
              <MetaInsightEmptyCard
                title="No performance insights yet"
                message="Once your campaign starts delivering, performance data will appear here."
                accent="blue"
                icon={<BarChart3Icon className="size-8" />}
              />
            )}
          </div>

          <div className="rounded-[24px] border border-[#edf2f7] bg-[#fbfdff] p-5">
            {demographics.length > 0 ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-[#f6efff] text-[#8b5cf6]">
                    <UsersIcon className="size-6" />
                  </span>
                  <div>
                    <h3 className="text-[1.35rem] font-semibold text-[#0f172a]">
                      Audience Insights
                    </h3>
                    <p className="text-sm text-[#64748b]">
                      Results by age range and gender for the selected Meta ad.
                    </p>
                  </div>
                </div>
                <DemographicSection
                  rows={demographics}
                  resultLabel={performance?.resultLabel ?? "Results"}
                  emptyMessage="No demographic data was returned for the current Meta Ads selection."
                />
              </>
            ) : (
              <MetaInsightEmptyCard
                title="No audience insights yet"
                message="Audience insights will be available once data starts flowing in."
                accent="violet"
                icon={<UsersIcon className="size-8" />}
              />
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-[#e7edf5] bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-6">
        <h2 className="text-[1.8rem] font-semibold tracking-[-0.03em] text-[#0f172a]">
          Preview Links
        </h2>
        <div className="mt-5">
          <MetaPreviewLinksGrid placements={previewPlacements} />
        </div>
      </section>
    </section>
  );
}

type MetaAccent = "rose" | "blue" | "green" | "violet" | "amber";

interface MetaPreviewPlacementDescriptor {
  key: string;
  label: string;
  description: string;
  url: string;
  placementLabel: string;
  accent: MetaAccent;
}

function MetaSelectionCard({
  title,
  icon,
  accent,
  items,
  selectedId,
  selectedLabel,
  onSelect,
  emptyMessage,
}: {
  title: string;
  icon: ReactNode;
  accent: MetaAccent;
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
    <div className="rounded-[24px] border border-[#e8eef5] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-4">
        <span className={`flex size-14 items-center justify-center rounded-2xl ${metaAccentIconClassName(accent)}`}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#0f172a]">{title}</p>
          {items.length > 0 ? (
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              className="mt-1 flex w-full items-start justify-between gap-3 text-left"
              aria-expanded={open}
            >
              <span className="min-w-0">
                <span className="block truncate text-[1.15rem] font-medium text-[#0f172a]">
                  {selectedLabel}
                </span>
                <span className="mt-1 block text-sm text-[#64748b]">
                  {open ? `Hide ${title.toLowerCase()} options` : `Choose ${title.toLowerCase()}`}
                </span>
              </span>
              <ChevronDownIcon
                className={`mt-1 size-5 shrink-0 text-[#64748b] transition ${open ? "rotate-180" : ""}`}
              />
            </button>
          ) : (
            <p className="mt-1 text-sm text-[#64748b]">
              {emptyMessage ?? `No ${title.toLowerCase()} returned.`}
            </p>
          )}
        </div>
      </div>

      {open && items.length > 0 ? (
        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`flex w-full items-start justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                item.id === selectedId
                  ? "border-[#bfdbfe] bg-[#eff6ff]"
                  : "border-[#e5e7eb] bg-white hover:border-[#cbd5e1]"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[#0f172a]">
                  {item.name}
                </span>
                <span className="mt-1 block text-xs text-[#64748b]">{item.status}</span>
              </span>
              {item.id === selectedId ? (
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-[#2563eb]" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MetaSummaryCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent: MetaAccent;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-[#edf2f7] bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.03)]">
      <div className="flex items-start gap-4">
        <span className={`flex size-14 items-center justify-center rounded-2xl ${metaAccentIconClassName(accent)}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#0f172a]">{label}</p>
          <p className="mt-2 whitespace-pre-line text-[1.05rem] leading-7 text-[#1f2937]">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function MetaAdPreviewCard({
  companyLabel,
  campaignName,
  adName,
  creative,
  activePlacement,
}: {
  companyLabel: string;
  campaignName: string;
  adName: string;
  creative: PreviewAdNode["creative"] | null;
  activePlacement: MetaPreviewPlacementDescriptor | null;
}) {
  const bodyText = creative?.body?.trim() || "No primary text available for this ad.";
  const headline = creative?.title?.trim() || campaignName;
  const linkUrl = creative?.linkUrl?.trim() || null;
  const imageUrl = creative?.imageUrl?.trim() || creative?.thumbnailUrl?.trim() || null;
  const domainLabel = getMetaDisplayDomain(linkUrl);
  const callToAction = humanizeMetaCta(creative?.callToActionType) || "Learn more";
  const profileLetter = companyLabel.slice(0, 1).toUpperCase() || "M";

  return (
    <div className="rounded-[24px] border border-[#edf2f7] bg-[#fbfdff] p-4">
      <div className="rounded-[26px] border border-[#e7edf5] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)] sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-full bg-[linear-gradient(180deg,#14398d_0%,#0f2358_100%)] text-xl font-semibold text-white">
              {profileLetter}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[1.45rem] font-semibold tracking-[-0.03em] text-[#0f172a]">
                {companyLabel}
              </p>
              <p className="mt-1 text-[1rem] text-[#64748b]">Sponsored</p>
            </div>
          </div>
          <EllipsisVerticalIcon className="size-5 shrink-0 text-[#64748b]" />
        </div>

        <p className="mt-5 text-[1.15rem] leading-9 text-[#111827]">{bodyText}</p>

        <div className="mt-5 overflow-hidden rounded-[20px] border border-[#e7edf5] bg-[#f8fafc]">
          {imageUrl ? (
            <div className="relative aspect-[16/9] w-full bg-[#e2e8f0]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={headline}
                className="h-full w-full object-cover"
              />
              {activePlacement ? (
                <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#0f172a] shadow-sm">
                  {activePlacement.placementLabel}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="flex aspect-[16/9] items-center justify-center bg-[linear-gradient(135deg,#163d8f_0%,#234ea3_40%,#0f172a_100%)] px-6 text-center text-white">
              <div>
                <p className="text-[1.45rem] font-semibold tracking-[-0.03em]">{headline}</p>
                <p className="mt-3 text-base text-white/80">
                  Creative media preview is not available for this ad.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4 border-t border-[#e7edf5] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm uppercase tracking-[0.08em] text-[#94a3b8]">{domainLabel}</p>
              <p className="mt-1 truncate text-[1.45rem] font-semibold tracking-[-0.03em] text-[#0f172a]">
                {headline}
              </p>
              {creative?.description ? (
                <p className="mt-1 text-[1rem] text-[#475569]">{creative.description}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              {linkUrl ? (
                <a
                  href={linkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-[16px] border border-[#d8e0ea] bg-white px-4 py-3 text-sm font-medium text-[#0f172a] transition hover:border-[#93c5fd] hover:text-[#2563eb]"
                >
                  Visit
                  <ExternalLinkIcon className="size-4" />
                </a>
              ) : null}
              <button
                type="button"
                className="rounded-[16px] border border-[#d8e0ea] bg-[#f8fafc] px-5 py-3 text-[1.05rem] font-semibold text-[#0f172a]"
              >
                {callToAction}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-[#edf2f7] pt-4 text-center text-[1rem] text-[#64748b]">
          <span>Like</span>
          <span>Comment</span>
          <span>Share</span>
        </div>

        <p className="mt-4 text-sm text-[#94a3b8]">
          Previewing {adName}
          {activePlacement ? ` in ${activePlacement.placementLabel}.` : "."}
        </p>
      </div>
    </div>
  );
}

function MetaPreviewSummaryTile({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent: MetaAccent;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-[#edf2f7] bg-white p-4 shadow-[0_8px_18px_rgba(15,23,42,0.03)]">
      <div className="flex items-start gap-4">
        <span className={`flex size-14 items-center justify-center rounded-2xl ${metaAccentIconClassName(accent)}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[1.05rem] font-semibold text-[#0f172a]">{label}</p>
          <p className="mt-2 break-words text-[1.05rem] leading-8 text-[#1f2937]">{value}</p>
        </div>
      </div>
    </div>
  );
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
      <div className="bg-[#fbfdff] px-4 pb-4 sm:px-5">
        {fields.length > 0 ? (
          <dl className="grid gap-3 pt-1 md:grid-cols-2 xl:grid-cols-3">
            {fields.map((field) => (
              <div
                key={`${title}-${field.label}-${field.value}`}
                className="rounded-[18px] border border-[#edf2f7] bg-white px-4 py-3"
              >
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">
                  {field.label}
                </dt>
                <dd className="mt-2 text-[1rem] leading-7 text-[#1f2937]">{field.value}</dd>
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

function MetaInsightEmptyCard({
  title,
  message,
  accent,
  icon,
}: {
  title: string;
  message: string;
  accent: MetaAccent;
  icon: ReactNode;
}) {
  return (
    <div className="flex min-h-[240px] items-center rounded-[20px] bg-white p-4">
      <div className="flex items-center gap-5">
        <span className={`flex size-20 items-center justify-center rounded-[28px] ${metaAccentIconClassName(accent)}`}>
          {icon}
        </span>
        <div className="max-w-[320px]">
          <h3 className="text-[1.35rem] font-semibold text-[#0f172a]">{title}</h3>
          <p className="mt-3 text-[1.05rem] leading-8 text-[#64748b]">{message}</p>
        </div>
      </div>
    </div>
  );
}

function MetaPreviewLinksGrid({
  placements,
}: {
  placements: MetaPreviewPlacementDescriptor[];
}) {
  if (placements.length === 0) {
    return <EmptyState message="No live Meta preview links are available for the selected ad." />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {placements.map((placement) => (
        <a
          key={placement.key}
          href={placement.url}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-[150px] items-center justify-between gap-4 rounded-[22px] border border-[#edf2f7] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition hover:border-[#bfdbfe]"
        >
          <div className="flex min-w-0 items-center gap-4">
            <span className={`flex size-16 items-center justify-center rounded-[22px] ${metaAccentIconClassName(placement.accent)}`}>
              {placement.key === "mobile" ? (
                <SmartphoneIcon className="size-7" />
              ) : placement.key === "instagramFeed" || placement.key === "story" ? (
                <ImageIcon className="size-7" />
              ) : (
                <MonitorIcon className="size-7" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-[1.1rem] font-semibold text-[#0f172a]">{placement.label}</p>
              <p className="mt-2 text-[1rem] leading-7 text-[#64748b]">{placement.description}</p>
            </div>
          </div>
          <ExternalLinkIcon className="size-5 shrink-0 text-[#2563eb]" />
        </a>
      ))}
    </div>
  );
}

function buildMetaPreviewPlacements(
  previewLinks: Array<{ label: string; url: string; placementKey?: string | null; placementLabel?: string | null }>
): MetaPreviewPlacementDescriptor[] {
  const placements = new Map<string, MetaPreviewPlacementDescriptor>();

  previewLinks.forEach((link) => {
    const placementKey = link.placementKey || normalizePlacementKeyFromLabel(link.label);
    if (!placementKey || placements.has(placementKey)) {
      return;
    }

    placements.set(placementKey, {
      key: placementKey,
      label: link.placementLabel || defaultPlacementLabel(placementKey),
      description: defaultPlacementDescription(placementKey),
      url: link.url,
      placementLabel: link.placementLabel || defaultPlacementLabel(placementKey),
      accent: placementAccent(placementKey),
    });
  });

  return Array.from(placements.values());
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

function buildMetaScheduleSummary(fields: PreviewDetailField[]): string {
  const startDate = getDetailFieldValue(fields, "Start date");
  const endDate = getDetailFieldValue(fields, "End date");
  if (startDate && endDate) {
    return `${startDate}\n${endDate}`;
  }
  return startDate || endDate || "Not available";
}

function buildMetaAudienceSummary(fields: PreviewDetailField[]): string {
  const age = getDetailFieldValue(fields, "Age suggestion");
  const locations = getDetailFieldValue(fields, "Locations included");
  const gender = getDetailFieldValue(fields, "Gender");
  const parts = [age, locations, gender].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : "Not available";
}

function compactFields(fields: Array<PreviewDetailField | null>): PreviewDetailField[] {
  return fields.filter((field): field is PreviewDetailField => Boolean(field));
}

function pickDetailFields(fields: PreviewDetailField[], labels: string[]): PreviewDetailField[] {
  return labels
    .map((label) => fields.find((field) => field.label === label) ?? null)
    .filter((field): field is PreviewDetailField => Boolean(field));
}

function metaAccentIconClassName(accent: MetaAccent): string {
  if (accent === "green") {
    return "bg-[#ecfdf3] text-[#16a34a]";
  }
  if (accent === "blue") {
    return "bg-[#edf4ff] text-[#2563eb]";
  }
  if (accent === "amber") {
    return "bg-[#fff7ed] text-[#ea580c]";
  }
  if (accent === "rose") {
    return "bg-[#fff1f2] text-[#ef4444]";
  }
  return "bg-[#f5f3ff] text-[#7c3aed]";
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
  onCampaignChange,
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
  } = usePreviewSelection(section, initialCampaignId, onCampaignChange);
  const previewSlides = useMemo(() => buildGoogleAdPreviewVariations(selectedAd), [selectedAd]);
  const adGroupCount = section.campaigns.reduce((count, campaign) => count + campaign.children.length, 0);
  const adCount = section.campaigns.reduce(
    (count, campaign) =>
      count + campaign.children.reduce((childCount, adGroup) => childCount + adGroup.ads.length, 0),
    0
  );
  const selectedCampaignDetails = selectedCampaign?.details ?? [];
  const editHref = buildGoogleEditDraftHref(searchParams, selectedCampaign?.id, selectedChild?.id, selectedAd?.id);
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
          <div className="flex flex-col gap-3 rounded-[16px] border border-[#E2E8F0] bg-[#F8FAFC] px-5 py-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">Selected path</p>
              <p className="mt-2 max-w-[420px] text-[14px] leading-7 text-[#334155]">
                <span className="font-semibold text-[#0f172a]">{selectedCampaign?.name || "Campaign"}</span>
                {" / "}
                <span className="font-semibold text-[#0f172a]">{selectedChild?.name || "Ad Group"}</span>
                {" / "}
                <span className="font-semibold text-[#0f172a]">{selectedAd?.name || "Ad"}</span>
              </p>
            </div>
            <Link
              href={editHref}
              aria-disabled={!selectedCampaign || !selectedChild || !selectedAd}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[14px] border px-4 py-2 text-sm font-semibold transition ${
                selectedCampaign && selectedChild && selectedAd
                  ? "border-[#1a73e8] bg-[#1a73e8] text-white hover:bg-[#1557b0]"
                  : "pointer-events-none border-[#cbd5e1] bg-white text-[#94a3b8]"
              }`}
            >
              <PencilIcon className="size-4" />
              Edit
            </Link>
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
  context,
}: {
  slides: GooglePreviewSlide[];
  externalPreviewUrl: string | null;
  context: GoogleFullPreviewContext;
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
  const maxWidthClass = fullSize ? "max-w-[420px]" : compact ? "max-w-[280px]" : "max-w-[360px]";
  const frameRadius = "rounded-[46px]";
  const screenRadius = "rounded-[40px]";
  const chromePadding = compact ? "px-4 pb-3 pt-3" : "px-5 pb-4 pt-3";
  const googleLogoSize = compact ? "text-[20px]" : "text-[34px]";
  const searchBoxClass = compact
    ? "mt-3 rounded-full border border-[#e3e6ea] bg-white px-3 py-2 shadow-[0_3px_10px_rgba(60,64,67,0.12)]"
    : "mt-5 rounded-full border border-[#e3e6ea] bg-white px-4 py-3 shadow-[0_4px_12px_rgba(60,64,67,0.1)]";
  const adPadding = compact ? "px-4 pb-4 pt-3" : "px-5 pb-5 pt-4";
  const headlineClass = compact ? "text-[18px] leading-[1.16]" : "text-[20px] leading-[1.2]";
  const descriptionClass = compact ? "mt-2 text-[11px] leading-[1.45]" : "mt-3 text-[14px] leading-[1.55]";

  return (
    <div className={`mx-auto ${fullSize ? "max-w-[560px]" : compact ? "max-w-[280px]" : "max-w-[470px]"}`}>
      <div
        className={`mx-auto w-full aspect-[78/160.9] ${frameRadius} border-[4px] border-[#111111] bg-[#111111] p-[5px] shadow-[0_20px_48px_rgba(15,23,42,0.20)] ${maxWidthClass}`}
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

                <div className="mt-4 flex items-center justify-center" aria-label="Google">
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

            <div className={`${compact ? "mt-3 gap-4 text-[9px]" : "mt-5 gap-5 text-[13px]"} flex overflow-hidden whitespace-nowrap text-[#6b7280]`}>
              {searchTabs.map((tab, index) => (
                <div key={tab} className="flex flex-col items-center">
                  <span className={index === 0 ? "font-medium text-[#2563eb]" : ""}>{tab}</span>
                  <span className={`${compact ? "mt-1.5 w-7" : "mt-2 w-8"} h-0.5 rounded-full ${index === 0 ? "bg-[#2563eb]" : "bg-transparent"}`} />
                </div>
              ))}
            </div>
          </div>

          <div className={`border-t border-[#edf1f4] ${adPadding}`}>
            <p className={`${compact ? "text-[10px]" : "text-[13px]"} font-medium text-[#111827]`}>Sponsored</p>
            <div className={`${compact ? "mt-3 gap-2" : "mt-4 gap-3"} flex items-start justify-between`}>
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
              <div className={`${compact ? "mt-3" : "mt-5"} border-t border-[#edf1f4]`}>
                {slide.sitelinks.slice(0, 4).map((sitelink) => (
                  <div key={sitelink.id} className={`${compact ? "py-2.5" : "py-4"} flex items-center justify-between border-b border-[#edf1f4]`}>
                    <span className={`${compact ? "text-[10px]" : "text-[15px]"} truncate font-medium text-[#1a73e8]`}>{sitelink.linkText}</span>
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
