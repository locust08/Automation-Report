import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import * as detailModule from "./m03-request-detail";

test("formats provider evidence as readable label and value rows", () => {
  const readableM03Entries = (detailModule as typeof detailModule & {
    readableM03Entries?: (value: unknown) => Array<{ label: string; value: string }>;
  }).readableM03Entries;

  assert.equal(typeof readableM03Entries, "function");
  assert.deepEqual(readableM03Entries?.({
    source: "tiktok_management",
    account_name: "Bellamy's Organic Malaysia",
    baseline_source: "synchronized_tiktok_resource",
    plan_id: null,
  }), [
    { label: "Source", value: "TikTok management" },
    { label: "Account", value: "Bellamy's Organic Malaysia" },
    { label: "Baseline source", value: "Synchronized TikTok resource" },
  ]);
});

test("summarizes nested source evidence without exposing raw JSON", () => {
  const readableM03Entries = (detailModule as typeof detailModule & {
    readableM03Entries?: (value: unknown) => Array<{ label: string; value: string }>;
  }).readableM03Entries;

  assert.deepEqual(readableM03Entries?.({
    account_identity: "7512267932496560146",
    campaign_identity: "1849909659399298",
    evidence: {
      source: "provider",
      captured_at: "2026-08-28T07:32:17.558Z",
      baseline_hash: "a4bbd47d",
    },
  }), [
    { label: "Account ID", value: "7512267932496560146" },
    { label: "Campaign ID", value: "1849909659399298" },
    { label: "Evidence source", value: "Provider" },
    { label: "Captured", value: "28 Aug 2026, 3:32 pm" },
    { label: "Baseline reference", value: "a4bbd47d" },
  ]);
});

test("renders workflow metadata as full-width stacked rows", () => {
  const html = renderToStaticMarkup(detailModule.M03RequestDetailView({
    detail: {
      request: { id: "request-1", title: "Test request", lock_version: 0, status: "draft" },
      items: [], revisions: [], validations: [], approvals: [], baselines: [], resource_mappings: [], operation_resources: [], attempts: [], events: [],
      source_verification: null,
    } as never,
    providerPreview: null,
    providerPreviewError: null,
    busy: false,
    role: "admin",
    onEdit: () => undefined,
    onAction: async () => undefined,
  }));

  assert.match(html, /data-layout="workflow-history-rows" class="space-y-3"/);
  assert.match(html, /data-layout="workflow-state-rows" class="space-y-3"/);
  assert.match(html, /data-layout="workflow-source-rows" class="space-y-3"/);
});

test("renders separate validation and approval controls from the current role", () => {
  const adminDraft = renderDetail("admin", "draft");
  assert.match(adminDraft, /Validate<\/button>/);
  assert.doesNotMatch(adminDraft, /Validate and approve/);

  const approverRequest = renderDetail("approver", "awaiting_approval");
  assert.match(approverRequest, /Approve<\/button>/);
  assert.doesNotMatch(approverRequest, /Edit draft<\/button>/);
  assert.doesNotMatch(approverRequest, /Cancel<\/button>/);
});

test("renders read-only guidance and hides mutation controls for project managers", () => {
  const html = renderDetail("pm", "awaiting_approval");
  assert.match(html, /read-only/i);
  assert.match(html, /Awaiting an Approver, Team Lead, or Administrator/i);
  assert.doesNotMatch(html, /Edit draft<\/button>/);
  assert.doesNotMatch(html, /Validate<\/button>/);
  assert.doesNotMatch(html, /Approve<\/button>/);
  assert.doesNotMatch(html, /Cancel<\/button>/);
});

function renderDetail(role: "admin" | "approver" | "pm", status: "draft" | "awaiting_approval") {
  return renderToStaticMarkup(detailModule.M03RequestDetailView({
    detail: {
      request: { id: "request-1", title: "Test request", lock_version: 0, status, created_by_id: "creator" },
      items: [], revisions: [], validations: [], approvals: [], baselines: [], resource_mappings: [], operation_resources: [], attempts: [], events: [],
      source_verification: null,
    } as never,
    providerPreview: null,
    providerPreviewError: null,
    busy: false,
    role,
    onEdit: () => undefined,
    onAction: async () => undefined,
  }));
}

test("pause pilot renders only its narrow actions and non-admins cannot invoke them", () => {
  const fixture = { request: { id: "request", title: "Pilot", status: "approved", platform: "google", account_identity: "2315114913", campaign_identity: "123" }, items: [], revisions: [{ id: "revision", revision_number: 1, payload_hash: "a".repeat(64) }], approvals: [], validations: [], baselines: [], resource_mappings: [], operation_resources: [], attempts: [], events: [], source_verification: null, pause_actions: { publish: true, verify: true } };
  const render = (role: "admin" | "pm") => renderToStaticMarkup(detailModule.M03RequestDetailView({ detail: fixture as never, providerPreview: null, providerPreviewError: null, busy: false, role, onEdit: () => undefined, onAction: async () => undefined }));
  const admin = render("admin"); assert.match(admin, /Campaign pause pilot/);
  const pauseButton = admin.match(/<button[^>]*>Pause campaign<\/button>/)?.[0];
  assert.ok(pauseButton); assert.doesNotMatch(pauseButton, /\sdisabled[=\s>]/);
  assert.match(admin, /<button[^>]*disabled[^>]*>Retry<\/button>/);
  assert.match(render("pm"), /<button[^>]*disabled[^>]*>Pause campaign<\/button>/);
});
