import type { M03ChangeItemInput, M03ChangeRequestDetail, M03ChangeRequestSummary, M03Platform, M03Status } from "./types";

export type M03WorkspaceScope = {
  platform?: M03Platform;
  accountIdentity?: string;
  campaignIdentity?: string;
};

export type M03RequestPrefill = {
  accountIdentity: string;
  campaignIdentity: string;
  entityType: string;
  entityIdentity: string;
  title: string;
  items: M03ChangeItemInput[];
};

export type M03RequestForm = {
  platform: M03Platform;
  title: string;
  reason: string;
  clientId: string;
  accountIdentity: string;
  campaignIdentity: string;
  sourceM04PlanId: string;
  sourceM04RevisionId: string;
  items: M03ChangeItemInput[];
};

export class M03ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "M03ApiError";
  }
}

export function shouldShowM03NewRequestAction(value: boolean | undefined): boolean {
  return value !== false;
}

export type M03SerializedRequestForm = {
  platform: M03Platform;
  title: string;
  reason: string;
  client_id: string | null;
  account_identity: string;
  campaign_identity: string;
  source_m04_plan_id: number | null;
  source_m04_revision_id: number | null;
  rollback_of_request_id: null;
  supersedes_request_id: null;
  items: M03ChangeItemInput[];
};

export type M03SaveFailureDisposition = {
  kind: "optimistic_conflict" | "request_failed";
  closeEditor: boolean;
  resetForm: boolean;
  refreshCurrentRequest: boolean;
  message: string;
};

export type M03EditorSession = {
  formOpen: boolean;
  editing: M03ChangeRequestSummary | null;
  form: M03RequestForm;
  reconciliation: M03EditorReconciliation | null;
};

export type M03WorkspaceResettableState = {
  payload: unknown;
  detail: M03ChangeRequestDetail | null;
  providerPreview: unknown;
  providerPreviewError: string | null;
  editor: M03EditorSession;
  status: M03Status | "all";
  campaignIdentity: string;
  page: number;
  handledExactRequestId: string | null;
};

export type M03EditorReconciliation = {
  requestId: string;
  originalLockVersion: number;
  message: string;
};

export type M03EditorSessionEvent =
  | { type: "open_new"; form: M03RequestForm }
  | { type: "open_edit"; form: M03RequestForm; editing: M03ChangeRequestSummary }
  | { type: "update_form"; update: M03RequestForm | ((current: M03RequestForm) => M03RequestForm) }
  | { type: "close" }
  | { type: "scope_changed"; form: M03RequestForm }
  | { type: "optimistic_conflict"; message: string }
  | { type: "list_refreshed" }
  | { type: "list_navigation_changed"; source: "platform" | "status" | "campaign" | "page" }
  | { type: "reload_latest"; detail: M03ChangeRequestDetail };

export function reduceM03EditorSession(state: M03EditorSession, event: M03EditorSessionEvent): M03EditorSession {
  if (event.type === "scope_changed") return { formOpen: false, editing: null, form: event.form, reconciliation: null };
  if (event.type === "list_refreshed" || event.type === "list_navigation_changed") return state;
  if (state.reconciliation && (event.type === "open_new" || event.type === "open_edit")) return state;
  if (event.type === "open_new") return { formOpen: true, editing: null, form: event.form, reconciliation: null };
  if (event.type === "open_edit") return { formOpen: true, editing: event.editing, form: event.form, reconciliation: null };
  if (event.type === "update_form") {
    return { ...state, form: typeof event.update === "function" ? event.update(state.form) : event.update };
  }
  if (event.type === "close") return { ...state, formOpen: false, editing: null, reconciliation: null };
  if (event.type === "optimistic_conflict") {
    if (!state.editing) return state;
    return {
      ...state,
      reconciliation: {
        requestId: state.editing.id,
        originalLockVersion: state.editing.lock_version,
        message: event.message,
      },
    };
  }
  return {
    formOpen: true,
    editing: event.detail.request,
    form: buildM03EditForm(event.detail),
    reconciliation: null,
  };
}

export function canSaveM03EditorSession(state: M03EditorSession) {
  return state.formOpen && state.reconciliation === null;
}

export function planM03SaveFailureTransition(state: M03EditorSession, error: unknown): {
  disposition: M03SaveFailureDisposition;
  editorEvent: M03EditorSessionEvent | null;
  refreshList: boolean;
  refreshDetailRequestId: string | null;
  refreshProviderPreview: boolean;
} {
  if (!state.editing && ["meta", "google"].includes(state.form.platform) && error instanceof M03ApiError && error.status === 409 && /baseline/i.test(error.message)) {
    return {
      disposition: {
        kind: "request_failed",
        closeEditor: false,
        resetForm: false,
        refreshCurrentRequest: false,
        message: `Official ${state.form.platform === "meta" ? "Meta" : "Google Ads"} data changed before this request was saved. Refresh official data, review every baseline, and save again.`,
      },
      editorEvent: null,
      refreshList: false,
      refreshDetailRequestId: null,
      refreshProviderPreview: false,
    };
  }
  const disposition = getM03SaveFailureDisposition(error);
  if (disposition.kind === "optimistic_conflict" && state.editing) {
    return {
      disposition,
      editorEvent: { type: "optimistic_conflict", message: disposition.message },
      refreshList: true,
      refreshDetailRequestId: state.editing.id,
      refreshProviderPreview: true,
    };
  }
  return {
    disposition,
    editorEvent: null,
    refreshList: false,
    refreshDetailRequestId: null,
    refreshProviderPreview: false,
  };
}

