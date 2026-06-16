import {
  MediaPlanOperation,
  MediaPlanOperationProgress,
  MediaPlanOperationStatus,
  MediaPlanProgressStep,
  MediaPlanProgressStepStatus,
} from "@/lib/media-plan/schema";

export const GENERATE_PROGRESS_STEPS = [
  { id: "reading_brief", label: "Reading website brief" },
  { id: "analysing_landing_page", label: "Analysing landing page" },
  { id: "researching_keywords", label: "Researching keywords" },
  { id: "building_ad_groups", label: "Building ad groups" },
  { id: "writing_ad_copy", label: "Writing ad copy" },
  { id: "validating_media_plan", label: "Validating media plan" },
] as const;

export const APPROVE_CREATE_PROGRESS_STEPS = [
  { id: "validating_media_plan", label: "Validating media plan" },
  { id: "uploading_assets", label: "Uploading assets to Notion" },
  { id: "creating_notion_rows", label: "Creating Notion rows" },
  { id: "connecting_google_ads", label: "Connecting to Google Ads" },
  { id: "creating_paused_campaign", label: "Creating paused campaign" },
  { id: "returning_review_link", label: "Returning Google Ads review link" },
] as const;

const DEFAULT_GENERATE_ESTIMATE_MS = 180_000;
const DEFAULT_APPROVE_ESTIMATE_MS = 120_000;

export function createMediaPlanProgress(input: {
  operation: MediaPlanOperation;
  title: string;
  status: MediaPlanOperationStatus;
  statusLabel: string;
  startedAt: string;
  activeStepId?: string;
  completedStepIds?: string[];
  failedStepId?: string;
  percent?: number;
  estimateMs?: number;
  message?: string;
  now?: number;
}): MediaPlanOperationProgress {
  const stepSource =
    input.operation === "generate" ? GENERATE_PROGRESS_STEPS : APPROVE_CREATE_PROGRESS_STEPS;
  const completed = new Set(input.completedStepIds ?? []);
  const elapsedMs = Math.max(0, (input.now ?? Date.now()) - Date.parse(input.startedAt));
  const estimateMs =
    input.estimateMs ??
    (input.operation === "generate" ? DEFAULT_GENERATE_ESTIMATE_MS : DEFAULT_APPROVE_ESTIMATE_MS);
  const percent = clampPercent(
    input.percent ?? derivePercent(stepSource.map((step) => step.id), completed, input.activeStepId, input.status)
  );

  const steps: MediaPlanProgressStep[] = stepSource.map((step) => ({
    id: step.id,
    label: step.label,
    status: resolveStepStatus({
      stepId: step.id,
      status: input.status,
      activeStepId: input.activeStepId,
      failedStepId: input.failedStepId,
      completed,
    }),
  }));

  return {
    operation: input.operation,
    title: input.title,
    status: input.status,
    statusLabel: input.statusLabel,
    steps,
    percent,
    startedAt: input.startedAt,
    elapsedMs,
    estimatedRemainingMs:
      input.status === "running" ? Math.max(0, estimateMs - elapsedMs) : input.status === "completed" ? 0 : null,
    message: input.message,
  };
}

export function createGenerationProgress(input: {
  status: "queued" | "in_progress" | "completed" | "failed" | string;
  startedAt: string;
  now?: number;
  message?: string;
}): MediaPlanOperationProgress {
  if (input.status === "completed") {
    return createMediaPlanProgress({
      operation: "generate",
      title: "Generate Media Plan Progress",
      status: "completed",
      statusLabel: "Completed",
      startedAt: input.startedAt,
      completedStepIds: GENERATE_PROGRESS_STEPS.map((step) => step.id),
      percent: 100,
      message: input.message,
      now: input.now,
    });
  }

  if (input.status === "failed") {
    return createMediaPlanProgress({
      operation: "generate",
      title: "Generate Media Plan Progress",
      status: "failed",
      statusLabel: "Failed",
      startedAt: input.startedAt,
      completedStepIds: GENERATE_PROGRESS_STEPS.slice(0, 2).map((step) => step.id),
      activeStepId: "researching_keywords",
      failedStepId: "researching_keywords",
      percent: 35,
      message: input.message,
      now: input.now,
    });
  }

  const elapsedMs = Math.max(0, (input.now ?? Date.now()) - Date.parse(input.startedAt));
  const estimatedPercent = input.status === "queued" ? 12 : Math.min(88, 22 + Math.floor(elapsedMs / 2500));
  const activeStepId =
    estimatedPercent < 25
      ? "reading_brief"
      : estimatedPercent < 40
        ? "analysing_landing_page"
        : estimatedPercent < 56
          ? "researching_keywords"
          : estimatedPercent < 72
            ? "building_ad_groups"
            : estimatedPercent < 88
              ? "writing_ad_copy"
              : "validating_media_plan";
  const activeIndex = GENERATE_PROGRESS_STEPS.findIndex((step) => step.id === activeStepId);

  return createMediaPlanProgress({
    operation: "generate",
    title: "Generate Media Plan Progress",
    status: "running",
    statusLabel: input.status === "queued" ? "Queued" : "Generating",
    startedAt: input.startedAt,
    completedStepIds: GENERATE_PROGRESS_STEPS.slice(0, activeIndex).map((step) => step.id),
    activeStepId,
    percent: estimatedPercent,
    message: input.message ?? "We're building your media plan. This may take a few minutes.",
    now: input.now,
  });
}

export function createApprovalProgress(input: {
  startedAt: string;
  activeStepId?: string;
  completedStepIds?: string[];
  failedStepId?: string;
  status?: MediaPlanOperationStatus;
  statusLabel?: string;
  message?: string;
  now?: number;
}): MediaPlanOperationProgress {
  return createMediaPlanProgress({
    operation: "approve_create",
    title: "Approve & Create Paused Campaign Progress",
    status: input.status ?? "running",
    statusLabel: input.statusLabel ?? "Creating Paused Campaign",
    startedAt: input.startedAt,
    activeStepId: input.activeStepId,
    completedStepIds: input.completedStepIds,
    failedStepId: input.failedStepId,
    message: input.message,
    now: input.now,
  });
}

function resolveStepStatus(input: {
  stepId: string;
  status: MediaPlanOperationStatus;
  activeStepId?: string;
  failedStepId?: string;
  completed: Set<string>;
}): MediaPlanProgressStepStatus {
  if (input.failedStepId === input.stepId) {
    return "failed";
  }
  if (input.status === "completed" || input.completed.has(input.stepId)) {
    return "completed";
  }
  if (input.activeStepId === input.stepId) {
    return "in_progress";
  }
  return "pending";
}

function derivePercent(
  stepIds: string[],
  completed: Set<string>,
  activeStepId: string | undefined,
  status: MediaPlanOperationStatus
): number {
  if (status === "completed") {
    return 100;
  }
  if (status === "failed") {
    return Math.max(8, Math.round((completed.size / stepIds.length) * 100));
  }
  const activeBonus = activeStepId ? 0.5 : 0;
  return Math.round(((completed.size + activeBonus) / stepIds.length) * 100);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}
