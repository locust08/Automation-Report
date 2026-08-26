import assert from "node:assert/strict";
import test from "node:test";

import {
  M03ApiError,
  buildM03RequestForm,
  buildM03ExactRequestHref,
  buildM03RequestListQuery,
  loadM03ExactRequest,
  canSaveM03EditorSession,
  getM03SaveFailureDisposition,
  parseM03FormValue,
  planM03SaveFailureTransition,
  reduceM03EditorSession,
  requestM03Api,
  serializeM03RequestForm,
  resetM03WorkspaceForScope,
  shouldShowM03NewRequestAction,
  validateM03RequestFormValues,
  validateM03SourceEvidencePair,
  type M03RequestPrefill,
  type M03EditorSession,
  type M03WorkspaceScope,
} from "./workspace";
import type { M03ChangeRequestDetail, M03ChangeRequestSummary } from "./types";

const scope: M03WorkspaceScope = {
  platform: "meta",
  accountIdentity: "act_123",
  campaignIdentity: "campaign_456",
};

const prefill: M03RequestPrefill = {
  accountIdentity: "act_123",
  campaignIdentity: "campaign_456",
  entityType: "ad_set",
  entityIdentity: "adset_789",
  title: "Adjust Meta budget",
  items: [{
    entity_type: "ad_set",
    entity_identity: "adset_789",
    field_path: "ad_set.budget.daily",
    value_type: "number",
    baseline_value: 100,
    proposed_value: 125,
    evidence: {},
    platform_resource_mapping: { account_id: "123", ad_set_id: "adset_789" },
  }],
};

test("M03 workspace list queries include every fixed scope, active filter, and selected page size", () => {
  assert.deepEqual(
    buildM03RequestListQuery({ scope, status: "awaiting_approval", page: 2, pageSize: 25 }),
    "page=2&page_size=25&platform=meta&status=awaiting_approval&account_identity=act_123&campaign_identity=campaign_456",
  );
  assert.equal(
    buildM03RequestListQuery({
      scope: { platform: "meta", campaignIdentity: "orphan-campaign" },
      status: "all",
      page: 1,
      pageSize: 10,
    }),
    "page=1&page_size=10&platform=meta",
    "campaign filtering is only valid within an account scope",
  );
});

test("M03 exact request links use only the encoded request identity", () => {
  assert.equal(buildM03ExactRequestHref("request/with spaces"), "/change-control?request_id=request%2Fwith%20spaces");
});

test("M03 New request action stays visible globally and can be hidden by an embedded composition", () => {
  assert.equal(shouldShowM03NewRequestAction(undefined), true);
  assert.equal(shouldShowM03NewRequestAction(true), true);
  assert.equal(shouldShowM03NewRequestAction(false), false);
});

test("M03 request construction applies reusable scope and prefill without sharing mutable items", () => {
  const form = buildM03RequestForm({ scope, prefill });

  assert.equal(form.platform, "meta");
  assert.equal(form.accountIdentity, "act_123");
  assert.equal(form.campaignIdentity, "campaign_456");
  assert.equal(form.title, "Adjust Meta budget");
  assert.deepEqual(form.items, prefill.items);
  assert.notEqual(form.items, prefill.items);

  const scopedBlank = buildM03RequestForm({ scope: { platform: "tiktok", accountIdentity: "advertiser-1" } });
  assert.equal(scopedBlank.platform, "tiktok");
  assert.equal(scopedBlank.accountIdentity, "advertiser-1");
  assert.equal(scopedBlank.items.length, 1);

  const identityOnly = buildM03RequestForm({
    scope,
    prefill: { ...prefill, entityType: "ad", entityIdentity: "ad_1", items: [] },
  });
  assert.equal(identityOnly.items[0].entity_type, "ad");
  assert.equal(identityOnly.items[0].entity_identity, "ad_1");
});

