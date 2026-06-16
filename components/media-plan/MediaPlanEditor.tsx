"use client";

import {
  BarChart3Icon,
  BriefcaseIcon,
  Building2Icon,
  CalendarDaysIcon,
  CircleDollarSignIcon,
  CrosshairIcon,
  FileTextIcon,
  GlobeIcon,
  InfoIcon,
  LanguagesIcon,
  LinkIcon,
  ListIcon,
  Loader2Icon,
  MapPinIcon,
  PlusIcon,
  Redo2Icon,
  SearchIcon,
  SettingsIcon,
  TagIcon,
  TargetIcon,
  TriangleAlertIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_NETWORK,
  MEDIA_PLAN_LIMITS,
  MediaPlan,
  MediaPlanAdGroup,
  MediaPlanApproveSuccessResponse,
  MediaPlanCampaign,
  MediaPlanCreateCampaignSuccessResponse,
  MediaPlanKeyword,
  MediaPlanKeywordMatchType,
  MediaPlanLanguage,
  MediaPlanSitelink,
} from "@/lib/media-plan/schema";
import {
  getIssueMessage,
  hasIssueForPath,
  MediaPlanValidationIssue,
} from "@/lib/media-plan/validation";

interface MediaPlanEditorProps {
  plan: MediaPlan | null;
  issues: MediaPlanValidationIssue[];
  canApprove: boolean;
  savingToNotion: boolean;
  approvalResult: MediaPlanApproveSuccessResponse | null;
  creatingCampaign: boolean;
  campaignResult: MediaPlanCreateCampaignSuccessResponse | null;
  canUndo: boolean;
  canRedo: boolean;
  onChange: (nextPlan: MediaPlan) => void;
  onUndo: () => void;
  onRedo: () => void;
  onApprove: () => void;
}

const MATCH_TYPES: MediaPlanKeywordMatchType[] = ["BROAD", "PHRASE", "EXACT"];

