"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MediaPlanEditor } from "@/components/media-plan/MediaPlanEditor";
import { MediaPlanForm } from "@/components/media-plan/MediaPlanForm";
import { MediaPlanStatusBar } from "@/components/media-plan/MediaPlanStatus";
import { ReportShell } from "@/components/reporting/report-shell";
import {
  DEFAULT_MEDIA_PLAN_LANGUAGE,
  DEFAULT_MEDIA_PLAN_FORM,
  DEFAULT_NETWORK,
  MediaPlan,
  MediaPlanApproveAndCreateResponse,
  MediaPlanApproveSuccessResponse,
  MediaPlanCreateCampaignSuccessResponse,
  MediaPlanFormData,
  MediaPlanGenerateResponse,
  MediaPlanLanguage,
  MediaPlanStatus,
  SUPPORTED_CAMPAIGN_TYPE,
} from "@/lib/media-plan/schema";
import {
  MediaPlanValidationIssue,
  validateMediaPlan,
  validateMediaPlanForm,
} from "@/lib/media-plan/validation";

const MEDIA_PLAN_GENERATION_POLL_INTERVAL_MS = 2_000;
const MEDIA_PLAN_HISTORY_LIMIT = 50;
type MediaPlanSource = "generated" | "mockup" | null;
type MediaPlanHistory = {
  past: MediaPlan[];
  future: MediaPlan[];
};

const EMPTY_MEDIA_PLAN_HISTORY: MediaPlanHistory = {
  past: [],
  future: [],
};