test("M03 API serialization maps camelCase form fields and parses typed item values", () => {
  const form = buildM03RequestForm({ scope, prefill });
  form.reason = "Pacing adjustment";
  form.clientId = "a5b1d4c8-b850-4fc5-a4d1-cf28fbd89701";
  form.sourceM04PlanId = "42";
  form.sourceM04RevisionId = "84";
  form.items = [
    { ...form.items[0], baseline_value: "100.5", proposed_value: "125" },
    { ...form.items[0], field_path: "campaign.enabled", value_type: "boolean", baseline_value: "false", proposed_value: "TRUE" },
    { ...form.items[0], field_path: "ad_set.targeting", value_type: "json", baseline_value: "{\"age\":18}", proposed_value: "[\"MY\"]" },
    { ...form.items[0], field_path: "campaign.note", value_type: "null", baseline_value: "ignored", proposed_value: "ignored" },
  ];

  const body = serializeM03RequestForm(form);
  assert.deepEqual(
    {
      platform: body.platform,
      client_id: body.client_id,
      account_identity: body.account_identity,
      campaign_identity: body.campaign_identity,
      source_m04_plan_id: body.source_m04_plan_id,
      source_m04_revision_id: body.source_m04_revision_id,
    },
    {
      platform: "meta",
      client_id: "a5b1d4c8-b850-4fc5-a4d1-cf28fbd89701",
      account_identity: "act_123",
      campaign_identity: "campaign_456",
      source_m04_plan_id: 42,
      source_m04_revision_id: 84,
    },
  );
  assert.deepEqual(body.items.map((item) => [item.baseline_value, item.proposed_value]), [
    [100.5, 125],
    [false, true],
    [{ age: 18 }, ["MY"]],
    [null, null],
  ]);
  assert.throws(() => parseM03FormValue("not-json", "json"), /valid JSON/);
});

test("M03 source evidence accepts both M04 IDs or neither and rejects an incomplete pair", () => {
  assert.equal(validateM03SourceEvidencePair("", ""), null);
  assert.equal(validateM03SourceEvidencePair("12", "24"), null);
  assert.match(validateM03SourceEvidencePair("12", "") ?? "", /both the M04 plan ID and revision ID/i);
  assert.match(validateM03SourceEvidencePair("zero", "24") ?? "", /positive whole numbers/i);
});

test("M03 API errors retain HTTP status and optimistic conflicts preserve editor state", async () => {
  await assert.rejects(
    () => requestM03Api("/conflict", undefined, async () => new Response(JSON.stringify({ error: "Lock version is stale." }), { status: 409 })),
    (error: unknown) => error instanceof M03ApiError && error.status === 409 && error.message === "Lock version is stale.",
  );
  const conflict = new M03ApiError("Lock version is stale.", 409);
  const disposition = getM03SaveFailureDisposition(conflict);

  assert.equal(conflict.status, 409);
  assert.deepEqual(disposition, {
    kind: "optimistic_conflict",
    closeEditor: false,
    resetForm: false,
    refreshCurrentRequest: true,
    message: "A newer version of this request exists. Reconcile the refreshed request with your unsaved changes before saving again.",
  });
  assert.equal(getM03SaveFailureDisposition(new M03ApiError("Bad request", 400)).kind, "request_failed");
});

test("M03 optimistic reconciliation preserves unsaved form and original lock through list refresh and blocks retry", () => {
  const editing = requestSummary(2, "Original server title");
  const unsavedForm = { ...buildM03RequestForm({ scope }), title: "Unsaved operator title" };
  const initial: M03EditorSession = { formOpen: true, editing, form: unsavedForm, reconciliation: null };

  const conflicted = reduceM03EditorSession(initial, {
    type: "optimistic_conflict",
    message: "A newer version exists.",
  });
  assert.equal(conflicted.form, unsavedForm);
  assert.equal(conflicted.editing, editing);
  assert.equal(conflicted.editing?.lock_version, 2);
  assert.deepEqual(conflicted.reconciliation, {
    requestId: "request-1",
    originalLockVersion: 2,
    message: "A newer version exists.",
  });
  assert.equal(canSaveM03EditorSession(conflicted), false, "an immediate retry remains blocked");

  const afterListRefresh = reduceM03EditorSession(conflicted, { type: "list_refreshed" });
  assert.equal(afterListRefresh, conflicted, "transient list refresh does not clear reconciliation state");
  assert.equal(afterListRefresh.reconciliation?.message, "A newer version exists.");

  const replacementForm = { ...unsavedForm, title: "Replacement form" };
  assert.equal(reduceM03EditorSession(conflicted, { type: "open_new", form: replacementForm }), conflicted);
  assert.equal(reduceM03EditorSession(conflicted, { type: "open_edit", form: replacementForm, editing: requestSummary(7, "Replacement") }), conflicted);
  for (const source of ["platform", "status", "campaign", "page"] as const) {
    assert.equal(
      reduceM03EditorSession(conflicted, { type: "list_navigation_changed", source }),
      conflicted,
      `${source} changes retain reconciliation`,
    );
  }
  const editedDuringConflict = reduceM03EditorSession(conflicted, { type: "update_form", update: replacementForm });
  assert.equal(editedDuringConflict.reconciliation, conflicted.reconciliation);
  assert.equal(reduceM03EditorSession(conflicted, { type: "close" }).reconciliation, null);
});

