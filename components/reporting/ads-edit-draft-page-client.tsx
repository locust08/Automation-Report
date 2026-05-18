"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangleIcon, CheckCircle2Icon, Loader2Icon, XIcon } from "lucide-react";

import { buildAdsChangeSet } from "@/lib/ads-edit/change-set";
import { canOpenAdsEditDraft } from "@/lib/ads-edit/permissions";
import type { AdsChangeSet, AdsDraftData, AdsDraftValidationResult, AdsSyncState } from "@/lib/ads-edit/types";
import { createAdsDraftFromPreview } from "@/lib/ads-edit/types";
import { validateAdsDraft } from "@/lib/ads-edit/validation";
import type { PreviewAdGroupNode, PreviewAdNode, PreviewCampaignNode } from "@/lib/reporting/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ReportShell } from "@/components/reporting/report-shell";
import { ReportErrorState, ReportLoadingState } from "@/components/reporting/report-state";
import { usePreviewReport } from "@/components/reporting/use-report-data";

export function AdsEditDraftPageClient() {
  const searchParams = useSearchParams();
  const accountId =
    searchParams.get("googleAccountId")?.trim() ||
    searchParams.get("accountId")?.trim() ||
    searchParams.get("metaAccountId")?.trim() ||
    "";
  const platform = searchParams.get("platform") === "meta" ? "meta" : "google";
  const campaignId = searchParams.get("campaignId")?.trim() ?? "";
  const adGroupId = searchParams.get("adGroupId")?.trim() ?? "";
  const adId = searchParams.get("adId")?.trim() ?? "";
  const backHref = `/preview?${searchParams.toString()}`;
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    copyParam(searchParams, params, "accountId");
    copyParam(searchParams, params, "metaAccountId");
    copyParam(searchParams, params, "googleAccountId");
    copyParam(searchParams, params, "startDate");
    copyParam(searchParams, params, "endDate");
    return params.toString();
  }, [searchParams]);
  const enabled = Boolean(accountId && campaignId && adGroupId && adId && canOpenAdsEditDraft());
  const { data, error, loading, retry } = usePreviewReport(queryString, enabled);
  const selection = useMemo(() => {
    if (!data) {
      return null;
    }
    const section = data.sections.find((item) => item.platform === platform) ?? null;
    const campaign = section?.campaigns.find((item) => item.id === campaignId) ?? null;
    const adGroup = campaign?.children.find((item) => item.id === adGroupId) ?? null;
    const ad = adGroup?.ads.find((item) => item.id === adId) ?? null;
    return section && campaign && adGroup && ad ? { campaign, adGroup, ad } : null;
  }, [adGroupId, adId, campaignId, data, platform]);
  const originalData = useMemo(
    () =>
      selection
        ? createAdsDraftFromPreview({
            platform,
            accountId,
            campaign: selection.campaign,
            adGroup: selection.adGroup,
            ad: selection.ad,
          })
        : null,
    [accountId, platform, selection]
  );

  if (!canOpenAdsEditDraft()) {
    return (
      <ReportShell title="Edit Draft" dateLabel="Editing disabled" activeQuery={queryString}>
        <ReportErrorState kind="preview" message="Ad editing is disabled for this environment." />
      </ReportShell>
    );
  }

  if (!enabled) {
    return (
      <ReportShell title="Edit Draft" dateLabel="Missing selection" activeQuery={queryString}>
        <ReportErrorState kind="preview" message="Open Edit from a selected campaign, ad group, and ad on the Preview page." />
      </ReportShell>
    );
  }

  if (loading) {
    return <ReportLoadingState kind="preview" message="Preparing a safe local edit draft..." fullPage onRetry={retry} />;
  }

  if (error) {
    return (
      <ReportShell title="Edit Draft" dateLabel="Unable to load draft" activeQuery={queryString}>
        <ReportErrorState kind="preview" message={error} onRetry={retry} />
      </ReportShell>
    );
  }

  if (!originalData || !selection) {
    return (
      <ReportShell title="Edit Draft" dateLabel="Selection not found" activeQuery={queryString}>
        <ReportErrorState kind="preview" message="The selected campaign, ad group, or ad could not be found in the current preview data." />
      </ReportShell>
    );
  }

  return (
    <AdsEditDraftWorkspace
      originalData={originalData}
      selection={selection}
      backHref={backHref}
      activeQuery={queryString}
    />
  );
}