export function MediaPlanPageClient() {
  const [formData, setFormData] = useState<MediaPlanFormData>(DEFAULT_MEDIA_PLAN_FORM);
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [planSource, setPlanSource] = useState<MediaPlanSource>(null);
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
  const [planHistory, setPlanHistory] = useState<MediaPlanHistory>(EMPTY_MEDIA_PLAN_HISTORY);
  const planRef = useRef<MediaPlan | null>(null);

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
  const canUseHistory = Boolean(plan) && !generating && !savingToNotion && !creatingCampaign;
  const canUndo = canUseHistory && planHistory.past.length > 0;
  const canRedo = canUseHistory && planHistory.future.length > 0;

  function resetPlanHistory() {
    setPlanHistory(EMPTY_MEDIA_PLAN_HISTORY);
  }

  const setCurrentPlan = useCallback((nextPlan: MediaPlan | null) => {
    planRef.current = nextPlan;
    setPlan(nextPlan);
  }, []);

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

      const completedPayload = await resolveGeneratedMediaPlan(payload, formData);

      setCurrentPlan(completedPayload.plan);
      setPlanSource("generated");
      setOpenAiMeta(completedPayload.openAi);
      setClientRequestId(createClientRequestId());
      setEdited(false);
      resetPlanHistory();
    } catch (generateError) {
      setServerIssues(readMediaPlanIssues(generateError));
      setError(generateError instanceof Error ? generateError.message : "Unable to generate media plan.");
    } finally {
      setGenerating(false);
    }
  }

  function handleMockup() {
    setGenerateAttempted(false);
    setError(null);
    setServerIssues([]);
    setOpenAiMeta(null);
    setApprovalResult(null);
    setCampaignResult(null);
    setCampaignErrorLinks([]);

    setCurrentPlan(buildMockupMediaPlan(formData));
    setPlanSource("mockup");
    setClientRequestId(createClientRequestId());
    setEdited(false);
    resetPlanHistory();
  }

  function handlePlanChange(nextPlan: MediaPlan) {
    const previousPlan = planRef.current;
    if (previousPlan) {
      setPlanHistory((currentHistory) => ({
        past: [...currentHistory.past, previousPlan].slice(-MEDIA_PLAN_HISTORY_LIMIT),
        future: [],
      }));
    }
    setCurrentPlan(nextPlan);
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

  const handleUndo = useCallback(() => {
    const currentPlan = planRef.current;
    if (!currentPlan || generating || savingToNotion || creatingCampaign) {
      return;
    }

    const previousPlan = planHistory.past.at(-1);
    if (!previousPlan) {
      return;
    }

    const remainingPast = planHistory.past.slice(0, -1);
    setCurrentPlan(previousPlan);
    setPlanHistory({
      past: remainingPast,
      future: [currentPlan, ...planHistory.future].slice(0, MEDIA_PLAN_HISTORY_LIMIT),
    });
    setEdited(remainingPast.length > 0);
    setError(null);
    setCampaignErrorLinks([]);
    setServerIssues([]);
  }, [creatingCampaign, generating, planHistory.future, planHistory.past, savingToNotion, setCurrentPlan]);

  const handleRedo = useCallback(() => {
    const currentPlan = planRef.current;
    if (!currentPlan || generating || savingToNotion || creatingCampaign) {
      return;
    }

    const nextPlan = planHistory.future[0];
    if (!nextPlan) {
      return;
    }

    setCurrentPlan(nextPlan);
    setPlanHistory({
      past: [...planHistory.past, currentPlan].slice(-MEDIA_PLAN_HISTORY_LIMIT),
      future: planHistory.future.slice(1),
    });
    setEdited(true);
    setError(null);
    setCampaignErrorLinks([]);
    setServerIssues([]);
  }, [creatingCampaign, generating, planHistory.future, planHistory.past, savingToNotion, setCurrentPlan]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        !plan ||
        generating ||
        savingToNotion ||
        creatingCampaign
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const requestsUndo = key === "z" && !event.shiftKey;
      const requestsRedo = key === "y" || (key === "z" && event.shiftKey);

      if (requestsUndo && planHistory.past.length > 0) {
        event.preventDefault();
        handleUndo();
      }
      if (requestsRedo && planHistory.future.length > 0) {
        event.preventDefault();
        handleRedo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    creatingCampaign,
    handleRedo,
    handleUndo,
    plan,
    planHistory.future.length,
    planHistory.past.length,
    generating,
    savingToNotion,
  ]);

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
    setCreatingCampaign(true);
    try {
      const response = await fetch("/api/media-plan/approve-and-create", {
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
      const payload = (await response.json().catch(() => null)) as MediaPlanApproveAndCreateResponse | null;

      if (!payload) {
        throw new Error("Media plan approval returned an unreadable response.");
      }
      if (!payload.success) {
        setServerIssues(payload.issues ?? []);
        setCampaignErrorLinks(payload.notionPageUrls ?? []);
        throw new Error(payload.error);
      }

      setApprovalResult({
        success: true,
        batchId: payload.batchId,
        notionPageUrls: payload.notionPageUrls,
        createdRowCount: payload.createdRowCount,
        status: payload.approvalStatus,
        duplicate: payload.duplicateApproval,
      });
      setCampaignResult({
        success: true,
        source: payload.source,
        batchId: payload.batchId,
        customerId: payload.customerId,
        campaignId: payload.campaignId,
        campaignResourceName: payload.campaignResourceName,
        campaignStatus: payload.campaignStatus,
        createdAdGroups: payload.createdAdGroups,
        createdAds: payload.createdAds,
        googleAdsReviewLink: payload.googleAdsReviewLink,
      });
      setEdited(false);
      resetPlanHistory();
    } catch (approveError) {
      setError(
        approveError instanceof Error
          ? approveError.message
          : "Unable to save media plan to Notion and create paused campaign."
      );
    } finally {
      setSavingToNotion(false);
      setCreatingCampaign(false);
    }
  }

  return (
    <ReportShell
      title="Media Plan"
      dateLabel={
        planSource === "mockup"
          ? "Google Search - Manual Mockup"
          : openAiMeta?.model
            ? `Google Search - ${openAiMeta.model}`
            : "Google Search"
      }
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
          buttonLabel={resolveGenerateButtonLabel(planSource, Boolean(plan))}
          onChange={setFormData}
          onGenerate={handleGenerate}
          onMockup={handleMockup}
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
          canUndo={canUndo}
          canRedo={canRedo}
          onChange={handlePlanChange}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onApprove={handleApprove}
        />
      </div>
    </ReportShell>
  );
}

function buildMockupMediaPlan(formData: MediaPlanFormData): MediaPlan {
  const websiteUrl = formData.websiteUrl.trim();
  const language = normalizeMockupLanguage(formData.language);

  return {
    batchPreviewId: `MP-MOCKUP-${Date.now()}`,
    campaign: {
      campaignName: "",
      brandOrClientName: "",
      businessName: "",
      campaignObjective: "Leads",
      campaignType: "Search",
      biddingStrategy: "Conversions",
      websiteUrl,
      finalUrl: websiteUrl,
      startDate: getTodayDate(),
      averageDailyBudget: calculateAverageDailyBudget(formData.adBudget),
      targetCPA: null,
      network: [DEFAULT_NETWORK],
      networkNotes: "Google Search only.",
      targetLocation: [formData.targetLocation.trim()],
      language: [language],
    },
    adGroups: [
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
    planningNotes: {
      strategy: formData.specialRemarks.trim(),
      assumptions: [],
      warnings: [],
    },
  };
}

function calculateAverageDailyBudget(adBudget: string): number {
  const amount = Number(adBudget.replace(/,/g, "").trim());
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  return Math.round((amount / 30) * 100) / 100;
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeMockupLanguage(value: string): MediaPlanLanguage {
  if (value === "English" || value === "Malay" || value === "Chinese") {
    return value;
  }
  return DEFAULT_MEDIA_PLAN_LANGUAGE;
}

function resolveGenerateButtonLabel(planSource: MediaPlanSource, hasPlan: boolean): string {
  if (!hasPlan || planSource === "mockup") {
    return "Generate Media Plan";
  }
  return "Regenerate Media Plan";
}

async function resolveGeneratedMediaPlan(
  payload: MediaPlanGenerateResponse,
  formData: MediaPlanFormData
): Promise<Extract<MediaPlanGenerateResponse, { success: true; status: "completed" }>> {
  if (!payload.success) {
    throwMediaPlanResponseError(payload);
  }

  if (payload.status === "completed") {
    return payload;
  }

  let current = payload;
  while (true) {
    await sleep(MEDIA_PLAN_GENERATION_POLL_INTERVAL_MS);
    const params = new URLSearchParams({
      websiteUrl: formData.websiteUrl,
      adBudget: formData.adBudget,
      googleCid: formData.googleCid,
      campaignType: formData.campaignType,
      targetLocation: formData.targetLocation,
      language: formData.language,
    });
    const response = await fetch(`/api/media-plan/generate/${encodeURIComponent(current.openAi.responseId)}?${params}`, {
      cache: "no-store",
    });
    const nextPayload = (await response.json().catch(() => null)) as MediaPlanGenerateResponse | null;

    if (!nextPayload) {
      throw new Error("Media plan generation returned an unreadable polling response.");
    }
    if (!nextPayload.success) {
      if (isRetryableMediaPlanPollingError(nextPayload.error)) {
        continue;
      }
      throwMediaPlanResponseError(nextPayload);
    }
    if (nextPayload.status === "completed") {
      return nextPayload;
    }

    current = nextPayload;
  }
}

function throwMediaPlanResponseError(payload: Extract<MediaPlanGenerateResponse, { success: false }>): never {
  const error = new Error(payload.error) as Error & {
    issues?: MediaPlanValidationIssue[];
  };
  error.issues = payload.issues;
  throw error;
}

function isRetryableMediaPlanPollingError(message: string): boolean {
  return message.toLowerCase().includes("timed out; still no valid response");
}

function readMediaPlanIssues(error: unknown): MediaPlanValidationIssue[] {
  if (!error || typeof error !== "object" || !("issues" in error) || !Array.isArray(error.issues)) {
    return [];
  }

  return error.issues.filter(
    (issue): issue is MediaPlanValidationIssue =>
      Boolean(issue) &&
      typeof issue === "object" &&
      "path" in issue &&
      typeof issue.path === "string" &&
      "message" in issue &&
      typeof issue.message === "string"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  if (input.creatingCampaign && input.savingToNotion) {
    return ["Generated", "Saving to Notion", "Creating Google Ads Campaign"];
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