export function createEmptyM03ChangeItem(): M03ChangeItemInput {
  return {
    entity_type: "campaign",
    entity_identity: "",
    field_path: "",
    value_type: "string",
    baseline_value: "",
    proposed_value: "",
    evidence: {},
    platform_resource_mapping: {},
  };
}

export function buildM03RequestListQuery(input: { scope: M03WorkspaceScope; status: M03Status | "all"; page: number; pageSize: 10 | 25 | 50 }) {
  const query = new URLSearchParams({ page: String(input.page), page_size: String(input.pageSize) });
  if (input.scope.platform) query.set("platform", input.scope.platform);
  if (input.status !== "all") query.set("status", input.status);
  if (input.scope.accountIdentity?.trim()) {
    query.set("account_identity", input.scope.accountIdentity.trim());
    if (input.scope.campaignIdentity?.trim()) {
      query.set("campaign_identity", input.scope.campaignIdentity.trim());
    }
  }
  return query.toString();
}

export function buildM03ExactRequestHref(requestId: string) {
  return `/change-control?request_id=${encodeURIComponent(requestId)}`;
}

export function matchesM03WorkspaceScope(request: M03ChangeRequestSummary, scope: M03WorkspaceScope) {
  return (!scope.platform || request.platform === scope.platform)
    && (!scope.accountIdentity || request.account_identity === scope.accountIdentity)
    && (!scope.campaignIdentity || request.campaign_identity === scope.campaignIdentity);
}

export function resetM03WorkspaceForScope<T extends M03WorkspaceResettableState>(state: T, scope: M03WorkspaceScope): T {
  return {
    ...state,
    payload: null,
    detail: null,
    providerPreview: null,
    providerPreviewError: null,
    editor: {
      formOpen: false,
      editing: null,
      form: buildM03RequestForm({ scope }),
      reconciliation: null,
    },
    status: "all",
    campaignIdentity: scope.campaignIdentity ?? "",
    page: 1,
    handledExactRequestId: null,
  };
}

export async function loadM03ExactRequest(
  requestId: string,
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch,
) {
  try {
    return await requestM03Api<M03ChangeRequestDetail>(`/api/change-control/requests/${encodeURIComponent(requestId)}`, undefined, fetcher);
  } catch (error) {
    if (error instanceof M03ApiError && error.status === 404) throw new M03ApiError("Change request was not found.", 404);
    throw error;
  }
}

export function buildM03RequestForm(input: { scope?: M03WorkspaceScope; prefill?: M03RequestPrefill }): M03RequestForm {
  const { scope = {}, prefill } = input;
  return {
    platform: scope.platform ?? "google",
    title: prefill?.title ?? "",
    reason: "",
    clientId: "",
    accountIdentity: scope.accountIdentity ?? prefill?.accountIdentity ?? "",
    campaignIdentity: scope.campaignIdentity ?? prefill?.campaignIdentity ?? "",
    sourceM04PlanId: "",
    sourceM04RevisionId: "",
    items: prefill?.items.length
      ? prefill.items.map(cloneItem)
      : [{ ...createEmptyM03ChangeItem(), entity_type: prefill?.entityType ?? "campaign", entity_identity: prefill?.entityIdentity ?? "" }],
  };
}

export function buildM03EditForm(detail: Pick<M03ChangeRequestDetail, "request" | "items">): M03RequestForm {
  const request = detail.request;
  return {
    platform: request.platform,
    title: request.title,
    reason: request.reason,
    clientId: request.client_id ?? "",
    accountIdentity: request.account_identity,
    campaignIdentity: request.campaign_identity,
    sourceM04PlanId: request.source_m04_plan_id?.toString() ?? "",
    sourceM04RevisionId: request.source_m04_revision_id?.toString() ?? "",
    items: detail.items.map((item) => ({
      entity_type: item.entity_type,
      entity_identity: item.entity_identity,
      field_path: item.field_path,
      value_type: item.value_type,
      baseline_value: displayM03FormValue(item.baseline_value),
      proposed_value: displayM03FormValue(item.proposed_value),
      evidence: { ...item.evidence },
      platform_resource_mapping: { ...item.platform_resource_mapping },
    })),
  };
}