test("M03 explicit latest-version reload discards unsaved values, advances the lock, and clears reconciliation", () => {
  const editing = requestSummary(2, "Original server title");
  const unsavedForm = { ...buildM03RequestForm({ scope }), title: "Unsaved operator title" };
  const conflicted = reduceM03EditorSession(
    { formOpen: true, editing, form: unsavedForm, reconciliation: null },
    { type: "optimistic_conflict", message: "A newer version exists." },
  );
  const latestDetail = requestDetail(requestSummary(3, "Latest server title"));

  const reloaded = reduceM03EditorSession(conflicted, { type: "reload_latest", detail: latestDetail });
  assert.equal(reloaded.editing?.lock_version, 3);
  assert.equal(reloaded.form.title, "Latest server title");
  assert.equal(reloaded.form.items[0].proposed_value, "Latest proposed value");
  assert.equal(reloaded.reconciliation, null);
  assert.equal(canSaveM03EditorSession(reloaded), true);
});

test("M03 controller failure plan refreshes list and latest detail while reducer preserves conflict edits and lock", () => {
  const editing = requestSummary(2, "Original server title");
  const unsavedForm = { ...buildM03RequestForm({ scope }), title: "Unsaved operator title" };
  const initial: M03EditorSession = { formOpen: true, editing, form: unsavedForm, reconciliation: null };

  const plan = planM03SaveFailureTransition(initial, new M03ApiError("Lock version is stale.", 409));
  assert.equal(plan.refreshList, true);
  assert.equal(plan.refreshDetailRequestId, "request-1");
  assert.equal(plan.refreshProviderPreview, true);
  assert.ok(plan.editorEvent);
  const transitioned = reduceM03EditorSession(initial, plan.editorEvent);
  assert.equal(transitioned.form, unsavedForm);
  assert.equal(transitioned.editing, editing);
  assert.equal(transitioned.editing?.lock_version, 2);
  assert.equal(transitioned.reconciliation?.originalLockVersion, 2);
});

test("M03 create-time baseline mismatch preserves the new request form and asks for official refresh", () => {
  const form = { ...buildM03RequestForm({ scope, prefill }), reason: "Adjust delivery" };
  const initial: M03EditorSession = { formOpen: true, editing: null, form, reconciliation: null };

  const plan = planM03SaveFailureTransition(initial, new M03ApiError("Baseline mismatch.", 409));

  assert.deepEqual(plan.disposition, {
    kind: "request_failed",
    closeEditor: false,
    resetForm: false,
    refreshCurrentRequest: false,
    message: "Official Meta data changed before this request was saved. Refresh official data, review every baseline, and save again.",
  });
  assert.equal(plan.editorEvent, null);
  assert.equal(plan.refreshList, false);
  assert.equal(initial.form, form);
});

test("M03 scope changes clear detail, preview, editor conflict, filters, page, and handled exact request", () => {
  const conflicted = reduceM03EditorSession(
    { formOpen: true, editing: requestSummary(2, "Open"), form: buildM03RequestForm({ scope }), reconciliation: null },
    { type: "optimistic_conflict", message: "Conflict" },
  );
  const next = resetM03WorkspaceForScope({
    payload: { requests: [requestSummary(2, "Open")], summary: {} as never, pagination: { page: 3, page_size: 10, total: 1, total_pages: 3 }, provider_execution_locked: true },
    detail: requestDetail(requestSummary(2, "Open")),
    providerPreview: { stale: true },
    providerPreviewError: "old",
    editor: conflicted,
    status: "approved",
    campaignIdentity: "old-campaign",
    page: 3,
    handledExactRequestId: "old-request",
  }, { platform: "meta", accountIdentity: "new-account" });

  assert.equal(next.payload, null);
  assert.equal(next.detail, null);
  assert.equal(next.providerPreview, null);
  assert.equal(next.providerPreviewError, null);
  assert.equal(next.editor.formOpen, false);
  assert.equal(next.editor.editing, null);
  assert.equal(next.editor.reconciliation, null);
  assert.equal(next.editor.form.accountIdentity, "new-account");
  assert.equal(next.status, "all");
  assert.equal(next.campaignIdentity, "");
  assert.equal(next.page, 1);
  assert.equal(next.handledExactRequestId, null);
});

