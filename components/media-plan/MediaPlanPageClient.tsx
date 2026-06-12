"use client";

import { useMemo, useState } from "react";

import { MediaPlanEditor } from "@/components/media-plan/MediaPlanEditor";
import { MediaPlanForm } from "@/components/media-plan/MediaPlanForm";
import { MediaPlanStatusBar } from "@/components/media-plan/MediaPlanStatus";
import { ReportShell } from "@/components/reporting/report-shell";
import {
  DEFAULT_MEDIA_PLAN_FORM,
  MediaPlan,
  MediaPlanApproveResponse,
  MediaPlanApproveSuccessResponse,
  MediaPlanCreateCampaignResponse,
  MediaPlanCreateCampaignSuccessResponse,
  MediaPlanFormData,
  MediaPlanGenerateResponse,
  MediaPlanStatus,
  SUPPORTED_CAMPAIGN_TYPE,
} from "@/lib/media-plan/schema";
import {
  MediaPlanValidationIssue,
  validateMediaPlan,
  validateMediaPlanForm,
} from "@/lib/media-plan/validation";

export function MediaPlanPageClient() {
  const [formData, setFormData] = useState<MediaPlanFormData>(DEFAULT_MEDIA_PLAN_FORM);
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [generateAttempted, setGenerateAttempted] = useState(false);
  const [edited, setEdited] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingToNotion, setSavingToNotion] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaignErrorLinks, setCampaignErrorLinks] = useState<string[]>([]);
  const [serverIssues, setServerIssues] = useState<MediaPlanValidationIssue[]>([]);
  const [openAiMeta, setOpenAiMeta] = useState<{ responseId: string | null; model: string | null } | null>(null);
  const [clientRequestId, setClientRequestId] = useState<string | null>(null);
  const [approvalResult, setApprovalResult] = useState<MediaPlanApproveSuccessResponse | null>(null);
  const [campaignResult, setCampaignResult] = useState<MediaPlanCreateCampaignSuccessResponse | null>(null);

  const formValidation = useMemo(() => validateMediaPlanForm(formData), [formData]);
  const planValidation = useMemo(() => validateMediaPlan(plan), [plan]);
  const visibleFormIssues = useMemo(
    () => resolveVisibleFormIssues(formValidation.issues, generateAttempted, formData),
    [formData, formValidation.issues, generateAttempted]
  );
  const visiblePlanIssues = plan ? planValidation.issues : [];
  const visibleIssues = [...visibleFormIssues, ...visiblePlanIssues, ...serverIssues];
  const failed = Boolean(error) && serverIssues.length === 0;
  const ready = Boolean(plan) && formValidation.valid && planValidation.valid && serverIssues.length === 0;
  const canApprove = ready && !generating && !savingToNotion && !approvalResult;
  const currentStatus = resolveStatus({
    generated: Boolean(plan),
    generating,
    savingToNotion,
    savedToNotion: Boolean(approvalResult),
    creatingCampaign,
    createdCampaign: Boolean(campaignResult),
    failed,
    edited,
    hasValidationError: visibleIssues.length > 0,
    ready,
  });
  const activeStatuses = resolveActiveStatuses({
    generated: Boolean(plan),
    generating,
    savingToNotion,
    savedToNotion: Boolean(approvalResult),
    creatingCampaign,
    createdCampaign: Boolean(campaignResult),
    failed,
    edited,
    hasValidationError: visibleIssues.length > 0,
    ready,
  });

  async function handleGenerate() {
    setGenerateAttempted(true);
    setError(null);
    setServerIssues([]);
    setOpenAiMeta(null);
    setApprovalResult(null);
    setCampaignResult(null);
    setCampaignErrorLinks([]);

    if (!formValidation.valid) {
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch("/api/media-plan/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });
      const payload = (await response.json().catch(() => null)) as MediaPlanGenerateResponse | null;

      if (!payload) {
        throw new Error("Media plan generation returned an unreadable response.");
      }

      if (!payload.success) {
        setServerIssues(payload.issues ?? []);
        throw new Error(payload.error);
      }

      setPlan(payload.plan);
      setOpenAiMeta(payload.openAi);
      setClientRequestId(createClientRequestId());
      setEdited(false);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Unable to generate media plan.");
    } finally {
      setGenerating(false);
    }
  }

  function handlePlanChange(nextPlan: MediaPlan) {
    setPlan(nextPlan);
    setEdited(true);
    if (approvalResult) {
      setApprovalResult(null);
      setCampaignResult(null);
      setClientRequestId(createClientRequestId());
    }
    setError(null);
    setCampaignErrorLinks([]);
    setServerIssues([]);
  }

  async function handleApprove() {
    setGenerateAttempted(true);
    setError(null);
    setServerIssues([]);

    if (!plan || !formValidation.valid || !planValidation.valid) {
      return;
    }

    const requestId = clientRequestId || createClientRequestId();
    setClientRequestId(requestId);
    setSavingToNotion(true);
    try {
      const response = await fetch("/api/media-plan/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mediaPlan: plan,
          googleCid: formData.googleCid,
          source: "media-plan",
          clientRequestId: requestId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as MediaPlanApproveResponse | null;

      if (!payload) {
        throw new Error("Notion approval returned an unreadable response.");
      }
      if (!payload.success) {
        setServerIssues(payload.issues ?? []);
        throw new Error(payload.error);
      }

      setApprovalResult(payload);
      setCampaignResult(null);
      setEdited(false);
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Unable to save media plan to Notion.");
    } finally {
      setSavingToNotion(false);
    }
  }

  async function handleCreateCampaign() {
    if (!approvalResult) {
      return;
    }

    setError(null);
    setCampaignErrorLinks([]);
    setCreatingCampaign(true);
    try {
      const response = await fetch("/api/media-plan/create-campaign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batchId: approvalResult.batchId,
          googleCid: formData.googleCid,
        }),
      });
      const payload = (await response.json().catch(() => null)) as MediaPlanCreateCampaignResponse | null;

      if (!payload) {
        throw new Error("Google Ads creation returned an unreadable response.");
      }
      if (!payload.success) {
        setCampaignErrorLinks(payload.notionPageUrls ?? []);
        throw new Error(payload.error);
      }

      setCampaignResult(payload);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Unable to create paused Google Ads campaign."
      );
    } finally {
      setCreatingCampaign(false);
    }
  }

  return (
    <ReportShell
      title="Media Plan"
      dateLabel={openAiMeta?.model ? `Google Search - ${openAiMeta.model}` : "Google Search"}
      reportReady={!generating && !savingToNotion && !creatingCampaign}
      headerBottomControl={
        <MediaPlanStatusBar
          currentStatus={currentStatus}
          issueCount={visibleIssues.length}
          activeStatuses={activeStatuses}
        />
      }
    >
      <div className="space-y-5">
        <MediaPlanForm
          value={formData}
          issues={visibleFormIssues}
          generateDisabled={savingToNotion}
          generating={generating}
          buttonLabel={plan ? "Regenerate Media Plan" : "Generate Media Plan"}
          onChange={setFormData}
          onGenerate={handleGenerate}
        />

        {error ? (
          <section className="rounded-2xl border border-[#fecdd3] bg-[#fff1f2] p-4 text-[#9f1239] shadow-sm">
            <p className="text-sm font-semibold">{error}</p>
            {serverIssues.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {serverIssues.map((issue) => (
                  <li key={`${issue.path}:${issue.message}`}>
                    <span className="font-medium">{issue.path}:</span> {issue.message}
                  </li>
                ))}
              </ul>
            ) : null}
            {campaignErrorLinks.length > 0 ? (
              <div className="mt-2 grid gap-1 text-sm">
                {campaignErrorLinks.map((url, index) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline underline-offset-4"
                  >
                    Notion row {index + 1}
                  </a>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {approvalResult ? <ApprovalSummary result={approvalResult} /> : null}
        {campaignResult ? <CampaignSummary result={campaignResult} /> : null}

        <MediaPlanEditor
          plan={plan}
          issues={[...visiblePlanIssues, ...serverIssues]}
          canApprove={canApprove}
          savingToNotion={savingToNotion}
          approvalResult={approvalResult}
          creatingCampaign={creatingCampaign}
          campaignResult={campaignResult}
          onChange={handlePlanChange}
          onApprove={handleApprove}
          onCreateCampaign={handleCreateCampaign}
        />
      </div>
    </ReportShell>
  );
}

function resolveActiveStatuses(input: {
  generated: boolean;
  generating: boolean;
  savingToNotion: boolean;
  savedToNotion: boolean;
  creatingCampaign: boolean;
  createdCampaign: boolean;
  failed: boolean;
  edited: boolean;
  hasValidationError: boolean;
  ready: boolean;
}): MediaPlanStatus[] {
  if (input.failed) {
    return ["Failed"];
  }
  if (input.createdCampaign) {
    return ["Generated", "Saved to Notion", "Created Paused"];
  }
  if (input.creatingCampaign) {
    return ["Generated", "Saved to Notion", "Creating Google Ads Campaign"];
  }
  if (input.savedToNotion) {
    return ["Generated", "Ready for Approval", "Saved to Notion"];
  }
  if (input.savingToNotion) {
    return ["Generated", "Ready for Approval", "Saving to Notion"];
  }
  if (input.generating) {
    return input.generated ? ["Generated", "Generating"] : ["Draft", "Generating"];
  }

  if (!input.generated) {
    return ["Draft"];
  }

  if (input.hasValidationError) {
    return ["Generated", ...(input.edited ? (["Edited"] as MediaPlanStatus[]) : []), "Validation Error"];
  }

  return [
    "Generated",
    ...(input.edited ? (["Edited"] as MediaPlanStatus[]) : []),
    ...(input.ready ? (["Ready for Approval"] as MediaPlanStatus[]) : []),
  ];
}

function resolveVisibleFormIssues(
  issues: MediaPlanValidationIssue[],
  generateAttempted: boolean,
  formData: MediaPlanFormData
): MediaPlanValidationIssue[] {
  if (generateAttempted) {
    return issues;
  }

  return issues.filter(
    (issue) => issue.path === "campaignType" && formData.campaignType.trim() !== SUPPORTED_CAMPAIGN_TYPE
  );
}

function resolveStatus(input: {
  generated: boolean;
  generating: boolean;
  savingToNotion: boolean;
  savedToNotion: boolean;
  creatingCampaign: boolean;
  createdCampaign: boolean;
  failed: boolean;
  edited: boolean;
  hasValidationError: boolean;
  ready: boolean;
}): MediaPlanStatus {
  if (input.failed) {
    return "Failed";
  }
  if (input.createdCampaign) {
    return "Created Paused";
  }
  if (input.creatingCampaign) {
    return "Creating Google Ads Campaign";
  }
  if (input.savedToNotion) {
    return "Saved to Notion";
  }
  if (input.savingToNotion) {
    return "Saving to Notion";
  }
  if (input.generating) {
    return "Generating";
  }
  if (!input.generated) {
    return "Draft";
  }
  if (input.hasValidationError) {
    return "Validation Error";
  }
  if (input.ready) {
    return "Ready for Approval";
  }
  if (input.edited) {
    return "Edited";
  }
  return "Generated";
}

function CampaignSummary({ result }: { result: MediaPlanCreateCampaignSuccessResponse }) {
  return (
    <section className="rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] p-4 text-[#1d4ed8] shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">Created Paused</p>
        <p className="text-sm">
          Campaign ID: <span className="font-semibold">{result.campaignId}</span>
        </p>
        <p className="text-sm">
          Notion batch ID: <span className="font-semibold">{result.batchId}</span>
        </p>
      </div>
      <a
        href={result.googleAdsReviewLink}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex text-sm font-semibold underline underline-offset-4"
      >
        Open Google Ads review
      </a>
    </section>
  );
}

function createClientRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `media-plan-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ApprovalSummary({ result }: { result: MediaPlanApproveSuccessResponse }) {
  return (
    <section className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-[#166534] shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">
          Status: Ready for Setup{result.duplicate ? " (existing batch reused)" : ""}
        </p>
        <p className="text-sm">
          Batch ID: <span className="font-semibold">{result.batchId}</span>
        </p>
        <p className="text-sm">Created row count: {result.createdRowCount}</p>
      </div>
      {result.notionPageUrls.length > 0 ? (
        <div className="mt-3 grid gap-1 text-sm">
          {result.notionPageUrls.map((url, index) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              Notion row {index + 1}
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}