function AdsEditDraftWorkspace({
  originalData,
  selection,
  backHref,
  activeQuery,
}: {
  originalData: AdsDraftData;
  selection: { campaign: PreviewCampaignNode; adGroup: PreviewAdGroupNode; ad: PreviewAdNode };
  backHref: string;
  activeQuery: string;
}) {
  const [draftData, setDraftData] = useState<AdsDraftData>(originalData);
  const [syncState, setSyncState] = useState<AdsSyncState>("idle");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultWarnings, setResultWarnings] = useState<string[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const validation = useMemo(() => validateAdsDraft(draftData), [draftData]);
  const changeSet = useMemo(() => buildAdsChangeSet(originalData, draftData), [draftData, originalData]);
  const dirtyPaths = useMemo(() => new Set(changeSet.changes.map((change) => change.path)), [changeSet]);
  const saveDisabled = changeSet.changes.length === 0 || !validation.valid || syncState === "syncing" || syncState === "validating";

  function updateCampaignSetting(key: keyof AdsDraftData["campaignSettings"], value: string) {
    setDraftData((current) => ({
      ...current,
      campaignSettings: { ...current.campaignSettings, [key]: value },
    }));
  }

  function updateAdContent(key: keyof AdsDraftData["adContent"], value: AdsDraftData["adContent"][keyof AdsDraftData["adContent"]]) {
    setDraftData((current) => ({
      ...current,
      adContent: { ...current.adContent, [key]: value },
    }));
  }

  function updateAssets(key: keyof AdsDraftData["assets"], value: string) {
    setDraftData((current) => ({
      ...current,
      assets: { ...current.assets, [key]: value },
    }));
  }

  async function syncChanges(finalChangeSet: AdsChangeSet) {
    setSyncError(null);
    setResultMessage(null);
    setResultWarnings([]);
    setSyncState("validating");
    const latestValidation = validateAdsDraft(draftData);
    if (!latestValidation.valid) {
      setSyncState("failed");
      setSyncError("Please fix validation errors before syncing.");
      return;
    }

    setSyncState("syncing");
    try {
      const response = await fetch("/api/ads/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ changeSet: finalChangeSet }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        message?: string;
        warnings?: string[];
        error?: string;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? payload.message ?? "We could not sync the ad changes.");
      }
      setSyncState("synced");
      setResultMessage(payload.message ?? "Changes synced successfully.");
      setResultWarnings(payload.warnings ?? []);
      setReviewOpen(false);
    } catch (error) {
      setSyncState("failed");
      setSyncError(error instanceof Error ? error.message : "We could not sync the ad changes.");
    }
  }

  return (
    <ReportShell title="Edit Draft" dateLabel={`${selection.campaign.name} / ${selection.adGroup.name} / ${selection.ad.name}`} activeQuery={activeQuery}>
      <div className="mx-auto max-w-[1280px] space-y-6 px-2">
        <div className="rounded-[24px] border border-[#dbeafe] bg-[#eff6ff] p-5 text-[#1e3a8a]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em]">Safe local draft</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#0f172a]">Edit selected ad draft</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6">
                Changes stay in local draft state while you type. Nothing is sent to Google Ads or Meta Ads until you review the diff and click Save & Sync.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href={backHref}>Back to Preview</Link>
              </Button>
              <Button
                type="button"
                disabled={saveDisabled}
                onClick={() => setReviewOpen(true)}
                className="bg-[#1a73e8] text-white hover:bg-[#1557b0]"
              >
                Review Changes
              </Button>
            </div>
          </div>
        </div>

        <LockedFieldsPanel draftData={draftData} />
        <StatusPanel syncState={syncState} validation={validation} changeSet={changeSet} message={resultMessage} warnings={resultWarnings} error={syncError} />

        <DraftSection title="Campaign Settings" description="Editable campaign/ad group labels and delivery settings. Locked identifiers and historical metrics are shown above only.">
          <div className="grid gap-4 md:grid-cols-2">
            <DraftInput label="Campaign name" dirty={dirtyPaths.has("campaignSettings.campaignName")} value={draftData.campaignSettings.campaignName} onChange={(value) => updateCampaignSetting("campaignName", value)} />
            <DraftInput label="Campaign status" dirty={dirtyPaths.has("campaignSettings.campaignStatus")} value={draftData.campaignSettings.campaignStatus} onChange={(value) => updateCampaignSetting("campaignStatus", value)} />
            <DraftInput label="Ad group name" dirty={dirtyPaths.has("campaignSettings.adGroupName")} value={draftData.campaignSettings.adGroupName} onChange={(value) => updateCampaignSetting("adGroupName", value)} />
            <DraftInput label="Ad group status" dirty={dirtyPaths.has("campaignSettings.adGroupStatus")} value={draftData.campaignSettings.adGroupStatus} onChange={(value) => updateCampaignSetting("adGroupStatus", value)} />
            <DraftInput label="Ad name" dirty={dirtyPaths.has("campaignSettings.adName")} value={draftData.campaignSettings.adName} onChange={(value) => updateCampaignSetting("adName", value)} />
            <DraftInput label="Ad status" dirty={dirtyPaths.has("campaignSettings.adStatus")} value={draftData.campaignSettings.adStatus} onChange={(value) => updateCampaignSetting("adStatus", value)} />
            <DraftInput label="Budget" dirty={dirtyPaths.has("campaignSettings.budget")} value={draftData.campaignSettings.budget} onChange={(value) => updateCampaignSetting("budget", value)} />
            <DraftInput label="Bidding strategy" dirty={dirtyPaths.has("campaignSettings.biddingStrategy")} value={draftData.campaignSettings.biddingStrategy} onChange={(value) => updateCampaignSetting("biddingStrategy", value)} />
            <DraftInput label="Start date" dirty={dirtyPaths.has("campaignSettings.startDate")} value={draftData.campaignSettings.startDate} onChange={(value) => updateCampaignSetting("startDate", value)} />
            <DraftInput label="End date" dirty={dirtyPaths.has("campaignSettings.endDate")} value={draftData.campaignSettings.endDate} onChange={(value) => updateCampaignSetting("endDate", value)} />
            <DraftTextarea label="Locations" dirty={dirtyPaths.has("campaignSettings.locations")} value={draftData.campaignSettings.locations} onChange={(value) => updateCampaignSetting("locations", value)} />
            <DraftTextarea label="Languages" dirty={dirtyPaths.has("campaignSettings.languages")} value={draftData.campaignSettings.languages} onChange={(value) => updateCampaignSetting("languages", value)} />
          </div>
        </DraftSection>

        <DraftSection title="Ad Content" description="Changing copy, URLs, or paths may send ads back into review before serving.">
          <div className="space-y-5">
            <DraftInput label="Final URL" dirty={dirtyPaths.has("adContent.finalUrl")} value={draftData.adContent.finalUrl} onChange={(value) => updateAdContent("finalUrl", value)} />
            <DraftInput
              label="Display path parts"
              dirty={dirtyPaths.has("adContent.displayPathParts")}
              value={draftData.adContent.displayPathParts.join(" / ")}
              onChange={(value) => updateAdContent("displayPathParts", value.split("/").map((part) => part.trim()).filter(Boolean))}
            />
            <TextAssetEditor
              title="Headlines"
              dirty={dirtyPaths.has("adContent.headlines")}
              values={draftData.adContent.headlines.map((headline) => headline.text)}
              maxItems={15}
              onChange={(values) => updateAdContent("headlines", values.map((text) => ({ text })))}
            />
            <TextAssetEditor
              title="Descriptions"
              dirty={dirtyPaths.has("adContent.descriptions")}
              values={draftData.adContent.descriptions.map((description) => description.text)}
              maxItems={4}
              onChange={(values) => updateAdContent("descriptions", values.map((text) => ({ text })))}
            />
          </div>
        </DraftSection>

        <DraftSection title="Keywords" description="Edit keyword text as one keyword per line. Sync sends only the changed keyword collection.">
          <DraftTextarea
            label="Keywords"
            dirty={dirtyPaths.has("keywords")}
            value={draftData.keywords.join("\n")}
            onChange={(value) => setDraftData((current) => ({ ...current, keywords: lines(value) }))}
          />
        </DraftSection>

        <DraftSection title="Assets" description="Edit image URL metadata, business name, and logo URL as draft-only values until sync.">
          <div className="grid gap-4 md:grid-cols-2">
            <DraftInput label="Business name" dirty={dirtyPaths.has("assets.businessName")} value={draftData.assets.businessName} onChange={(value) => updateAssets("businessName", value)} />
            <DraftInput label="Business logo URL" dirty={dirtyPaths.has("assets.businessLogoUrl")} value={draftData.assets.businessLogoUrl} onChange={(value) => updateAssets("businessLogoUrl", value)} />
          </div>
          <DraftTextarea
            label="Image URLs"
            dirty={dirtyPaths.has("assets.images")}
            value={draftData.assets.images.map((image) => image.url).join("\n")}
            onChange={(value) =>
              setDraftData((current) => ({
                ...current,
                assets: {
                  ...current.assets,
                  images: lines(value).map((url, index) => ({ id: current.assets.images[index]?.id ?? `draft-image-${index + 1}`, url, alt: current.assets.images[index]?.alt ?? `Draft image ${index + 1}` })),
                },
              }))
            }
          />
        </DraftSection>

        <DraftSection title="Site Links" description="Edit sitelinks as rows in the format Link text | Description 1 | Description 2 | Final URL.">
          <DraftTextarea
            label="Site links"
            dirty={dirtyPaths.has("sitelinks")}
            value={draftData.sitelinks.map((item) => [item.linkText, item.description1 ?? "", item.description2 ?? "", item.finalUrl ?? ""].join(" | ")).join("\n")}
            onChange={(value) =>
              setDraftData((current) => ({
                ...current,
                sitelinks: lines(value).map((line, index) => {
                  const [linkText = "", description1 = "", description2 = "", finalUrl = ""] = line.split("|").map((part) => part.trim());
                  return { id: current.sitelinks[index]?.id ?? `draft-sitelink-${index + 1}`, linkText, description1, description2, finalUrl };
                }),
              }))
            }
          />
        </DraftSection>
      </div>

      {reviewOpen ? (
        <ReviewChangesModal
          changeSet={changeSet}
          validation={validation}
          syncState={syncState}
          onClose={() => setReviewOpen(false)}
          onSync={() => syncChanges(changeSet)}
        />
      ) : null}
    </ReportShell>
  );
}

