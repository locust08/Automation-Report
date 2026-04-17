"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  BarChart3Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FolderIcon,
  LayoutPanelLeftIcon,
  MegaphoneIcon,
} from "lucide-react";

import {
  PreviewDemographicRow,
  PreviewDetailField,
  PreviewPerformanceSummary,
  PreviewPlatformSection,
} from "@/lib/reporting/types";

export function PreviewHierarchy({
  sections,
  selectedCampaignName,
  selectedPlatform,
}: {
  sections: PreviewPlatformSection[];
  selectedCampaignName?: string;
  selectedPlatform?: "meta" | "google" | null;
}) {
  const filteredSections = filterPreviewSections({
    sections,
    selectedCampaignName: selectedCampaignName ?? "",
    selectedPlatform: selectedPlatform ?? null,
  });
  const selectedSection = selectedPlatform
    ? filteredSections.find((section) => section.platform === selectedPlatform) ?? null
    : filteredSections[0] ?? null;

  if (selectedSection?.platform === "meta") {
    return <MetaAdsPreviewWorkspace section={selectedSection} />;
  }

  if (selectedSection?.platform === "google") {
    return <GoogleAdsPreviewWorkspace section={selectedSection} />;
  }

  if (filteredSections.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[28px] bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-semibold text-[#1f2937]">Preview Explorer</h2>
      <p className="mt-2 text-sm text-[#6b7280]">No detailed campaign hierarchy was available, so the page is showing the fallback preview list.</p>
      <div className="mt-6 space-y-4">
        {filteredSections.map((section) => (
          <article key={section.platform} className="rounded-3xl border border-[#e5e7eb] bg-[#f9fafb] p-5">
            <h3 className="text-lg font-semibold text-[#111827]">{section.title}</h3>
            <p className="mt-1 text-sm text-[#6b7280]">{section.campaigns.length} campaigns</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function MetaAdsPreviewWorkspace({ section }: { section: PreviewPlatformSection }) {
  const [selectedCampaignId, setSelectedCampaignId] = useState(section.campaigns[0]?.id ?? "");
  const selectedCampaign = useMemo(
    () => section.campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? section.campaigns[0] ?? null,
    [section.campaigns, selectedCampaignId]
  );
  const adSets = useMemo(() => selectedCampaign?.children ?? [], [selectedCampaign]);
  const [selectedAdSetId, setSelectedAdSetId] = useState(adSets[0]?.id ?? "");
  const selectedAdSet = useMemo(
    () => adSets.find((adSet) => adSet.id === selectedAdSetId) ?? adSets[0] ?? null,
    [adSets, selectedAdSetId]
  );
  const ads = useMemo(() => selectedAdSet?.ads ?? [], [selectedAdSet]);
  const [selectedAdId, setSelectedAdId] = useState(ads[0]?.id ?? "");
  const selectedAd = useMemo(
    () => ads.find((ad) => ad.id === selectedAdId) ?? ads[0] ?? null,
    [ads, selectedAdId]
  );

  const detailFields = [...(selectedCampaign?.details ?? []), ...(selectedAdSet?.details ?? []), ...(selectedAd?.details ?? [])];
  const performance = selectedAd?.performance ?? selectedAdSet?.performance ?? selectedCampaign?.performance ?? null;
  const demographics = selectedAd?.demographics ?? selectedAdSet?.demographics ?? selectedCampaign?.demographics ?? [];
  const previewLinks = selectedAd?.previewLinks ?? [];

  return (
    <section className="space-y-6">
      <div className="rounded-[32px] border border-[#dbe3ee] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#5b6471]">
          <FolderIcon className="size-4 text-[#1b74e4]" />
          <span>{selectedCampaign?.name || "Campaign"}</span>
          <span>/</span>
          <span>{selectedAdSet?.name || "Ad Set"}</span>
          <span>/</span>
          <span>{selectedAd?.name || "Ad"}</span>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[260px_260px_260px_minmax(0,1fr)]">
          <SelectionColumn
            title="Campaign list"
            icon={<FolderIcon className="size-4" />}
            items={section.campaigns}
            selectedId={selectedCampaign?.id ?? ""}
            onSelect={(id) => {
              setSelectedCampaignId(id);
              setSelectedAdSetId("");
              setSelectedAdId("");
            }}
          />
          <SelectionColumn
            title="Ad Set list"
            icon={<LayoutPanelLeftIcon className="size-4" />}
            items={adSets}
            selectedId={selectedAdSet?.id ?? ""}
            onSelect={(id) => {
              setSelectedAdSetId(id);
              setSelectedAdId("");
            }}
          />
          <SelectionColumn
            title="Ad list"
            icon={<MegaphoneIcon className="size-4" />}
            items={ads}
            selectedId={selectedAd?.id ?? ""}
            onSelect={setSelectedAdId}
          />
          <DetailPanel fields={detailFields} previewLinks={previewLinks} />
        </div>
      </div>

      <div className="rounded-[32px] border border-[#dbe3ee] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-[#1b74e4]">
          <BarChart3Icon className="size-5" />
          <h3 className="text-xl font-semibold text-[#111827]">Performance section</h3>
        </div>
        <PerformanceSection performance={performance} />
      </div>

      <div className="rounded-[32px] border border-[#dbe3ee] bg-white p-5 shadow-sm">
        <h3 className="text-xl font-semibold text-[#111827]">Demographic section</h3>
        <DemographicSection rows={demographics} resultLabel={performance?.resultLabel ?? "Results"} />
      </div>
    </section>
  );
}

function SelectionColumn({
  title,
  icon,
  items,
  selectedId,
  onSelect,
}: {
  title: string;
  icon: ReactNode;
  items: Array<{ id: string; name: string; status: string }>;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-[24px] border border-[#e5edf5] bg-[#f7f9fc] p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#334155]">
        {icon}
        <span>{title}</span>
      </div>
      <div className="space-y-2">
        {items.length > 0 ? (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                item.id === selectedId
                  ? "border-[#1b74e4] bg-[#e7f0fe] text-[#0f172a]"
                  : "border-[#e5e7eb] bg-white text-[#334155] hover:border-[#bfdbfe]"
              }`}
            >
              <p className="truncate text-sm font-semibold">{item.name}</p>
              <p className="mt-1 text-xs text-[#64748b]">{item.status}</p>
            </button>
          ))
        ) : (
          <EmptyState message={`No ${title.toLowerCase()} returned.`} />
        )}
      </div>
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
    <div className="rounded-[24px] border border-[#e5edf5] bg-[#fbfbfc] p-4">
      <h3 className="text-sm font-semibold text-[#334155]">Detail panel</h3>
      {fields.length > 0 ? (
        <dl className="mt-4 grid gap-3 md:grid-cols-2">
          {fields.map((field) => (
            <div key={`${field.label}-${field.value}`} className="rounded-2xl bg-white px-3 py-3 shadow-sm">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">{field.label}</dt>
              <dd className="mt-1 text-sm text-[#0f172a]">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="mt-4">
          <EmptyState message="No detail fields were returned from Meta Marketing API." />
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

function GoogleAdsPreviewWorkspace({ section }: { section: PreviewPlatformSection }) {
  const selectedCampaign = section.campaigns[0] ?? null;
  const selectedAdGroup = selectedCampaign?.children[0] ?? null;
  const selectedAd = selectedAdGroup?.ads[0] ?? null;
  const detailFields = [...(selectedCampaign?.details ?? []), ...(selectedAdGroup?.details ?? []), ...(selectedAd?.details ?? [])];
  const previewSlides = useMemo(() => buildGooglePreviewSlides(selectedAd), [selectedAd]);
  const adGroupCount = section.campaigns.reduce((count, campaign) => count + campaign.children.length, 0);
  const adCount = section.campaigns.reduce(
    (count, campaign) => count + campaign.children.reduce((childCount, adGroup) => childCount + adGroup.ads.length, 0),
    0
  );

  return (
    <section className="overflow-hidden rounded-[36px] border border-[#d5dae3] bg-white shadow-sm">
      <div className="border-b border-[#dbe3ee] bg-[#eaf2ff] px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-3">
              <GoogleMark />
              <div className="min-w-0">
                <h2 className="truncate text-2xl font-semibold text-[#202124]">Google Ads Preview</h2>
                <p className="text-sm text-[#5f6368]">Use the Google Ads asset editor style for campaign, ad group, and ad preview.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <MetricPill label="Campaigns" value={section.campaigns.length} accent="blue" />
              <MetricPill label="Ad Groups" value={adGroupCount} accent="green" />
              <MetricPill label="Ads" value={adCount} accent="amber" />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-[#3c4043]">
              <span className="font-semibold text-[#202124]">Campaign:</span>
              <span>{selectedCampaign?.name || "Campaign"}</span>
              <span>/</span>
              <span className="font-semibold text-[#202124]">Ad group:</span>
              <span>{selectedAdGroup?.name || "Ad Group"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-[#5f6368]">
              <span className="font-semibold text-[#202124]">Keywords:</span>
              {selectedAd?.keywords && selectedAd.keywords.length > 0 ? (
                <span>{selectedAd.keywords.join(", ")}</span>
              ) : (
                <span>No keywords available</span>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-[#c7d5f2] bg-white px-4 py-3 text-sm text-[#3c4043] shadow-sm">
            <p className="font-semibold text-[#202124]">Google template</p>
            <p className="mt-1 max-w-[18rem]">This section follows the Google Ads UI, not the Meta UI.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[390px_minmax(0,1fr)]">
        <div className="border-b border-[#e5e7eb] bg-[#fcfcfd] p-4 lg:border-b-0 lg:border-r lg:p-5">
          <div className="space-y-4">
            <AssetCard title="Final URL" subtitle="This will be used to suggest assets for your ad">
              <ValueBox value={selectedAd?.finalUrl || "No final URL available"} />
            </AssetCard>

            <AssetCard title="Display path" subtitle="Preview URL path for search ads">
              <div className="space-y-3">
                <p className="text-sm text-[#5f6368]">{getDisplayDomain(selectedAd)}</p>
                <div className="flex gap-2">
                  {(selectedAd?.displayPathParts ?? []).length > 0 ? (
                    selectedAd!.displayPathParts!.map((part, index) => (
                      <ValueBox key={`${part}-${index}`} value={part} compact />
                    ))
                  ) : (
                    <ValueBox value="No display path" compact />
                  )}
                </div>
              </div>
            </AssetCard>

            <AssetCard
              title={`Headlines ${selectedAd?.headlines?.length ?? 0}/15`}
              subtitle="Ideas based on your website and existing ads"
            >
              <ChipList items={selectedAd?.headlines?.map((headline) => headline.text) ?? []} emptyLabel="No headlines returned" />
            </AssetCard>

            <AssetCard
              title={`Descriptions ${selectedAd?.descriptions?.length ?? 0}/4`}
              subtitle="Match the screenshots by showing the ad copy stack"
            >
              <StackList
                items={selectedAd?.descriptions?.map((description) => description.text) ?? []}
                emptyLabel="No descriptions returned"
              />
            </AssetCard>

            <AssetCard title="Images" subtitle="Add images to your campaign">
              <ImageGrid images={selectedAd?.images ?? []} />
            </AssetCard>

            <AssetCard title="Business name" subtitle="This name should match your URL or verified advertiser name">
              <ValueBox value={selectedAd?.businessName || "No business name available"} />
            </AssetCard>

            <AssetCard title="Business logo" subtitle="Add business logo to your campaign">
              {selectedAd?.businessLogoUrl ? (
                <div className="flex items-center gap-3 rounded-2xl border border-[#dfe3eb] bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedAd.businessLogoUrl} alt={selectedAd.businessName || "Business logo"} className="size-12 rounded-xl object-cover" />
                  <div>
                    <p className="text-sm font-semibold text-[#202124]">{selectedAd.businessName || "Business logo"}</p>
                    <p className="text-xs text-[#5f6368]">Attached business logo</p>
                  </div>
                </div>
              ) : (
                <ValueBox value="No business logo available" />
              )}
            </AssetCard>

            <AssetCard title="Sitelinks" subtitle="Add links to your ads to take people to specific pages on your website">
              <SitelinkList items={selectedAd?.sitelinks ?? []} />
            </AssetCard>

            <AssetCard title="Ad group" subtitle="Campaign hierarchy" compact>
              <StackList items={[selectedCampaign?.name, selectedAdGroup?.name].filter(Boolean) as string[]} emptyLabel="No hierarchy available" />
            </AssetCard>

            <AssetCard title="Ad details" subtitle="Campaign and ad metadata" compact>
              <DetailList fields={detailFields} />
            </AssetCard>
          </div>
        </div>

        <div className="bg-white px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-[#202124]">Preview</h3>
            <div className="flex gap-4 text-sm font-semibold text-[#1a73e8]">
              <button type="button" className="hover:underline">Share</button>
              <button type="button" className="hover:underline">Preview ads</button>
            </div>
          </div>
          <GoogleMobilePreviewCarousel slides={previewSlides} />
        </div>
      </div>
    </section>
  );
}

function AssetCard({
  title,
  subtitle,
  children,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={`rounded-[18px] border border-[#dfe3eb] bg-white ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-[#202124]">{title}</h4>
          {subtitle ? <p className="mt-1 text-xs leading-5 text-[#5f6368]">{subtitle}</p> : null}
        </div>
        <span className="rounded-full border border-[#dfe3eb] bg-[#f8f9fa] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5f6368]">
          Google
        </span>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DetailList({ fields }: { fields: PreviewDetailField[] }) {
  if (fields.length === 0) {
    return <ValueBox value="No detail fields returned" />;
  }

  return (
    <div className="space-y-2">
      {fields.map((field) => (
        <div key={`${field.label}-${field.value}`} className="rounded-xl border border-[#dfe3eb] bg-[#fafbfd] px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5f6368]">{field.label}</p>
          <p className="mt-1 text-sm text-[#202124]">{field.value}</p>
        </div>
      ))}
    </div>
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

function ChipList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <ValueBox value={emptyLabel} />;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, index) => (
        <ValueBox key={`${item}-${index}`} value={item} compact />
      ))}
    </div>
  );
}

function StackList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <ValueBox value={emptyLabel} />;
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={`${item}-${index}`} className="rounded-xl border border-[#dfe3eb] bg-[#fafbfd] px-3 py-2 text-sm text-[#202124]">
          {item}
        </div>
      ))}
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

function SitelinkList({ items }: { items: Array<{ id: string; linkText: string; description1?: string | null; description2?: string | null; finalUrl?: string | null }> }) {
  if (items.length === 0) {
    return <ValueBox value="No sitelinks available" />;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <a
          key={item.id}
          href={item.finalUrl || "#"}
          target={item.finalUrl ? "_blank" : undefined}
          rel={item.finalUrl ? "noreferrer" : undefined}
          className="block rounded-xl border border-[#dfe3eb] bg-[#fafbfd] px-3 py-3 transition hover:border-[#aecbfa]"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#1a73e8]">{item.linkText}</p>
            <ExternalLinkIcon className="size-4 shrink-0 text-[#5f6368]" />
          </div>
          <p className="mt-1 text-xs leading-5 text-[#5f6368]">
            {[item.description1, item.description2].filter(Boolean).join(" ")}
          </p>
        </a>
      ))}
    </div>
  );
}

function GoogleMark() {
  return (
    <div className="flex size-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-[#d7dbe3]">
      <div className="grid grid-cols-2 gap-1.5">
        <span className="size-2.5 rounded-full bg-[#4285f4]" />
        <span className="size-2.5 rounded-full bg-[#ea4335]" />
        <span className="size-2.5 rounded-full bg-[#fbbc05]" />
        <span className="size-2.5 rounded-full bg-[#34a853]" />
      </div>
    </div>
  );
}

function GoogleMobilePreviewCarousel({ slides }: { slides: GooglePreviewSlide[] }) {
  const [index, setIndex] = useState(0);
  const slideCount = slides.length;
  const safeIndex = Math.min(index, Math.max(slideCount - 1, 0));
  const slide = slides[safeIndex] ?? null;

  if (!slide) {
    return <EmptyState message="No Google preview was returned for the current selection." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
          disabled={safeIndex === 0}
          className="flex size-10 items-center justify-center rounded-full border border-[#d7dbe3] bg-white text-[#5f6368] shadow-sm transition hover:border-[#aecbfa] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous preview"
        >
          <ChevronLeftIcon className="size-5" />
        </button>

        <div className="w-full max-w-[380px]">
          <div className="rounded-[42px] border border-[#d7dbe3] bg-white p-4 shadow-[0_30px_80px_rgba(60,64,67,0.18)]">
            <div className="mx-auto flex max-w-[300px] items-center justify-between text-[#5f6368]">
              <span className="text-xs font-medium">9:41</span>
              <span className="text-xs font-medium">Google</span>
            </div>
            <div className="mx-auto mt-3 max-w-[300px] rounded-[34px] border border-[#e0e0e0] bg-[#f8f9fa] p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {slide.businessLogoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={slide.businessLogoUrl} alt={slide.businessName || "Business logo"} className="size-6 rounded-full object-cover" />
                  ) : (
                    <div className="flex size-6 items-center justify-center rounded-full bg-[#e8f0fe] text-[10px] font-semibold text-[#1a73e8]">
                      {slide.businessName?.slice(0, 1).toUpperCase() ?? "G"}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-[#202124]">{slide.businessName || "Business name"}</p>
                    <p className="text-[11px] text-[#5f6368]">{slide.displayDomain}</p>
                  </div>
                </div>
                <div className="size-6 rounded-full bg-[#dadce0]" />
              </div>

              <div className="mt-4 space-y-2">
                <p className="text-[11px] font-medium tracking-[0.08em] text-[#5f6368]">{slide.displayPath}</p>
                <h4 className="text-[18px] font-semibold leading-6 text-[#1a73e8]">{slide.headline}</h4>
                <p className="text-xs leading-5 text-[#3c4043]">{slide.description}</p>
              </div>

              {slide.keywords.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {slide.keywords.slice(0, 4).map((keyword) => (
                    <span key={keyword} className="rounded-full border border-[#dfe3eb] bg-white px-2.5 py-1 text-[10px] text-[#5f6368]">
                      {keyword}
                    </span>
                  ))}
                </div>
              ) : null}

              {slide.sitelinks.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {slide.sitelinks.slice(0, 3).map((sitelink) => (
                    <div key={sitelink.id} className="rounded-xl bg-white px-3 py-2 shadow-[0_1px_2px_rgba(60,64,67,0.08)]">
                      <p className="text-xs font-semibold text-[#1a73e8]">{sitelink.linkText}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-[#5f6368]">
                        {[sitelink.description1, sitelink.description2].filter(Boolean).join(" ")}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              {slide.images.length > 0 ? (
                <div className="mt-3 overflow-hidden rounded-2xl border border-[#e0e0e0] bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={slide.images[slide.imageIndex % slide.images.length].url} alt={slide.images[slide.imageIndex % slide.images.length].alt} className="h-28 w-full object-cover" />
                </div>
              ) : null}

              <div className="mt-4 flex items-center gap-2 text-xs text-[#5f6368]">
                <span className="inline-flex size-4 items-center justify-center rounded-full bg-[#e8f0fe] text-[#1a73e8]">i</span>
                <span>Preview ads</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-1.5">
              {slides.map((_, dotIndex) => (
                <button
                  key={dotIndex}
                  type="button"
                  onClick={() => setIndex(dotIndex)}
                  className={`h-2 rounded-full transition-all ${
                    dotIndex === safeIndex ? "w-5 bg-[#1a73e8]" : "w-2 bg-[#d7dbe3]"
                  }`}
                  aria-label={`Go to preview ${dotIndex + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIndex((current) => Math.min(slideCount - 1, current + 1))}
          disabled={safeIndex >= slideCount - 1}
          className="flex size-10 items-center justify-center rounded-full border border-[#d7dbe3] bg-white text-[#5f6368] shadow-sm transition hover:border-[#aecbfa] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next preview"
        >
          <ChevronRightIcon className="size-5" />
        </button>
      </div>
    </div>
  );
}

function buildGooglePreviewSlides(selectedAd: {
  name: string;
  finalUrl?: string | null;
  displayPathParts?: string[];
  headlines?: Array<{ text: string; pinnedField?: string | null }>;
  descriptions?: Array<{ text: string; pinnedField?: string | null }>;
  keywords?: string[];
  sitelinks?: Array<{ id: string; linkText: string; description1?: string | null; description2?: string | null; finalUrl?: string | null }>;
  businessName?: string | null;
  businessLogoUrl?: string | null;
  images?: Array<{ id: string; url: string; alt: string }>;
} | null): GooglePreviewSlide[] {
  if (!selectedAd) {
    return [];
  }

  const headlines = selectedAd.headlines?.length ? selectedAd.headlines : [{ text: selectedAd.name }];
  const descriptions = selectedAd.descriptions?.length ? selectedAd.descriptions : [{ text: "No description available." }];
  const displayDomain = getDisplayDomain(selectedAd);
  const displayPath = formatGoogleDisplayPath(selectedAd.displayPathParts);
  const images = selectedAd.images ?? [];
  const sitelinks = selectedAd.sitelinks ?? [];
  const keywords = selectedAd.keywords ?? [];

  return headlines.slice(0, Math.max(headlines.length, 3)).map((headline, index) => ({
    id: `${headline.text}-${index}`,
    businessName: selectedAd.businessName || null,
    businessLogoUrl: selectedAd.businessLogoUrl || null,
    displayDomain,
    displayPath,
    headline: headline.text,
    description: descriptions[index % descriptions.length]?.text ?? descriptions[0].text,
    keywords,
    sitelinks,
    images,
    imageIndex: index,
  }));
}

function getDisplayDomain(selectedAd: { finalUrl?: string | null }): string {
  const finalUrl = selectedAd.finalUrl?.trim();
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
  displayPath: string;
  headline: string;
  description: string;
  keywords: string[];
  sitelinks: Array<{ id: string; linkText: string; description1?: string | null; description2?: string | null; finalUrl?: string | null }>;
  images: Array<{ id: string; url: string; alt: string }>;
  imageIndex: number;
}

function PerformanceSection({ performance }: { performance: PreviewPerformanceSummary | null }) {
  if (!performance) {
    return <div className="mt-4"><EmptyState message="`meta-preview-insights` returned no performance data for the current selection." /></div>;
  }

  const cards = [
    { label: performance.resultLabel, value: formatNumber(performance.results) },
    { label: "Amount spent", value: formatCurrency(performance.spend) },
    { label: "Impressions", value: formatNumber(performance.impressions) },
    { label: "Clicks", value: formatNumber(performance.clicks) },
    { label: "CTR", value: `${performance.ctr.toFixed(2)}%` },
    { label: "Cost per result", value: performance.costPerResult !== null ? formatCurrency(performance.costPerResult) : "N/A" },
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
}: {
  rows: PreviewDemographicRow[];
  resultLabel: string;
}) {
  if (rows.length === 0) {
    return <div className="mt-4"><EmptyState message="`meta-preview-demographics` returned no age and gender breakdowns for the current selection." /></div>;
  }

  const maximum = Math.max(...rows.flatMap((row) => [row.maleResults, row.femaleResults, row.unknownResults]), 1);

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
          {row.unknownResults > 0 ? <DemographicBar label="Unknown" value={row.unknownResults} max={maximum} color="bg-[#94a3b8]" /> : null}
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
        <div className={`h-3 rounded-full ${color}`} style={{ width: `${Math.max((value / max) * 100, value > 0 ? 4 : 0)}%` }} />
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-2xl border border-dashed border-[#cbd5e1] bg-white px-4 py-3 text-sm text-[#64748b]">{message}</div>;
}

function formatGoogleDisplayPath(displayPathParts?: string[]): string {
  if (!displayPathParts || displayPathParts.length === 0) {
    return "google.com";
  }

  return `google.com / ${displayPathParts.filter(Boolean).join(" / ")}`;
}

function filterPreviewSections(input: {
  sections: PreviewPlatformSection[]; 
  selectedCampaignName: string;
  selectedPlatform: "meta" | "google" | null;
}): PreviewPlatformSection[] {
  const normalizedCampaignName = input.selectedCampaignName.trim().toLowerCase();

  return input.sections
    .filter((section) => !input.selectedPlatform || section.platform === input.selectedPlatform)
    .map((section) => ({
      ...section,
      campaigns: section.campaigns.filter(
        (campaign) =>
          (section.platform === "google" || campaign.children.length > 0) &&
          (!normalizedCampaignName || campaign.name.trim().toLowerCase() === normalizedCampaignName)
      ),
    }))
    .filter((section) => section.campaigns.length > 0);
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
