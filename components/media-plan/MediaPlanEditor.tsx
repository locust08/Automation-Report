"use client";

import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";

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
  onChange: (nextPlan: MediaPlan) => void;
  onApprove: () => void;
  onCreateCampaign: () => void;
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
  onChange,
  onApprove,
  onCreateCampaign,
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
          adGroupName: `New Ad Group ${currentPlan.adGroups.length + 1}`,
          intentType: "New intent",
          keywords: [{ text: "new keyword", matchType: "BROAD" }],
          displayPath1: "services",
          displayPath2: "search",
          headlines: ["Headline One", "Headline Two", "Headline Three"],
          descriptions: ["Description one for this ad group.", "Description two for this ad group."],
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
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Panel title="Campaign Summary">
          <div className="grid gap-3">
            <EditableField
              label="Batch Preview ID"
              value={currentPlan.batchPreviewId}
              error={getIssueMessage(issues, "batchPreviewId")}
              onChange={(value) => updatePlan({ ...currentPlan, batchPreviewId: value })}
            />
            <EditableField
              label="Campaign Name"
              value={currentPlan.campaign.campaignName}
              error={getIssueMessage(issues, "campaign.campaignName")}
              onChange={(value) => updateCampaign((campaign) => ({ ...campaign, campaignName: value }))}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <EditableField
                label="Brand / Client Name"
                value={currentPlan.campaign.brandOrClientName}
                error={getIssueMessage(issues, "campaign.brandOrClientName")}
                onChange={(value) => updateCampaign((campaign) => ({ ...campaign, brandOrClientName: value }))}
              />
              <EditableField
                label="Business Name"
                value={currentPlan.campaign.businessName}
                error={getIssueMessage(issues, "campaign.businessName")}
                onChange={(value) => updateCampaign((campaign) => ({ ...campaign, businessName: value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <EditableField
                label="Website URL"
                value={currentPlan.campaign.websiteUrl}
                error={getIssueMessage(issues, "campaign.websiteUrl")}
                onChange={(value) => updateCampaign((campaign) => ({ ...campaign, websiteUrl: value }))}
              />
              <EditableField
                label="Final URL"
                value={currentPlan.campaign.finalUrl}
                error={getIssueMessage(issues, "campaign.finalUrl")}
                onChange={(value) => updateCampaign((campaign) => ({ ...campaign, finalUrl: value }))}
              />
            </div>
          </div>
        </Panel>

        <Panel title="Campaign Settings">
          <div className="grid gap-3 sm:grid-cols-2">
            <EditableField
              label="Campaign Type"
              value={currentPlan.campaign.campaignType}
              error={getIssueMessage(issues, "campaign.campaignType")}
              onChange={(value) =>
                updateCampaign((campaign) => ({ ...campaign, campaignType: value as "Search" }))
              }
            />
            <EditableField
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
            <EditableField
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
            <EditableField
              label="Start Date"
              value={currentPlan.campaign.startDate}
              error={getIssueMessage(issues, "campaign.startDate")}
              onChange={(value) => updateCampaign((campaign) => ({ ...campaign, startDate: value }))}
            />
            <EditableField
              label="Average Daily Budget"
              value={String(currentPlan.campaign.averageDailyBudget)}
              error={getIssueMessage(issues, "campaign.averageDailyBudget")}
              onChange={(value) =>
                updateCampaign((campaign) => ({ ...campaign, averageDailyBudget: Number(value) }))
              }
            />
            <EditableField
              label="Target CPA"
              value={currentPlan.campaign.targetCPA === null ? "" : String(currentPlan.campaign.targetCPA)}
              error={getIssueMessage(issues, "campaign.targetCPA")}
              onChange={(value) =>
                updateCampaign((campaign) => ({
                  ...campaign,
                  targetCPA: value.trim() ? Number(value) : null,
                }))
              }
            />
            <EditableField
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
            <EditableField
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
            <EditableField
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
            <EditableField
              label="Network Notes"
              value={currentPlan.campaign.networkNotes}
              error={getIssueMessage(issues, "campaign.networkNotes")}
              multiline
              onChange={(value) => updateCampaign((campaign) => ({ ...campaign, networkNotes: value }))}
            />
          </div>
        </Panel>
      </div>

      <Panel
        title="Ad Groups"
        action={
          <Button type="button" variant="outline" size="sm" onClick={addAdGroup}>
            <PlusIcon className="size-4" />
            Add Ad Group
          </Button>
        }
      >
        <div className="space-y-4">
          {currentPlan.adGroups.map((adGroup, adGroupIndex) => (
            <div
              key={`${adGroup.adGroupName}:${adGroupIndex}`}
              className="rounded-xl border border-[#e5e7eb] bg-[#fbfbfb] p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="grid flex-1 gap-3 sm:grid-cols-2">
                  <EditableField
                    label={`Ad Group ${adGroupIndex + 1} Name`}
                    value={adGroup.adGroupName}
                    error={getIssueMessage(issues, `adGroups.${adGroupIndex}.adGroupName`)}
                    onChange={(value) =>
                      updateAdGroup(adGroupIndex, (current) => ({ ...current, adGroupName: value }))
                    }
                  />
                  <EditableField
                    label="Intent Type"
                    value={adGroup.intentType}
                    error={getIssueMessage(issues, `adGroups.${adGroupIndex}.intentType`)}
                    onChange={(value) =>
                      updateAdGroup(adGroupIndex, (current) => ({ ...current, intentType: value }))
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Remove ad group"
                  aria-label="Remove ad group"
                  onClick={() => removeAdGroup(adGroupIndex)}
                  disabled={currentPlan.adGroups.length === 1}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>

              <Separator className="my-4" />

              <div className="grid gap-4 xl:grid-cols-2">
                <KeywordsEditor
                  adGroup={adGroup}
                  adGroupIndex={adGroupIndex}
                  issues={issues}
                  onChange={(keywords) =>
                    updateAdGroup(adGroupIndex, (current) => ({ ...current, keywords }))
                  }
                />

                <DisplayPathsEditor
                  adGroup={adGroup}
                  adGroupIndex={adGroupIndex}
                  issues={issues}
                  onChange={(nextAdGroup) => updateAdGroup(adGroupIndex, () => nextAdGroup)}
                />

                <ResponsiveSearchAdsEditor
                  adGroup={adGroup}
                  adGroupIndex={adGroupIndex}
                  issues={issues}
                  onChange={(nextAdGroup) => updateAdGroup(adGroupIndex, () => nextAdGroup)}
                />

                <SitelinksEditor
                  sitelinks={adGroup.sitelinks}
                  adGroupIndex={adGroupIndex}
                  issues={issues}
                  onChange={(sitelinks) =>
                    updateAdGroup(adGroupIndex, (current) => ({ ...current, sitelinks }))
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Setup Notes">
        <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr_0.8fr]">
          <EditableField
            label="Strategy"
            value={currentPlan.planningNotes.strategy}
            error={getIssueMessage(issues, "planningNotes.strategy")}
            multiline
            onChange={(value) =>
              updatePlan({
                ...currentPlan,
                planningNotes: { ...currentPlan.planningNotes, strategy: value },
              })
            }
          />
          <EditableArray
            title="Assumptions"
            values={currentPlan.planningNotes.assumptions}
            issuePath="planningNotes.assumptions"
            issues={issues}
            onChange={(assumptions) =>
              updatePlan({
                ...currentPlan,
                planningNotes: { ...currentPlan.planningNotes, assumptions },
              })
            }
          />
          <EditableArray
            title="Warnings"
            values={currentPlan.planningNotes.warnings}
            issuePath="planningNotes.warnings"
            issues={issues}
            onChange={(warnings) =>
              updatePlan({
                ...currentPlan,
                planningNotes: { ...currentPlan.planningNotes, warnings },
              })
            }
          />
        </div>
      </Panel>

      <div className="sticky bottom-0 z-10 rounded-2xl border border-[#dedede] bg-white/95 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#344054]">
              {campaignResult
                ? "Created Paused in Google Ads."
                : approvalResult
                  ? "Saved to Notion and ready for setup."
                  : "Approve the final edited Search plan."}
            </p>
            <p className="text-sm text-[#667085]">
              {campaignResult
                ? `Campaign ${campaignResult.campaignId} is paused and ready for review.`
                : approvalResult
                ? `Batch ${approvalResult.batchId} created ${approvalResult.createdRowCount} Notion rows.`
                : "This saves one row per ad group before Google Ads campaign creation."}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              className="h-11 bg-[#9f0019] text-white hover:bg-[#820015]"
              disabled={!canApprove || savingToNotion || Boolean(approvalResult)}
              title={canApprove ? "Save approved media plan to Notion." : "Fix validation issues before approval."}
              onClick={onApprove}
            >
              {savingToNotion ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {savingToNotion ? "Saving to Notion" : "Approve & Save to Notion"}
            </Button>
            {approvalResult ? (
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={creatingCampaign || Boolean(campaignResult)}
                title={campaignResult ? "Campaign already created." : "Create a paused Google Search campaign."}
                onClick={onCreateCampaign}
              >
                {creatingCampaign ? <Loader2Icon className="size-4 animate-spin" /> : null}
                {creatingCampaign ? "Creating Google Ads Campaign" : "Create Paused Campaign in Google Ads"}
              </Button>
            ) : null}
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

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#dedede] bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-[#1f2937]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function EditableField({
  label,
  value,
  error,
  maxLength,
  multiline = false,
  onChange,
}: {
  label: string;
  value: string;
  error?: string | null;
  maxLength?: number;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const invalid = Boolean(error) || (maxLength ? value.length > maxLength : false);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-sm font-semibold text-[#344054]">{label}</Label>
        {maxLength ? <CharacterCounter value={value} maxLength={maxLength} /> : null}
      </div>
      {multiline ? (
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          className="min-h-24 resize-y"
        />
      ) : (
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
        />
      )}
      {error ? <p className="text-xs font-medium text-[#be123c]">{error}</p> : null}
      {!error && maxLength && value.length > maxLength ? (
        <p className="text-xs font-medium text-[#be123c]">
          {label} must be {maxLength} characters or fewer.
        </p>
      ) : null}
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
        <h3 className="text-sm font-semibold text-[#344054]">Keywords</h3>
        <Button
          type="button"
          variant="outline"
          size="xs"
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
              size="icon"
              aria-label={`Remove keyword ${keywordIndex + 1}`}
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
        <h3 className="text-sm font-semibold text-[#344054]">Responsive Search Ads</h3>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onChange({ ...adGroup, headlines: [...adGroup.headlines, ""] })}
          >
            <PlusIcon className="size-3" />
            Headline
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
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

function DisplayPathsEditor({
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
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-3">
      <h3 className="mb-3 text-sm font-semibold text-[#344054]">Display Paths</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <EditableField
          label="Display Path 1"
          value={adGroup.displayPath1}
          maxLength={MEDIA_PLAN_LIMITS.displayPath}
          error={getIssueMessage(issues, `adGroups.${adGroupIndex}.displayPath1`)}
          onChange={(value) => onChange({ ...adGroup, displayPath1: value })}
        />
        <EditableField
          label="Display Path 2"
          value={adGroup.displayPath2}
          maxLength={MEDIA_PLAN_LIMITS.displayPath}
          error={getIssueMessage(issues, `adGroups.${adGroupIndex}.displayPath2`)}
          onChange={(value) => onChange({ ...adGroup, displayPath2: value })}
        />
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
        <h3 className="text-sm font-semibold text-[#344054]">Sitelinks</h3>
        <Button
          type="button"
          variant="outline"
          size="xs"
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
              onChange={(event) =>
                onChange(
                  sitelinks.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, title: event.target.value } : item
                  )
                )
              }
            />
            <Input
              value={sitelink.url}
              placeholder="https://example.com/page"
              aria-invalid={Boolean(getIssueMessage(issues, `${sitelinksPath}.${index}.url`))}
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
              size="icon"
              aria-label={`Remove sitelink ${index + 1}`}
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

function EditableArray({
  title,
  values,
  issuePath,
  issues,
  onChange,
}: {
  title: string;
  values: string[];
  issuePath: string;
  issues: MediaPlanValidationIssue[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[#344054]">{title}</h3>
        <Button type="button" variant="outline" size="xs" onClick={() => onChange([...values, ""])}>
          <PlusIcon className="size-3" />
          Add
        </Button>
      </div>
      {hasIssueForPath(issues, issuePath) ? (
        <SectionIssue message={getIssueMessage(issues, issuePath)} />
      ) : null}
      <div className="grid gap-2">
        {values.map((value, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Input
              value={value}
              onChange={(event) =>
                onChange(values.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
              }
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`Remove ${title.toLowerCase()} ${index + 1}`}
              onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
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
  onChange,
  onRemove,
}: {
  label: string;
  value: string;
  maxLength: number;
  error: string | null;
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
          <Input
            value={value}
            aria-invalid={Boolean(error) || overLimit}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Remove ${label.toLowerCase()}`}
          onClick={onRemove}
          className="self-end"
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
