"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type SetStateAction } from "react";
import type { M03ProviderWorkflowPreview } from "@/lib/change-control/provider-workflow";
import type { M03ChangeRequestDetail, M03ChangeRequestSummary, M03Platform, M03RequestListPayload, M03Status } from "@/lib/change-control/types";
import {
  buildM03RequestForm,
  buildM03RequestListQuery,
  buildM03EditForm,
  canSaveM03EditorSession,
  createM03LatestRequestGuard,
  loadM03ExactRequest,
  M03ApiError,
  matchesM03WorkspaceScope,
  planM03SaveFailureTransition,
  reduceM03EditorSession,
  requestM03Api,
  serializeM03RequestForm,
  validateM03SourceEvidencePair,
  validateM03RequestFormValues,
  type M03RequestPrefill,
  type M03WorkspaceScope,
} from "@/lib/change-control/workspace";

export type M03WorkspaceControllerOptions = {
  scope?: M03WorkspaceScope;
  prefill?: M03RequestPrefill | null;
  prefillReason?: string;
  exactRequestId?: string | null;
};

export function useM03WorkspaceController({ scope = {}, prefill, prefillReason = "", exactRequestId }: M03WorkspaceControllerOptions) {
  const scopePlatform = scope.platform;
  const scopeAccountIdentity = scope.accountIdentity;
  const scopeCampaignIdentity = scope.campaignIdentity;
  const [payload, setPayload] = useState<M03RequestListPayload | null>(null);
  const [detail, setDetail] = useState<M03ChangeRequestDetail | null>(null);
  const [providerPreview, setProviderPreview] = useState<M03ProviderWorkflowPreview | null>(null);
  const [providerPreviewError, setProviderPreviewError] = useState<string | null>(null);
  const [platform, setPlatformState] = useState<M03Platform | "all">(scope.platform ?? "all");
  const [status, setStatusState] = useState<M03Status | "all">("all");
  const [campaignIdentity, setCampaignIdentityState] = useState(scope.campaignIdentity ?? "");
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState<10 | 25 | 50>(10);
  const [editor, dispatchEditor] = useReducer(reduceM03EditorSession, {
    formOpen: false,
    editing: null,
    form: buildM03RequestForm({ scope, prefill: prefill ?? undefined }),
    reconciliation: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceEvidenceError, setSourceEvidenceError] = useState<string | null>(null);
  const handledPrefill = useRef<M03RequestPrefill | null>(null);
  const handledExactRequestId = useRef<string | null>(null);
  const listRequestGuard = useRef(createM03LatestRequestGuard());
  const scopeKey = `${scopePlatform ?? "*"}:${scopeAccountIdentity ?? "*"}:${scopeCampaignIdentity ?? "*"}`;
  const previousScopeKey = useRef(scopeKey);
  const activeScopeKey = useRef(scopeKey);
  activeScopeKey.current = scopeKey;

  const effectiveScope = useMemo<M03WorkspaceScope>(() => ({
    platform: scopePlatform ?? (platform === "all" ? undefined : platform),
    accountIdentity: scopeAccountIdentity,
    campaignIdentity: scopeAccountIdentity ? (scopeCampaignIdentity ?? (campaignIdentity.trim() || undefined)) : undefined,
  }), [campaignIdentity, platform, scopeAccountIdentity, scopeCampaignIdentity, scopePlatform]);

  const load = useCallback(async () => {
    const requestedScopeKey = scopeKey;
    const requestNumber = listRequestGuard.current.begin();
    setError(null);
    try {
      const query = buildM03RequestListQuery({ scope: effectiveScope, status, page, pageSize });
      const result = await requestM03Api<M03RequestListPayload>(`/api/change-control/requests?${query}`);
      if (activeScopeKey.current !== requestedScopeKey || !listRequestGuard.current.isCurrent(requestNumber)) return;
      setPayload(result);
      dispatchEditor({ type: "list_refreshed" });
    } catch (caught) {
      if (activeScopeKey.current === requestedScopeKey && listRequestGuard.current.isCurrent(requestNumber)) setError(message(caught));
    }
  }, [effectiveScope, page, pageSize, scopeKey, status]);

  const refreshDetail = useCallback(async (requestId: string) => {
    const requestedScopeKey = scopeKey;
    const refreshed = await requestM03Api<M03ChangeRequestDetail>(`/api/change-control/requests/${requestId}`);
    if (activeScopeKey.current !== requestedScopeKey || !matchesM03WorkspaceScope(refreshed.request, effectiveScope)) {
      throw new M03ApiError("Change request is outside the current workspace scope.", 404);
    }
    setDetail(refreshed);
    setProviderPreview(null); setProviderPreviewError(null);
    try {
      const preview = await requestM03Api<M03ProviderWorkflowPreview>(`/api/change-control/requests/${requestId}/provider-preview`);
      if (activeScopeKey.current === requestedScopeKey) setProviderPreview(preview);
    }
    catch (caught) {
      if (activeScopeKey.current === requestedScopeKey) setProviderPreviewError(message(caught));
    }
    return refreshed;
  }, [effectiveScope, scopeKey]);

  useEffect(() => {
    if (previousScopeKey.current === scopeKey) return;
    previousScopeKey.current = scopeKey;
    setPayload(null); setDetail(null); setProviderPreview(null); setProviderPreviewError(null);
    setPlatformState(scopePlatform ?? "all"); setStatusState("all"); setCampaignIdentityState(scopeCampaignIdentity ?? ""); setPageState(1); setPageSizeState(10);
    setError(null); setSourceEvidenceError(null); handledExactRequestId.current = null; handledPrefill.current = null;
    dispatchEditor({ type: "scope_changed", form: buildM03RequestForm({ scope: { platform: scopePlatform, accountIdentity: scopeAccountIdentity, campaignIdentity: scopeCampaignIdentity } }) });
  }, [scopeAccountIdentity, scopeCampaignIdentity, scopeKey, scopePlatform]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const normalized = exactRequestId?.trim() || null;
    if (!normalized) { handledExactRequestId.current = null; return; }
    if (handledExactRequestId.current === normalized || editor.reconciliation) return;
    handledExactRequestId.current = normalized;
    const requestedScopeKey = scopeKey;
    let cancelled = false;
    dispatchEditor({ type: "close" });
    setError(null);
    void loadM03ExactRequest(normalized).then(async (loaded) => {
      if (cancelled || activeScopeKey.current !== requestedScopeKey) return;
      if (!matchesM03WorkspaceScope(loaded.request, effectiveScope)) throw new M03ApiError("Change request is outside the current workspace scope.", 404);
      setDetail(loaded); setProviderPreview(null); setProviderPreviewError(null);
      try {
        const preview = await requestM03Api<M03ProviderWorkflowPreview>(`/api/change-control/requests/${normalized}/provider-preview`);
        if (!cancelled && activeScopeKey.current === requestedScopeKey) setProviderPreview(preview);
      }
      catch (caught) {
        if (!cancelled && activeScopeKey.current === requestedScopeKey) setProviderPreviewError(message(caught));
      }
    }).catch((caught) => {
      if (!cancelled && activeScopeKey.current === requestedScopeKey) setError(message(caught));
    });
    return () => { cancelled = true; };
  }, [editor.reconciliation, effectiveScope, exactRequestId, scopeKey]);
  useEffect(() => {
    if (!prefill) { handledPrefill.current = null; return; }
    if (handledPrefill.current === prefill) return;
    handledPrefill.current = prefill;
    if (editor.reconciliation) return;
    setDetail(null); setProviderPreview(null); setProviderPreviewError(null); setSourceEvidenceError(null);
    dispatchEditor({ type: "open_new", form: { ...buildM03RequestForm({ scope: { platform: scopePlatform, accountIdentity: scopeAccountIdentity, campaignIdentity: scopeCampaignIdentity }, prefill }), reason: prefillReason } });
  }, [editor.reconciliation, prefill, prefillReason, scopeAccountIdentity, scopeCampaignIdentity, scopePlatform]);

  async function selectRequest(request: M03ChangeRequestSummary) {
    if (editor.reconciliation) return;
    if (detail?.request.id === request.id) { setDetail(null); setProviderPreview(null); setProviderPreviewError(null); return; }
    dispatchEditor({ type: "close" }); setError(null);
    try { await refreshDetail(request.id); }
    catch (caught) { setError(message(caught)); }
  }

  function openNewRequest(nextPrefill?: M03RequestPrefill) {
    if (editor.reconciliation) return;
    setDetail(null); setProviderPreview(null); setProviderPreviewError(null); setSourceEvidenceError(null);
    dispatchEditor({ type: "open_new", form: buildM03RequestForm({ scope: effectiveScope, prefill: nextPrefill }) });
  }

  function openEditRequest(request: M03ChangeRequestSummary) {
    if (editor.reconciliation) return;
    if (!detail || detail.request.id !== request.id) return;
    setSourceEvidenceError(null);
    dispatchEditor({ type: "open_edit", editing: request, form: buildM03EditForm(detail) });
  }

  async function saveRequest() {
    if (!canSaveM03EditorSession(editor)) return;
    const valueErrors = validateM03RequestFormValues(editor.form);
    if (valueErrors.length) { setError(valueErrors[0]!); return; }
    const evidenceError = validateM03SourceEvidencePair(editor.form.sourceM04PlanId, editor.form.sourceM04RevisionId);
    setSourceEvidenceError(evidenceError);
    if (evidenceError) return;
    setBusy(true); setError(null);
    const body = serializeM03RequestForm(editor.form);
    try {
      const result = editor.editing
        ? await requestM03Api<{ request_id: string }>(`/api/change-control/requests/${editor.editing.id}`, { method: "PATCH", body: JSON.stringify({ title: body.title, reason: body.reason, source_m04_plan_id: body.source_m04_plan_id, source_m04_revision_id: body.source_m04_revision_id, rollback_of_request_id: null, supersedes_request_id: null, items: body.items, expected_lock_version: editor.editing.lock_version, idempotency_key: crypto.randomUUID() }) })
        : await requestM03Api<{ request_id: string }>("/api/change-control/requests", { method: "POST", body: JSON.stringify({ ...body, workflow_mode: "mock", idempotency_key: crypto.randomUUID() }) });
      dispatchEditor({ type: "close" }); await load(); await refreshDetail(result.request_id);
    } catch (caught) {
      const transition = planM03SaveFailureTransition(editor, caught);
      if (transition.editorEvent) dispatchEditor(transition.editorEvent);
      if (transition.refreshList && transition.refreshDetailRequestId && transition.refreshProviderPreview) {
        try { await Promise.all([load(), refreshDetail(transition.refreshDetailRequestId)]); }
        catch { setError(`${transition.disposition.message} The latest server state could not be refreshed automatically.`); }
      } else setError(transition.disposition.message);
    } finally { setBusy(false); }
  }

  async function reloadLatestVersion() {
    if (!editor.reconciliation) return;
    setBusy(true); setError(null);
    try {
      const latest = await refreshDetail(editor.reconciliation.requestId);
      dispatchEditor({ type: "reload_latest", detail: latest });
      setSourceEvidenceError(null);
    } catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  }

  async function action(name: "validate" | "approve" | "cancel") {
    if (!detail) return;
    setBusy(true); setError(null);
    try {
      await requestM03Api(`/api/change-control/requests/${detail.request.id}/${name}`, {
        method: "POST",
        body: JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          ...(name === "approve" ? { revision_hash: detail.revisions[0]?.payload_hash } : {}),
        }),
      });
      await refreshDetail(detail.request.id); await load();
    } catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  }

  function setPlatform(value: M03Platform | "all") { dispatchEditor({ type: "list_navigation_changed", source: "platform" }); setPlatformState(value); setPageState(1); }
  function setStatus(value: M03Status | "all") { dispatchEditor({ type: "list_navigation_changed", source: "status" }); setStatusState(value); setPageState(1); }
  function setCampaignIdentity(value: string) { dispatchEditor({ type: "list_navigation_changed", source: "campaign" }); setCampaignIdentityState(value); setPageState(1); }
  function setPage(value: number) { dispatchEditor({ type: "list_navigation_changed", source: "page" }); setPageState(value); }
  function setPageSize(value: 10 | 25 | 50) { dispatchEditor({ type: "list_navigation_changed", source: "page" }); setPageSizeState(value); setPageState(1); }
  function setForm(update: SetStateAction<typeof editor.form>) { dispatchEditor({ type: "update_form", update }); }
  function closeEditor() { dispatchEditor({ type: "close" }); setSourceEvidenceError(null); }
  function clearError() { setError(null); }

  return {
    payload, detail, providerPreview, providerPreviewError, platform, status, campaignIdentity, page, pageSize,
    formOpen: editor.formOpen, editing: editor.editing, form: editor.form, reconciliation: editor.reconciliation,
    canSave: canSaveM03EditorSession(editor) && validateM03RequestFormValues(editor.form).length === 0, busy, error, sourceEvidenceError, effectiveScope,
    setForm, setPlatform, setStatus, setCampaignIdentity, setPage, setPageSize, load, selectRequest,
    openNewRequest, openEditRequest, saveRequest, reloadLatestVersion, action, closeEditor, clearError,
  };
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