function LockedFieldsPanel({ draftData }: { draftData: AdsDraftData }) {
  const lockedRows = [
    ["Platform", draftData.locked.platform],
    ["Account ID", draftData.locked.accountId],
    ["Campaign ID", draftData.locked.campaignId],
    ["Ad Group ID", draftData.locked.adGroupId],
    ["Ad ID", draftData.locked.adId],
    ["Campaign type", draftData.locked.campaignType],
    ["Ad type", draftData.locked.adType],
  ];

  return (
    <section className="rounded-[22px] border border-[#e2e8f0] bg-white p-5">
      <h2 className="text-xl font-semibold text-[#0f172a]">Locked fields</h2>
      <p className="mt-1 text-sm text-[#64748b]">These fields are visible for context only and are never editable or included as sync mutations.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {lockedRows.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
            <p className="text-xs font-medium text-[#64748b]">{label}</p>
            <p className="mt-1 break-all text-sm font-semibold text-[#0f172a]">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusPanel({
  syncState,
  validation,
  changeSet,
  message,
  warnings,
  error,
}: {
  syncState: AdsSyncState;
  validation: AdsDraftValidationResult;
  changeSet: AdsChangeSet;
  message: string | null;
  warnings: string[];
  error: string | null;
}) {
  return (
    <section className="rounded-[22px] border border-[#e2e8f0] bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <StateBadge state={syncState} />
        <span className="text-sm text-[#64748b]">{changeSet.changes.length} changed field group{changeSet.changes.length === 1 ? "" : "s"}</span>
        {!validation.valid ? <span className="text-sm font-medium text-[#b45309]">{validation.issues.length} validation issue{validation.issues.length === 1 ? "" : "s"}</span> : null}
      </div>
      {validation.issues.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-[#fed7aa] bg-[#fff7ed] p-4 text-sm text-[#9a3412]">
          {validation.issues.slice(0, 6).map((issue) => <p key={`${issue.path}-${issue.message}`}>{issue.message}</p>)}
        </div>
      ) : null}
      {changeSet.warnings.length > 0 || warnings.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-4 text-sm text-[#92400e]">
          {[...changeSet.warnings, ...warnings].map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      ) : null}
      {message ? <p className="mt-4 rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-sm text-[#166534]">{message}</p> : null}
      {error ? <p className="mt-4 rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#991b1b]">{error}</p> : null}
    </section>
  );
}

function DraftSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-[24px] border border-[#e2e8f0] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
      <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#0f172a]">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-[#64748b]">{description}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function DraftInput({ label, value, dirty, onChange }: { label: string; value: string; dirty: boolean; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-sm font-semibold text-[#334155]">{label}{dirty ? <DirtyPill /> : null}</span>
      <Input className="mt-2 min-h-11 rounded-xl bg-white" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function DraftTextarea({ label, value, dirty, onChange }: { label: string; value: string; dirty: boolean; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-sm font-semibold text-[#334155]">{label}{dirty ? <DirtyPill /> : null}</span>
      <Textarea className="mt-2 min-h-32 rounded-xl bg-white" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextAssetEditor({ title, values, maxItems, dirty, onChange }: { title: string; values: string[]; maxItems: number; dirty: boolean; onChange: (values: string[]) => void }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-[#334155]">{title} {values.length}/{maxItems}{dirty ? <DirtyPill /> : null}</p>
        <Button type="button" variant="outline" size="sm" disabled={values.length >= maxItems} onClick={() => onChange([...values, ""])}>
          Add {title.slice(0, -1)}
        </Button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {values.map((value, index) => (
          <div key={index} className="flex gap-2">
            <Input
              className="min-h-11 rounded-xl bg-white"
              value={value}
              onChange={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewChangesModal({ changeSet, validation, syncState, onClose, onSync }: { changeSet: AdsChangeSet; validation: AdsDraftValidationResult; syncState: AdsSyncState; onClose: () => void; onSync: () => void }) {
  const disabled = changeSet.changes.length === 0 || !validation.valid || syncState === "syncing";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-[24px] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#e2e8f0] p-6">
          <div>
            <h2 className="text-2xl font-semibold text-[#0f172a]">Review Changes</h2>
            <p className="mt-1 text-sm text-[#64748b]">Only these changed fields will be sent in one backend changeSet payload.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-[#64748b] hover:bg-[#f1f5f9]" aria-label="Close review modal">
            <XIcon className="size-5" />
          </button>
        </div>
        <div className="max-h-[56vh] space-y-4 overflow-y-auto p-6">
          {changeSet.warnings.map((warning) => (
            <div key={warning} className="flex gap-3 rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-4 text-sm text-[#92400e]">
              <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" />
              <p>{warning}</p>
            </div>
          ))}
          {changeSet.changes.length > 0 ? changeSet.changes.map((change) => (
            <div key={change.path} className="rounded-2xl border border-[#e2e8f0] p-4">
              <p className="text-sm font-semibold text-[#0f172a]">{change.label}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <ReviewValue label="Before" value={change.before} />
                <ReviewValue label="After" value={change.after} />
              </div>
            </div>
          )) : <p className="text-sm text-[#64748b]">No changes to review.</p>}
        </div>
        <div className="flex flex-col gap-3 border-t border-[#e2e8f0] p-6 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={disabled} onClick={onSync} className="bg-[#1a73e8] text-white hover:bg-[#1557b0]">
            {syncState === "syncing" ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Save & Sync
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReviewValue({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl bg-[#f8fafc] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">{label}</p>
      <pre className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-[#334155]">{formatReviewValue(value)}</pre>
    </div>
  );
}

function StateBadge({ state }: { state: AdsSyncState }) {
  const isSuccess = state === "synced";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${isSuccess ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]" : "border-[#e2e8f0] bg-[#f8fafc] text-[#334155]"}`}>
      {isSuccess ? <CheckCircle2Icon className="size-4" /> : null}
      {state}
    </span>
  );
}

function DirtyPill() {
  return <span className="rounded-full bg-[#dbeafe] px-2 py-0.5 text-xs font-semibold text-[#1d4ed8]">edited</span>;
}

function copyParam(source: URLSearchParams, target: URLSearchParams, key: string) {
  const value = source.get(key);
  if (value) {
    target.set(key, value);
  }
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function formatReviewValue(value: unknown): string {
  if (typeof value === "string") {
    return value || "(blank)";
  }
  return JSON.stringify(value, null, 2);
}