test("exact request loading bypasses the current page and sanitizes not-found errors", async () => {
  const detail = requestDetail(requestSummary(1, "Outside page"));
  let requested = "";
  assert.deepEqual(
    await loadM03ExactRequest("outside-page", async (input) => {
      requested = String(input);
      return new Response(JSON.stringify(detail), { status: 200 });
    }),
    detail,
  );
  assert.equal(requested, "/api/change-control/requests/outside-page");

  await assert.rejects(
    () => loadM03ExactRequest("missing", async () => new Response(JSON.stringify({ error: "select * from secret_table where token='abc'" }), { status: 404 })),
    (error: unknown) => error instanceof M03ApiError && error.status === 404 && error.message === "Change request was not found.",
  );
});

test("M03 value validation accepts zero and false but rejects NaN, non-booleans, and invalid JSON before serialization", () => {
  const form = buildM03RequestForm({ scope });
  form.items = [
    { ...form.items[0]!, field_path: "number", value_type: "number", baseline_value: "1", proposed_value: "0" },
    { ...form.items[0]!, field_path: "boolean", value_type: "boolean", baseline_value: "true", proposed_value: "false" },
    { ...form.items[0]!, field_path: "json", value_type: "json", baseline_value: "{}", proposed_value: "{\"enabled\":false}" },
  ];
  assert.deepEqual(validateM03RequestFormValues(form), []);
  assert.deepEqual(serializeM03RequestForm(form).items.map((item) => item.proposed_value), [0, false, { enabled: false }]);

  form.items = [
    { ...form.items[0]!, field_path: "number", value_type: "number", proposed_value: "not-a-number" },
    { ...form.items[0]!, field_path: "boolean", value_type: "boolean", proposed_value: "yes" },
    { ...form.items[0]!, field_path: "json", value_type: "json", proposed_value: "{broken" },
  ];
  assert.deepEqual(validateM03RequestFormValues(form), [
    "Proposed value for number must be a finite number.",
    "Proposed value for boolean must be true or false.",
    "Proposed value for json must be valid JSON.",
  ]);
  assert.throws(() => serializeM03RequestForm(form), /finite number/);

  form.items = [{ ...form.items[0]!, field_path: "json", value_type: "json", baseline_value: "{}", proposed_value: Number.NaN }];
  assert.deepEqual(validateM03RequestFormValues(form), ["Proposed value for json must be valid JSON."]);
  assert.throws(() => serializeM03RequestForm(form), /valid JSON/);
});

function requestSummary(lockVersion: number, title: string): M03ChangeRequestSummary {
  return {
    id: "request-1",
    platform: "meta",
    status: "draft",
    title,
    reason: "Review pacing",
    client_id: null,
    account_identity: "act_123",
    campaign_identity: "campaign_456",
    source_m04_plan_id: null,
    source_m04_revision_id: null,
    source_m05_recommendation_ref: null,
    rollback_of_request_id: null,
    supersedes_request_id: null,
    created_by_name: "Operator",
    created_at: "2026-08-26T00:00:00.000Z",
    updated_at: "2026-08-26T00:01:00.000Z",
    lock_version: lockVersion,
    provider_execution_locked: true,
  };
}

function requestDetail(request: M03ChangeRequestSummary): M03ChangeRequestDetail {
  return {
    request,
    items: [{
      ...createDetailItem(),
      proposed_value: "Latest proposed value",
    }],
    revisions: [],
    validations: [],
    approvals: [],
    events: [],
    source_verification: null,
    baselines: [],
    resource_mappings: [],
    attempts: [],
    operation_resources: [],
    provider_execution_locked: true,
  };
}

function createDetailItem(): M03ChangeRequestDetail["items"][number] {
  return {
    id: "item-1",
    request_id: "request-1",
    entity_type: "campaign",
    entity_identity: "campaign_456",
    field_path: "campaign.name",
    value_type: "string",
    baseline_value: "Latest baseline value",
    proposed_value: "Latest proposed value",
    evidence: {},
    platform_resource_mapping: {},
    validation_issues: [],
    provider_result_evidence: {},
    readback_evidence: {},
    capability_registry_version: null,
    mutation_mode: null,
    replacement_stage: null,
    created_at: "2026-08-26T00:00:00.000Z",
  };
}