export function parseM03FormValue(value: unknown, type: M03ChangeItemInput["value_type"]): unknown {
  if (type === "null") return null;
  if (type === "number") {
    const parsed = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isFinite(parsed)) throw new Error("Value must be a finite number.");
    return parsed;
  }
  if (type === "boolean") {
    if (typeof value === "boolean") return value;
    const normalized = String(value).trim().toLowerCase();
    if (normalized !== "true" && normalized !== "false") throw new Error("Value must be true or false.");
    return normalized === "true";
  }
  if (type === "json") {
    if (typeof value === "string") {
      try { return JSON.parse(value); }
      catch { throw new Error("Value must be valid JSON."); }
    }
    if (!isJsonValue(value)) throw new Error("Value must be valid JSON.");
    return value;
  }
  return String(value ?? "");
}

export function validateM03RequestFormValues(form: M03RequestForm): string[] {
  const issues: string[] = [];
  for (const item of form.items) {
    const label = item.field_path || "the selected field";
    const value = item.proposed_value;
    if (item.value_type === "string" && (typeof value !== "string" || !value.trim())) {
      issues.push(`Proposed value for ${label} must be a nonblank string.`);
    } else if (item.value_type === "number") {
      const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
      if (!Number.isFinite(parsed)) issues.push(`Proposed value for ${label} must be a finite number.`);
    } else if (item.value_type === "boolean") {
      const valid = typeof value === "boolean" || (typeof value === "string" && ["true", "false"].includes(value.trim().toLowerCase()));
      if (!valid) issues.push(`Proposed value for ${label} must be true or false.`);
    } else if (item.value_type === "json") {
      if (typeof value === "string") {
        try { JSON.parse(value); } catch { issues.push(`Proposed value for ${label} must be valid JSON.`); }
      } else if (!isJsonValue(value)) issues.push(`Proposed value for ${label} must be valid JSON.`);
    }
  }
  return issues;
}

export function serializeM03RequestForm(form: M03RequestForm): M03SerializedRequestForm {
  const valueIssues = validateM03RequestFormValues(form);
  if (valueIssues.length) throw new Error(valueIssues[0]);
  return {
    platform: form.platform,
    title: form.title,
    reason: form.reason,
    client_id: form.clientId || null,
    account_identity: form.accountIdentity,
    campaign_identity: form.campaignIdentity,
    source_m04_plan_id: form.sourceM04PlanId ? Number(form.sourceM04PlanId) : null,
    source_m04_revision_id: form.sourceM04RevisionId ? Number(form.sourceM04RevisionId) : null,
    rollback_of_request_id: null,
    supersedes_request_id: null,
    items: form.items.map((item) => ({
      ...cloneItem(item),
      baseline_value: parseM03FormValue(item.baseline_value, item.value_type),
      proposed_value: parseM03FormValue(item.proposed_value, item.value_type),
    })),
  };
}

export function validateM03SourceEvidencePair(planId: string, revisionId: string): string | null {
  const plan = planId.trim();
  const revision = revisionId.trim();
  if (Boolean(plan) !== Boolean(revision)) {
    return "Enter both the M04 plan ID and revision ID, or leave both blank for audited legacy adoption.";
  }
  if (plan && (!isPositiveInteger(plan) || !isPositiveInteger(revision))) {
    return "M04 plan and revision IDs must be positive whole numbers.";
  }
  return null;
}

export function getM03SaveFailureDisposition(error: unknown): M03SaveFailureDisposition {
  if (error instanceof M03ApiError && error.status === 409) {
    return {
      kind: "optimistic_conflict",
      closeEditor: false,
      resetForm: false,
      refreshCurrentRequest: true,
      message: "A newer version of this request exists. Reconcile the refreshed request with your unsaved changes before saving again.",
    };
  }
  return {
    kind: "request_failed",
    closeEditor: false,
    resetForm: false,
    refreshCurrentRequest: false,
    message: error instanceof Error ? error.message : "Something went wrong.",
  };
}

export async function requestM03Api<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch,
): Promise<T> {
  const response = await fetcher(url, {
    ...init,
    cache: "no-store",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const payload = await response.json().catch(() => ({})) as { error?: unknown };
  if (!response.ok) {
    throw new M03ApiError(typeof payload.error === "string" ? payload.error : "Request failed.", response.status);
  }
  return payload as T;
}

function cloneItem(item: M03ChangeItemInput): M03ChangeItemInput {
  return {
    ...item,
    evidence: { ...item.evidence },
    platform_resource_mapping: { ...item.platform_resource_mapping },
  };
}

function displayM03FormValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function isPositiveInteger(value: string) {
  return /^\d+$/.test(value) && Number(value) > 0;
}

function isJsonValue(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => isJsonValue(entry, ancestors))
    : Object.values(value).every((entry) => isJsonValue(entry, ancestors));
  ancestors.delete(value);
  return valid;
}