export function MediaPlanEditor({
  plan,
  issues,
  canApprove,
  savingToNotion,
  approvalResult,
  creatingCampaign,
  campaignResult,
  canUndo,
  canRedo,
  onChange,
  onUndo,
  onRedo,
  onApprove,
}: MediaPlanEditorProps) {
  if (!plan) {
    return (
      <section className="rounded-2xl border border-dashed border-[#cfcfcf] bg-white p-5 text-sm text-[#667085]">
        Complete the form and generate a media plan to start editing.
      </section>
    );
  }

  const currentPlan = plan;

  function updatePlan(nextPlan: MediaPlan) {
    onChange(nextPlan);
  }

  function updateCampaign(updater: (campaign: MediaPlanCampaign) => MediaPlanCampaign) {
    updatePlan({ ...currentPlan, campaign: updater(currentPlan.campaign) });
  }

  function updateAdGroup(index: number, updater: (adGroup: MediaPlanAdGroup) => MediaPlanAdGroup) {
    updatePlan({
      ...currentPlan,
      adGroups: currentPlan.adGroups.map((adGroup, adGroupIndex) =>
        adGroupIndex === index ? updater(adGroup) : adGroup
      ),
    });
  }

  function addAdGroup() {
    updatePlan({
      ...currentPlan,
      adGroups: [
        ...currentPlan.adGroups,
        {
          adGroupName: "",
          intentType: "",
          keywords: [{ text: "", matchType: "BROAD" }],
          displayPath1: "",
          displayPath2: "",
          headlines: ["", "", ""],
          descriptions: ["", ""],
          sitelinks: [],
        },
      ],
    });
  }

  function removeAdGroup(index: number) {
    updatePlan({
      ...currentPlan,
      adGroups: currentPlan.adGroups.filter((_, adGroupIndex) => adGroupIndex !== index),
    });
  }

  return (
    <section className="space-y-4">
      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <CampaignSummaryCard>
          <SummaryEditableRow
            icon={<FileTextIcon className="size-4" />}
            label="Batch Preview ID"
            value={currentPlan.batchPreviewId}
            error={getIssueMessage(issues, "batchPreviewId")}
            onChange={(value) => updatePlan({ ...currentPlan, batchPreviewId: value })}
          />
          <SummaryEditableRow
            icon={<TagIcon className="size-4" />}
            label="Campaign Name"
            value={currentPlan.campaign.campaignName}
            error={getIssueMessage(issues, "campaign.campaignName")}
            onChange={(value) => updateCampaign((campaign) => ({ ...campaign, campaignName: value }))}
          />
          <SummaryEditableRow
            icon={<Building2Icon className="size-4" />}
            label="Brand / Client"
            value={currentPlan.campaign.brandOrClientName}
            error={getIssueMessage(issues, "campaign.brandOrClientName")}
            onChange={(value) => updateCampaign((campaign) => ({ ...campaign, brandOrClientName: value }))}
          />
          <SummaryEditableRow
            icon={<BriefcaseIcon className="size-4" />}
            label="Business Name"
            value={currentPlan.campaign.businessName}
            error={getIssueMessage(issues, "campaign.businessName")}
            onChange={(value) => updateCampaign((campaign) => ({ ...campaign, businessName: value }))}
          />
          <SummaryEditableRow
            icon={<GlobeIcon className="size-4" />}
            label="Website URL"
            value={currentPlan.campaign.websiteUrl}
            error={getIssueMessage(issues, "campaign.websiteUrl")}
            onChange={(value) => updateCampaign((campaign) => ({ ...campaign, websiteUrl: value }))}
          />
          <SummaryEditableRow
            icon={<LinkIcon className="size-4" />}
            label="Final URL"
            value={currentPlan.campaign.finalUrl}
            error={getIssueMessage(issues, "campaign.finalUrl")}
            onChange={(value) => updateCampaign((campaign) => ({ ...campaign, finalUrl: value }))}
          />
        </CampaignSummaryCard>

        <CampaignSettingsCard>
          <SettingsEditableField
            icon={<CrosshairIcon className="size-4" />}
            label="Campaign Type"
            value={currentPlan.campaign.campaignType}
            error={getIssueMessage(issues, "campaign.campaignType")}
            onChange={(value) =>
              updateCampaign((campaign) => ({ ...campaign, campaignType: value as "Search" }))
            }
          />
          <SettingsEditableField
            icon={<TargetIcon className="size-4" />}
            label="Campaign Objective"
            value={currentPlan.campaign.campaignObjective}
            error={getIssueMessage(issues, "campaign.campaignObjective")}
            onChange={(value) =>
              updateCampaign((campaign) => ({
                ...campaign,
                campaignObjective: value as MediaPlanCampaign["campaignObjective"],
              }))
            }
          />
          <SettingsEditableField
            icon={<BarChart3Icon className="size-4" />}
            label="Bidding Strategy"
            value={currentPlan.campaign.biddingStrategy}
            error={getIssueMessage(issues, "campaign.biddingStrategy")}
            onChange={(value) =>
              updateCampaign((campaign) => ({
                ...campaign,
                biddingStrategy: value as MediaPlanCampaign["biddingStrategy"],
              }))
            }
          />
          <SettingsEditableField
            icon={<CalendarDaysIcon className="size-4" />}
            label="Start Date"
            value={currentPlan.campaign.startDate}
            error={getIssueMessage(issues, "campaign.startDate")}
            onChange={(value) => updateCampaign((campaign) => ({ ...campaign, startDate: value }))}
          />
          <SettingsEditableField
            icon={<BriefcaseIcon className="size-4" />}
            label="Average Daily Budget"
            value={String(currentPlan.campaign.averageDailyBudget)}
            error={getIssueMessage(issues, "campaign.averageDailyBudget")}
            onChange={(value) =>
              updateCampaign((campaign) => ({ ...campaign, averageDailyBudget: Number(value) }))
            }
          />
          <SettingsEditableField
            icon={<CircleDollarSignIcon className="size-4" />}
            label="Target CPA"
            value={currentPlan.campaign.targetCPA === null ? "" : String(currentPlan.campaign.targetCPA)}
            error={getIssueMessage(issues, "campaign.targetCPA")}
            placeholder="-"
            onChange={(value) =>
              updateCampaign((campaign) => ({
                ...campaign,
                targetCPA: value.trim() ? Number(value) : null,
              }))
            }
          />
          <SettingsEditableField
            icon={<SearchIcon className="size-4" />}
            label="Network"
            value={currentPlan.campaign.network.join(", ")}
            error={getIssueMessage(issues, "campaign.network")}
            onChange={(value) =>
              updateCampaign((campaign) => ({
                ...campaign,
                network: [value.trim() || DEFAULT_NETWORK] as ["Google Search Only"],
              }))
            }
          />
          <SettingsEditableField
            icon={<MapPinIcon className="size-4" />}
            label="Target Location"
            value={currentPlan.campaign.targetLocation.join(", ")}
            error={getIssueMessage(issues, "campaign.targetLocation")}
            onChange={(value) =>
              updateCampaign((campaign) => ({
                ...campaign,
                targetLocation: splitList(value),
              }))
            }
          />
          <SettingsEditableField
            icon={<LanguagesIcon className="size-4" />}
            label="Language"
            value={currentPlan.campaign.language.join(", ")}
            error={getIssueMessage(issues, "campaign.language")}
            onChange={(value) =>
              updateCampaign((campaign) => ({
                ...campaign,
                language: splitList(value) as MediaPlanLanguage[],
              }))
            }
          />
          <SettingsEditableField
            icon={<FileTextIcon className="size-4" />}
            label="Network Notes"
            value={currentPlan.campaign.networkNotes}
            error={getIssueMessage(issues, "campaign.networkNotes")}
            multiline
            onChange={(value) => updateCampaign((campaign) => ({ ...campaign, networkNotes: value }))}
          />
        </CampaignSettingsCard>
      </div>

      <AdGroupsTabbedSection
        adGroups={currentPlan.adGroups}
        issues={issues}
        onAddAdGroup={addAdGroup}
        onRemoveAdGroup={removeAdGroup}
        onChangeAdGroup={updateAdGroup}
      />

      <SetupNotesSection
        planningNotes={currentPlan.planningNotes}
        issues={issues}
        onChange={(planningNotes) => updatePlan({ ...currentPlan, planningNotes })}
      />

      <div className="sticky bottom-0 z-10 rounded-2xl border border-[#dedede] bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#344054]">
              {campaignResult
                ? "Created Paused in Google Ads."
                : approvalResult
                  ? "Saved to Notion and created in Google Ads."
                  : "Approve the final edited Search plan."}
            </p>
            <p className="text-sm text-[#667085]">
              {campaignResult
                ? `Campaign ${campaignResult.campaignId} is paused and ready for review.`
                : approvalResult
                ? `Batch ${approvalResult.batchId} created ${approvalResult.createdRowCount} Notion rows.`
                : "This saves one row per ad group, then creates a paused Google Search campaign."}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button
                type="button"
                variant="outline"
                className="h-11 border-[#d7d7d7] px-3 text-[#344054] hover:bg-[#fff1f2] hover:text-[#9f0019]"
                disabled={!canUndo || savingToNotion || creatingCampaign || Boolean(campaignResult)}
                title="Undo last media plan edit (Ctrl+Z)"
                onClick={onUndo}
              >
                <Undo2Icon className="size-4" />
                Undo
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 border-[#d7d7d7] px-3 text-[#344054] hover:bg-[#fff1f2] hover:text-[#9f0019]"
                disabled={!canRedo || savingToNotion || creatingCampaign || Boolean(campaignResult)}
                title="Redo media plan edit (Ctrl+Y or Ctrl+Shift+Z)"
                onClick={onRedo}
              >
                <Redo2Icon className="size-4" />
                Redo
              </Button>
            </div>
            <Button
              type="button"
              className="h-11 bg-[#9f0019] text-white hover:bg-[#820015]"
              disabled={!canApprove || savingToNotion || creatingCampaign || Boolean(campaignResult)}
              title={
                canApprove
                  ? "Save approved media plan to Notion and create a paused Google Search campaign."
                  : "Fix validation issues before approval."
              }
              onClick={onApprove}
            >
              {savingToNotion || creatingCampaign ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {savingToNotion || creatingCampaign ? "Approving & Creating Campaign" : "Approve & Create Paused Campaign"}
            </Button>
            {campaignResult ? (
              <Button type="button" variant="outline" className="h-11" asChild>
                <a href={campaignResult.googleAdsReviewLink} target="_blank" rel="noreferrer">
                  Open Google Ads Review
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function AdGroupsTabbedSection({
  adGroups,
  issues,
  onAddAdGroup,
  onRemoveAdGroup,
  onChangeAdGroup,
}: {
  adGroups: MediaPlanAdGroup[];
  issues: MediaPlanValidationIssue[];
  onAddAdGroup: () => void;
  onRemoveAdGroup: (index: number) => void;
  onChangeAdGroup: (
    index: number,
    updater: (adGroup: MediaPlanAdGroup) => MediaPlanAdGroup
  ) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const safeActiveIndex = Math.min(Math.max(activeIndex, 0), Math.max(adGroups.length - 1, 0));
  const activeAdGroup = adGroups[safeActiveIndex];
  const tabLabels = useMemo(
    () => adGroups.map((_, index) => `Ad Group ${index + 1}`),
    [adGroups]
  );

  function handleAddAdGroup() {
    onAddAdGroup();
    setActiveIndex(adGroups.length);
  }

  function handleRemoveActiveAdGroup() {
    if (adGroups.length <= 1) {
      return;
    }

    onRemoveAdGroup(safeActiveIndex);
    setActiveIndex(Math.max(0, safeActiveIndex - 1));
  }

  if (!activeAdGroup) {
    return (
      <section className="rounded-2xl border border-[#dedede] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold text-[#9f0019]">Ad Groups</h2>
          <Button
            type="button"
            className="h-9 bg-[#b00012] px-3 text-white hover:bg-[#8f0010]"
            onClick={handleAddAdGroup}
          >
            <PlusIcon className="size-4" />
            Add Ad Group
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[#dedede] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#9f0019]">Ad Groups</h2>
          <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-[#667085]">
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
            Click on a tab to view and manage a specific ad group. Add a new ad group to create a new tab.
          </p>
        </div>
        <Button
          type="button"
          className="h-9 bg-[#b00012] px-3 text-white shadow-sm hover:bg-[#8f0010]"
          onClick={handleAddAdGroup}
        >
          <PlusIcon className="size-4" />
          Add Ad Group
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-b border-[#e5e7eb]">
        {tabLabels.map((label, index) => {
          const isActive = index === safeActiveIndex;
          return (
            <button
              key={label}
              type="button"
              aria-pressed={isActive}
              className={[
                "min-h-10 border-b-2 px-5 text-sm font-bold transition-colors",
                isActive
                  ? "border-[#d4001a] text-[#b00012]"
                  : "border-transparent text-[#667085] hover:border-[#f2b5bd] hover:text-[#9f0019]",
              ].join(" ")}
              onClick={() => setActiveIndex(index)}
            >
              {label}
            </button>
          );
        })}
        <button
          type="button"
          className="mb-0 flex size-10 items-center justify-center rounded-t-lg border border-b-0 border-[#d7d7d7] bg-white text-[#344054] transition-colors hover:bg-[#fff1f2] hover:text-[#b00012]"
          aria-label="Add ad group tab"
          onClick={handleAddAdGroup}
        >
          <PlusIcon className="size-4" />
        </button>
      </div>

      <div className="mt-3 rounded-xl border border-[#e5e7eb] bg-[#fbfbfb] p-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)_auto] lg:items-end">
          <AdGroupCompactField
            label="Ad Group Name"
            value={activeAdGroup.adGroupName}
            error={getIssueMessage(issues, `adGroups.${safeActiveIndex}.adGroupName`)}
            onChange={(value) =>
              onChangeAdGroup(safeActiveIndex, (current) => ({
                ...current,
                adGroupName: value,
              }))
            }
          />
          <AdGroupCompactField
            label="Intent Type"
            value={activeAdGroup.intentType}
            error={getIssueMessage(issues, `adGroups.${safeActiveIndex}.intentType`)}
            multiline
            onChange={(value) =>
              onChangeAdGroup(safeActiveIndex, (current) => ({
                ...current,
                intentType: value,
              }))
            }
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            title="Remove ad group"
            aria-label="Remove ad group"
            className="border-[#e5e7eb] text-[#b00012] hover:bg-[#fff1f2] hover:text-[#8f0010]"
            onClick={handleRemoveActiveAdGroup}
            disabled={adGroups.length === 1}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-[#e5e7eb] bg-[#fbfbfb] p-3">
        <h3 className="mb-2 text-sm font-bold text-[#344054]">Display Path</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          <DisplayPathCompactField
            label="Display Path 1"
            value={activeAdGroup.displayPath1}
            error={getIssueMessage(issues, `adGroups.${safeActiveIndex}.displayPath1`)}
            onChange={(value) =>
              onChangeAdGroup(safeActiveIndex, (current) => ({
                ...current,
                displayPath1: value,
              }))
            }
          />
          <DisplayPathCompactField
            label="Display Path 2"
            value={activeAdGroup.displayPath2}
            error={getIssueMessage(issues, `adGroups.${safeActiveIndex}.displayPath2`)}
            onChange={(value) =>
              onChangeAdGroup(safeActiveIndex, (current) => ({
                ...current,
                displayPath2: value,
              }))
            }
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <div className="grid content-start gap-3">
          <KeywordsEditor
            adGroup={activeAdGroup}
            adGroupIndex={safeActiveIndex}
            issues={issues}
            onChange={(keywords) =>
              onChangeAdGroup(safeActiveIndex, (current) => ({ ...current, keywords }))
            }
          />
          <SitelinksEditor
            sitelinks={activeAdGroup.sitelinks}
            adGroupIndex={safeActiveIndex}
            issues={issues}
            onChange={(sitelinks) =>
              onChangeAdGroup(safeActiveIndex, (current) => ({ ...current, sitelinks }))
            }
          />
        </div>
        <ResponsiveSearchAdsEditor
          adGroup={activeAdGroup}
          adGroupIndex={safeActiveIndex}
          issues={issues}
          onChange={(nextAdGroup) => onChangeAdGroup(safeActiveIndex, () => nextAdGroup)}
        />
      </div>
    </section>
  );
}

function AdGroupCompactField({
  label,
  value,
  error,
  multiline = false,
  onChange,
}: {
  label: string;
  value: string;
  error?: string | null;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs font-bold text-[#1f2937]">{label}</Label>
      {multiline ? (
        <Textarea
          value={value}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-9 resize-y rounded-lg border-[#d7d7d7] bg-white px-3 py-2 text-sm leading-5 shadow-none focus-visible:border-[#9f0019] focus-visible:ring-[#9f0019]/15 md:text-sm"
        />
      ) : (
        <Input
          value={value}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 rounded-lg border-[#d7d7d7] bg-white px-3 text-sm shadow-none focus-visible:border-[#9f0019] focus-visible:ring-[#9f0019]/15 md:text-sm"
        />
      )}
      {error ? <p className="text-xs font-medium text-[#be123c]">{error}</p> : null}
    </div>
  );
}

function DisplayPathCompactField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string | null;
  onChange: (value: string) => void;
}) {
  const maxLength = MEDIA_PLAN_LIMITS.displayPath;
  const overLimit = value.length > maxLength;
  return (
    <div className="grid gap-1 sm:grid-cols-[110px_minmax(0,1fr)] sm:items-start">
      <Label className="pt-2 text-xs font-bold text-[#667085]">{label}</Label>
      <div className="grid gap-1">
        <div className="relative">
          <Input
            value={value}
            aria-invalid={Boolean(error) || overLimit}
            onChange={(event) => onChange(event.target.value)}
            className="h-9 rounded-lg border-[#d7d7d7] bg-white px-3 pr-12 text-sm shadow-none focus-visible:border-[#9f0019] focus-visible:ring-[#9f0019]/15 md:text-sm"
          />
          <span
            className={[
              "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium",
              overLimit ? "text-[#be123c]" : "text-[#667085]",
            ].join(" ")}
          >
            {value.length}/{maxLength}
          </span>
        </div>
        {error ? <p className="text-xs font-medium text-[#be123c]">{error}</p> : null}
        {!error && overLimit ? (
          <p className="text-xs font-medium text-[#be123c]">
            {label} must be {maxLength} characters or fewer.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SetupNotesSection({
  planningNotes,
  issues,
  onChange,
}: {
  planningNotes: MediaPlan["planningNotes"];
  issues: MediaPlanValidationIssue[];
  onChange: (planningNotes: MediaPlan["planningNotes"]) => void;
}) {
  function updateAssumption(index: number, value: string) {
    onChange({
      ...planningNotes,
      assumptions: planningNotes.assumptions.map((item, itemIndex) =>
        itemIndex === index ? value : item
      ),
    });
  }

  function updateWarning(index: number, value: string) {
    onChange({
      ...planningNotes,
      warnings: planningNotes.warnings.map((item, itemIndex) =>
        itemIndex === index ? value : item
      ),
    });
  }

  return (
    <section className="rounded-2xl border border-[#dedede] bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-xl font-bold leading-tight text-[#7f0013]">Setup Notes</h2>
      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        <SetupNoteCard
          title="Strategy"
          icon={<TargetIcon className="size-5" />}
          onAdd={() =>
            onChange({
              ...planningNotes,
              strategy: planningNotes.strategy.trim()
                ? `${planningNotes.strategy}\n`
                : planningNotes.strategy,
            })
          }
        >
          {getIssueMessage(issues, "planningNotes.strategy") ? (
            <SectionIssue message={getIssueMessage(issues, "planningNotes.strategy")} />
          ) : null}
          <Textarea
            value={planningNotes.strategy}
            aria-invalid={Boolean(getIssueMessage(issues, "planningNotes.strategy"))}
            onChange={(event) =>
              onChange({
                ...planningNotes,
                strategy: event.target.value,
              })
            }
            className="min-h-48 resize-y rounded-xl border-[#d7d7d7] bg-white px-3 py-3 text-sm leading-6 shadow-none focus-visible:border-[#9f0019] focus-visible:ring-[#9f0019]/15 md:text-sm"
          />
        </SetupNoteCard>

        <SetupNoteListCard
          title="Assumptions"
          icon={<BarChart3Icon className="size-5" />}
          values={planningNotes.assumptions}
          issuePath="planningNotes.assumptions"
          issues={issues}
          onAdd={() =>
            onChange({
              ...planningNotes,
              assumptions: [...planningNotes.assumptions, ""],
            })
          }
          onChangeItem={updateAssumption}
          onRemoveItem={(index) =>
            onChange({
              ...planningNotes,
              assumptions: planningNotes.assumptions.filter((_, itemIndex) => itemIndex !== index),
            })
          }
        />

        <SetupNoteListCard
          title="Warnings"
          icon={<TriangleAlertIcon className="size-5" />}
          values={planningNotes.warnings}
          issuePath="planningNotes.warnings"
          issues={issues}
          onAdd={() =>
            onChange({
              ...planningNotes,
              warnings: [...planningNotes.warnings, ""],
            })
          }
          onChangeItem={updateWarning}
          onRemoveItem={(index) =>
            onChange({
              ...planningNotes,
              warnings: planningNotes.warnings.filter((_, itemIndex) => itemIndex !== index),
            })
          }
        />
      </div>
    </section>
  );
}

function SetupNoteCard({
  title,
  icon,
  onAdd,
  children,
}: {
  title: string;
  icon: ReactNode;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#e5e7eb] bg-[#fbfbfb] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#b00012] text-white shadow-sm">
            {icon}
          </div>
          <h3 className="truncate text-lg font-bold text-[#7f0013]">{title}</h3>
        </div>
        <SetupNoteAddButton onClick={onAdd} />
      </div>
      {children}
    </section>
  );
}

function SetupNoteListCard({
  title,
  icon,
  values,
  issuePath,
  issues,
  onAdd,
  onChangeItem,
  onRemoveItem,
}: {
  title: string;
  icon: ReactNode;
  values: string[];
  issuePath: string;
  issues: MediaPlanValidationIssue[];
  onAdd: () => void;
  onChangeItem: (index: number, value: string) => void;
  onRemoveItem: (index: number) => void;
}) {
  return (
    <SetupNoteCard title={title} icon={icon} onAdd={onAdd}>
      {hasIssueForPath(issues, issuePath) ? (
        <SectionIssue message={getIssueMessage(issues, issuePath)} />
      ) : null}
      <div className="grid content-start gap-2">
        {values.map((value, index) => (
          <SetupNoteListRow
            key={index}
            label={`${title.slice(0, -1).toLowerCase()} ${index + 1}`}
            value={value}
            error={getIssueMessage(issues, `${issuePath}.${index}`)}
            onChange={(nextValue) => onChangeItem(index, nextValue)}
            onRemove={() => onRemoveItem(index)}
          />
        ))}
      </div>
    </SetupNoteCard>
  );
}

function SetupNoteListRow({
  label,
  value,
  error,
  onChange,
  onRemove,
}: {
  label: string;
  value: string;
  error?: string | null;
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 shadow-sm">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <span className="mt-3 size-1.5 rounded-full bg-[#b00012]" aria-hidden="true" />
        <Textarea
          value={value}
          aria-label={label}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-10 resize-y rounded-lg border-transparent bg-transparent px-0 py-1 text-sm leading-6 shadow-none focus-visible:border-[#d7d7d7] focus-visible:bg-white focus-visible:px-2 focus-visible:ring-[#9f0019]/15 md:text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`Remove ${label}`}
          className="mt-1 border-[#e5e7eb] bg-white text-[#111827] shadow-sm hover:bg-[#fff1f2] hover:text-[#b00012]"
          onClick={onRemove}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
      {error ? <p className="ml-5 mt-1 text-xs font-medium text-[#be123c]">{error}</p> : null}
    </div>
  );
}

function SetupNoteAddButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-9 border-[#b00012] px-3 text-[#7f0013] hover:bg-[#fff1f2] hover:text-[#b00012]"
      onClick={onClick}
    >
      <PlusIcon className="size-4" />
      Add
    </Button>
  );
}

function CampaignSummaryCard({ children }: { children: ReactNode }) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-[#dedede] border-l-4 border-l-[#d4001a] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2.5 border-b border-[#e5e7eb] pb-2.5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-[#fff1f2] text-[#b00012]">
          <ListIcon className="size-4" />
        </div>
        <h2 className="text-lg font-bold leading-tight text-[#9f0019]">Campaign Summary</h2>
      </div>
      <div className="grid flex-1 content-start gap-3">{children}</div>
    </section>
  );
}

function SummaryEditableRow({
  icon,
  label,
  value,
  error,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  error?: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        <span className="flex size-4 items-center justify-center text-[#b00012]">{icon}</span>
        <Label className="text-[13px] font-bold text-[#344054]">{label}</Label>
      </div>
      {label === "Batch Preview ID" ? (
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          className="h-9 rounded-lg border-[#d7d7d7] bg-[#fafafa] px-3 text-sm font-semibold shadow-none focus-visible:border-[#9f0019] focus-visible:bg-white focus-visible:ring-[#9f0019]/15 md:text-sm"
        />
      ) : (
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          className="min-h-10 resize-y rounded-lg border-[#d7d7d7] bg-white px-3 py-2 text-sm leading-5 shadow-none focus-visible:border-[#9f0019] focus-visible:ring-[#9f0019]/15 md:text-sm"
        />
      )}
      {error ? <p className="text-xs font-medium text-[#be123c]">{error}</p> : null}
    </div>
  );
}

function CampaignSettingsCard({ children }: { children: ReactNode }) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-[#dedede] border-l-4 border-l-[#d4001a] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2.5 border-b border-[#e5e7eb] pb-2.5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-[#fff1f2] text-[#b00012]">
          <SettingsIcon className="size-4" />
        </div>
        <h2 className="text-lg font-bold leading-tight text-[#9f0019]">Campaign Settings</h2>
      </div>
      <div className="grid flex-1 content-start gap-x-5 gap-y-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function SettingsEditableField({
  icon,
  label,
  value,
  error,
  placeholder,
  multiline = false,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  error?: string | null;
  placeholder?: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const invalid = Boolean(error);
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        <span className="flex size-4 items-center justify-center text-[#b00012]">{icon}</span>
        <Label className="text-[13px] font-bold text-[#344054]">{label}</Label>
      </div>
      {multiline ? (
        <Textarea
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          className="min-h-16 resize-y rounded-lg border-[#d7d7d7] bg-white px-3 py-2 text-sm shadow-none focus-visible:border-[#9f0019] focus-visible:ring-[#9f0019]/15 md:text-sm"
        />
      ) : (
        <Input
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          className="h-9 rounded-lg border-[#d7d7d7] bg-white px-3 text-sm shadow-none focus-visible:border-[#9f0019] focus-visible:ring-[#9f0019]/15 md:text-sm"
        />
      )}
      {error ? <p className="text-xs font-medium text-[#be123c]">{error}</p> : null}
    </div>
  );
}

function KeywordsEditor({
  adGroup,
  adGroupIndex,
  issues,
  onChange,
}: {
  adGroup: MediaPlanAdGroup;
  adGroupIndex: number;
  issues: MediaPlanValidationIssue[];
  onChange: (keywords: MediaPlanKeyword[]) => void;
}) {
  const keywordPath = `adGroups.${adGroupIndex}.keywords`;
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-[#9f0019]">Keywords</h3>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="border-[#efd4d8] text-[#b00012] hover:bg-[#fff1f2] hover:text-[#8f0010]"
          onClick={() => onChange([...adGroup.keywords, { text: "", matchType: "BROAD" }])}
        >
          <PlusIcon className="size-3" />
          Add Keyword
        </Button>
      </div>
      {hasIssueForPath(issues, keywordPath) ? (
        <SectionIssue message={getIssueMessage(issues, keywordPath)} />
      ) : null}
      <div className="grid gap-2">
        {adGroup.keywords.map((keyword, keywordIndex) => (
          <div key={keywordIndex} className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
            <Input
              value={keyword.text}
              placeholder="keyword text"
              aria-invalid={Boolean(getIssueMessage(issues, `${keywordPath}.${keywordIndex}.text`))}
              className="h-8 rounded-md border-[#d7d7d7] text-sm shadow-none focus-visible:border-[#9f0019] focus-visible:ring-[#9f0019]/15 md:text-sm"
              onChange={(event) =>
                onChange(
                  adGroup.keywords.map((item, itemIndex) =>
                    itemIndex === keywordIndex ? { ...item, text: event.target.value } : item
                  )
                )
              }
            />
            <Input
              value={keyword.matchType}
              list={`match-types-${adGroupIndex}-${keywordIndex}`}
              aria-invalid={Boolean(getIssueMessage(issues, `${keywordPath}.${keywordIndex}.matchType`))}
              className="h-8 rounded-md border-[#d7d7d7] text-sm font-bold text-[#b00012] shadow-none focus-visible:border-[#9f0019] focus-visible:ring-[#9f0019]/15 md:text-sm"
              onChange={(event) =>
                onChange(
                  adGroup.keywords.map((item, itemIndex) =>
                    itemIndex === keywordIndex
                      ? { ...item, matchType: event.target.value as MediaPlanKeywordMatchType }
                      : item
                  )
                )
              }
            />
            <datalist id={`match-types-${adGroupIndex}-${keywordIndex}`}>
              {MATCH_TYPES.map((matchType) => (
                <option key={matchType} value={matchType} />
              ))}
            </datalist>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={`Remove keyword ${keywordIndex + 1}`}
              className="border-[#e5e7eb] text-[#b00012] hover:bg-[#fff1f2] hover:text-[#8f0010]"
              onClick={() => onChange(adGroup.keywords.filter((_, itemIndex) => itemIndex !== keywordIndex))}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResponsiveSearchAdsEditor({
  adGroup,
  adGroupIndex,
  issues,
  onChange,
}: {
  adGroup: MediaPlanAdGroup;
  adGroupIndex: number;
  issues: MediaPlanValidationIssue[];
  onChange: (adGroup: MediaPlanAdGroup) => void;
}) {
  const headlinePath = `adGroups.${adGroupIndex}.headlines`;
  const descriptionPath = `adGroups.${adGroupIndex}.descriptions`;
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[#9f0019]">Responsive Search Ads</h3>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="border-[#efd4d8] text-[#b00012] hover:bg-[#fff1f2] hover:text-[#8f0010]"
            onClick={() => onChange({ ...adGroup, headlines: [...adGroup.headlines, ""] })}
          >
            <PlusIcon className="size-3" />
            Headline
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="border-[#efd4d8] text-[#b00012] hover:bg-[#fff1f2] hover:text-[#8f0010]"
            onClick={() => onChange({ ...adGroup, descriptions: [...adGroup.descriptions, ""] })}
          >
            <PlusIcon className="size-3" />
            Description
          </Button>
        </div>
      </div>

      {hasIssueForPath(issues, headlinePath) ? (
        <SectionIssue message={getIssueMessage(issues, headlinePath)} />
      ) : null}

      <div className="grid gap-2">
        {adGroup.headlines.map((headline, headlineIndex) => (
          <LimitedRow
            key={headlineIndex}
            label={`Headline ${headlineIndex + 1}`}
            value={headline}
            maxLength={MEDIA_PLAN_LIMITS.headline}
            error={getIssueMessage(issues, `${headlinePath}.${headlineIndex}`)}
            onChange={(value) =>
              onChange({
                ...adGroup,
                headlines: adGroup.headlines.map((item, itemIndex) =>
                  itemIndex === headlineIndex ? value : item
                ),
              })
            }
            onRemove={() =>
              onChange({
                ...adGroup,
                headlines: adGroup.headlines.filter((_, itemIndex) => itemIndex !== headlineIndex),
              })
            }
          />
        ))}
      </div>

      <Separator className="my-3" />

      {hasIssueForPath(issues, descriptionPath) ? (
        <SectionIssue message={getIssueMessage(issues, descriptionPath)} />
      ) : null}

      <div className="grid gap-2">
        {adGroup.descriptions.map((description, descriptionIndex) => (
          <LimitedRow
            key={descriptionIndex}
            label={`Description ${descriptionIndex + 1}`}
            value={description}
            maxLength={MEDIA_PLAN_LIMITS.description}
            error={getIssueMessage(issues, `${descriptionPath}.${descriptionIndex}`)}
            multiline
            onChange={(value) =>
              onChange({
                ...adGroup,
                descriptions: adGroup.descriptions.map((item, itemIndex) =>
                  itemIndex === descriptionIndex ? value : item
                ),
              })
            }
            onRemove={() =>
              onChange({
                ...adGroup,
                descriptions: adGroup.descriptions.filter((_, itemIndex) => itemIndex !== descriptionIndex),
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function SitelinksEditor({
  sitelinks,
  adGroupIndex,
  issues,
  onChange,
}: {
  sitelinks: MediaPlanSitelink[];
  adGroupIndex: number;
  issues: MediaPlanValidationIssue[];
  onChange: (sitelinks: MediaPlanSitelink[]) => void;
}) {
  const sitelinksPath = `adGroups.${adGroupIndex}.sitelinks`;
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-[#9f0019]">Sitelinks</h3>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="border-[#efd4d8] text-[#b00012] hover:bg-[#fff1f2] hover:text-[#8f0010]"
          onClick={() => onChange([...sitelinks, { title: "", url: "" }])}
        >
          <PlusIcon className="size-3" />
          Add Sitelink
        </Button>
      </div>
      {hasIssueForPath(issues, sitelinksPath) ? (
        <SectionIssue message={getIssueMessage(issues, sitelinksPath)} />
      ) : null}
      <div className="grid gap-2">
        {sitelinks.map((sitelink, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[0.7fr_1fr_auto]">
            <Input
              value={sitelink.title}
              placeholder="Sitelink title"
              aria-invalid={Boolean(getIssueMessage(issues, `${sitelinksPath}.${index}.title`))}
              className="h-8 rounded-md border-[#d7d7d7] text-sm shadow-none focus-visible:border-[#9f0019] focus-visible:ring-[#9f0019]/15 md:text-sm"
              onChange={(event) =>
                onChange(
                  sitelinks.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, title: event.target.value } : item
                  )
                )
              }
            />
            <Textarea
              value={sitelink.url}
              placeholder="https://example.com/page"
              aria-invalid={Boolean(getIssueMessage(issues, `${sitelinksPath}.${index}.url`))}
              className="min-h-8 resize-y rounded-md border-[#d7d7d7] px-3 py-1.5 text-sm leading-5 shadow-none focus-visible:border-[#9f0019] focus-visible:ring-[#9f0019]/15 md:text-sm"
              onChange={(event) =>
                onChange(
                  sitelinks.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, url: event.target.value } : item
                  )
                )
              }
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={`Remove sitelink ${index + 1}`}
              className="border-[#e5e7eb] text-[#b00012] hover:bg-[#fff1f2] hover:text-[#8f0010]"
              onClick={() => onChange(sitelinks.filter((_, itemIndex) => itemIndex !== index))}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function LimitedRow({
  label,
  value,
  maxLength,
  error,
  multiline = false,
  onChange,
  onRemove,
}: {
  label: string;
  value: string;
  maxLength: number;
  error: string | null;
  multiline?: boolean;
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  const overLimit = value.length > maxLength;
  return (
    <div className="grid gap-1">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <div className="grid gap-1">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs font-semibold uppercase text-[#667085]">{label}</Label>
            <CharacterCounter value={value} maxLength={maxLength} />
          </div>
          {multiline ? (
            <Textarea
              value={value}
              aria-invalid={Boolean(error) || overLimit}
              className="min-h-16 resize-y rounded-md border-[#d7d7d7] px-3 py-2 text-sm leading-5 shadow-none focus-visible:border-[#9f0019] focus-visible:ring-[#9f0019]/15 md:text-sm"
              onChange={(event) => onChange(event.target.value)}
            />
          ) : (
            <Input
              value={value}
              aria-invalid={Boolean(error) || overLimit}
              className="h-8 rounded-md border-[#d7d7d7] pr-12 text-sm shadow-none focus-visible:border-[#9f0019] focus-visible:ring-[#9f0019]/15 md:text-sm"
              onChange={(event) => onChange(event.target.value)}
            />
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`Remove ${label.toLowerCase()}`}
          onClick={onRemove}
          className="self-end border-[#e5e7eb] text-[#b00012] hover:bg-[#fff1f2] hover:text-[#8f0010]"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
      {error ? <p className="text-xs font-medium text-[#be123c]">{error}</p> : null}
      {!error && overLimit ? (
        <p className="text-xs font-medium text-[#be123c]">
          {label} must be {maxLength} characters or fewer.
        </p>
      ) : null}
    </div>
  );
}

function CharacterCounter({ value, maxLength }: { value: string; maxLength: number }) {
  const overLimit = value.length > maxLength;
  return (
    <span className={overLimit ? "text-xs font-semibold text-[#be123c]" : "text-xs text-[#667085]"}>
      {value.length}/{maxLength}
    </span>
  );
}

function SectionIssue({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <Badge className="mb-3 bg-[#fff1f2] text-[#be123c] hover:bg-[#fff1f2]">
      {message}
    </Badge>
  );
}

function splitList(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
