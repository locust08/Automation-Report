import Link from "next/link";
import { AlertTriangleIcon, CheckCircle2Icon, PencilIcon, ShieldCheckIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatM03Time } from "@/components/change-control/m03-request-list";
import type { M03ChangeRequestDetail } from "@/lib/change-control/types";
import type { M03ProviderWorkflowPreview } from "@/lib/change-control/provider-workflow";
import { buildM03ExactRequestHref } from "@/lib/change-control/workspace";
import { canPerformM03Action, m03CapabilitiesForRole } from "@/lib/change-control/permissions";
import type { AuthRole } from "@/lib/auth/roles";

export type M03RequestDetailProps = {
  detail: M03ChangeRequestDetail;
  providerPreview: M03ProviderWorkflowPreview | null;
  providerPreviewError: string | null;
  busy: boolean;
  role: AuthRole;
  editingBlocked?: boolean;
  onEdit: () => void;
  onAction: (name: "validate" | "approve" | "cancel") => Promise<void>;
};

export function M03RequestDetailView({ detail, providerPreview, providerPreviewError, busy, role, editingBlocked = false, onEdit, onAction }: M03RequestDetailProps) {
  const request = detail.request;
  const revision = detail.revisions[0];
  const approval = detail.approvals[0];
  const capabilities = m03CapabilitiesForRole(role);
  const editableState = request.status === "draft" || request.status === "validation_failed";
  const canEdit = editableState && capabilities.edit;
  const canValidate = editableState && capabilities.validate;
  const canApprove = request.status === "awaiting_approval" && capabilities.approve;
  const canCancel = canPerformM03Action(role, "cancel", { status: request.status });
  const isReadOnly = !canEdit && !canValidate && !canApprove && !canCancel;
  const readOnlyMessage = request.status === "awaiting_approval"
    ? "Awaiting an Approver, Team Lead, or Administrator."
    : "This request is read-only for your role.";

  return (
    <div className="space-y-4 rounded-xl border bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-semibold">{request.title}</h3><p className="text-sm text-muted-foreground">Version {request.lock_version} · immutable revisions {detail.revisions.length}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild><Link href={buildM03ExactRequestHref(request.id)}>Open exact request</Link></Button>
          {canEdit ? <Button size="sm" variant="outline" disabled={editingBlocked} title={editingBlocked ? "Resolve or close the open version conflict first." : undefined} onClick={onEdit}><PencilIcon /> Edit draft</Button> : null}
          {canValidate ? <Button size="sm" disabled={busy} onClick={() => void onAction("validate")}><ShieldCheckIcon /> Validate</Button> : null}
          {canApprove ? <Button size="sm" disabled={busy} onClick={() => void onAction("approve")}><CheckCircle2Icon /> Approve</Button> : null}
          {canCancel ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void onAction("cancel")}><XIcon /> Cancel</Button> : null}
        </div>
      </div>
      {isReadOnly ? <div role="note" className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-muted-foreground">{readOnlyMessage}</div> : null}
      <div className="space-y-3">
        {detail.items.map((item) => <div key={item.id} className="rounded-xl border p-4"><div className="mb-3 flex items-center justify-between gap-3"><span className="break-words font-medium">{item.field_path}</span><Badge variant="outline">{item.entity_type}</Badge></div><div className="grid gap-3 sm:grid-cols-2"><M03ValueBlock label="Baseline" value={item.baseline_value} /><M03ValueBlock label="Proposed" value={item.proposed_value} emphasis /></div><div className="mt-3 grid items-start gap-3 lg:grid-cols-2"><M03ReadableBlock label="Evidence" value={item.evidence} /><M03ReadableBlock label="Provider resource mapping" value={item.platform_resource_mapping} /></div></div>)}
      </div>
      <M03Info title="Immutable revision history"><div className="space-y-2">{detail.revisions.map((entry) => <div key={entry.id} className="rounded-lg border p-3"><p>Revision {entry.revision_number} · {formatM03Time(entry.created_at)}</p><p className="mt-1 break-all font-mono text-xs">{entry.payload_hash}</p><M03Json value={{ canonical_payload: entry.canonical_payload, evidence: entry.evidence, validation_issues: entry.validation_issues }} /></div>)}{!detail.revisions.length ? <p className="text-muted-foreground">No immutable revision has been created yet.</p> : null}</div></M03Info>
      <div data-layout="workflow-history-rows" className="space-y-3">
        <M03Info title="Validation history"><div className="space-y-2">{detail.validations.map((entry) => <div key={entry.id} className="rounded-lg border p-3"><p>{entry.result} · {formatM03Time(entry.created_at)}</p><M03Json value={{ issues: entry.issues, snapshot: entry.snapshot }} /></div>)}{!detail.validations.length ? <p className="text-muted-foreground">No validation record yet.</p> : null}</div></M03Info>
        <M03Info title="Approval history"><div className="space-y-2">{detail.approvals.map((entry) => <div key={entry.id} className="rounded-lg border p-3"><p>{entry.decision} · {formatM03Time(entry.created_at)}</p><p className="break-all font-mono text-xs">{entry.revision_hash}</p>{entry.comment ? <p className="mt-1">{entry.comment}</p> : null}</div>)}{!detail.approvals.length ? <p className="text-muted-foreground">No approval record yet.</p> : null}</div></M03Info>
      </div>
      <div data-layout="workflow-state-rows" className="space-y-3">
        <M03Info title="Validation" icon={detail.validations[0]?.result === "passed" ? <CheckCircle2Icon className="size-4 text-emerald-600" /> : <AlertTriangleIcon className="size-4 text-amber-600" />}><p>{detail.validations[0]?.result ?? "Not run"}</p>{detail.validations[0]?.issues.map((issue) => <p key={`${issue.path}:${issue.message}`} className="text-red-700">{issue.path}: {issue.message}</p>)}</M03Info>
        <M03Info title="Immutable revision"><p className="break-all font-mono text-xs">{revision?.payload_hash ?? "Created after validation"}</p></M03Info>
        <M03Info title="Approval"><p>{approval ? `Approved ${formatM03Time(approval.created_at)}` : "Not approved"}</p><p className="mt-1 text-amber-700">Provider execution locked</p></M03Info>
      </div>
      <div data-layout="workflow-source-rows" className="space-y-3">
        <M03Info title="Post-launch source"><p className="mb-3 font-medium capitalize">{detail.source_verification?.source_kind.replaceAll("_", " ") ?? "Not verified"}</p>{detail.source_verification ? <M03ReadableDetails value={{ plan_id: detail.source_verification.source_m04_plan_id, revision_id: detail.source_verification.source_m04_revision_id, account_identity: detail.source_verification.provider_account_identity, campaign_identity: detail.source_verification.provider_campaign_identity, evidence: detail.source_verification.evidence }} /> : null}<p className="mt-3 text-muted-foreground">M04 records are read-only; legacy adoption requires an official provider baseline.</p>{detail.source_verification ? <M03TechnicalDetails value={{ source_revision_hash: detail.source_verification.source_revision_hash, evidence: detail.source_verification.evidence }} /> : null}</M03Info>
        <M03Info title="Baseline freshness & conflict">{providerPreviewError ? <p className="text-red-700">Official baseline unavailable: {providerPreviewError}</p> : <><p>Source: {providerPreview?.baseline.source.replaceAll("_", " ") ?? "Loading"}</p><p>Fresh: {providerPreview?.baseline_fresh ? "Yes" : "No"}</p><p>Matches reviewed baseline: {providerPreview?.baseline_matches_reviewed_values ? "Yes" : "No"}</p>{providerPreview?.conflict_issues.map((issue) => <p key={issue.path} className="mt-1 text-red-700">{issue.message}</p>)}</>}</M03Info>
        <M03Info title="Provider capability plan"><p>Registry version {providerPreview?.mutation_plan.capability_registry_version ?? "—"}</p><p>{providerPreview?.mutation_plan.operations.filter((operation) => operation.mode === "direct_update").length ?? 0} direct operations</p><p>{providerPreview?.mutation_plan.replacement_items.length ?? 0} provider-native creative replacements</p>{providerPreview?.capability_issues.map((issue) => <p key={issue.path} className="mt-1 text-red-700">{issue.message}</p>)}</M03Info>
      </div>
      <M03Info title="Official baseline snapshots"><div className="space-y-2">{detail.baselines.map((baseline) => <div key={baseline.id} className="rounded-lg border p-3"><p>{baseline.source.replaceAll("_", " ")} · captured {formatM03Time(baseline.captured_at)} · expires {formatM03Time(baseline.freshness_expires_at)}</p><p className="mt-1 break-all font-mono text-xs">{baseline.payload_hash}</p><M03Json value={baseline.canonical_payload} /></div>)}{!detail.baselines.length ? <p className="text-muted-foreground">No saved baseline snapshot yet.</p> : null}</div></M03Info>
      <M03Info title="Execution attempts & replacement progress"><div className="space-y-3">{detail.resource_mappings.map((mapping) => <div key={mapping.id} className="rounded-lg border p-3"><p>{mapping.provider_resource_type}: {mapping.replacement_stage.replaceAll("_", " ")}</p><p className="mt-2 text-xs uppercase text-muted-foreground">Operation plan</p><M03Json value={mapping.operation_plan} /></div>)}{detail.operation_resources.map((resource) => <div key={resource.id} className="rounded-lg border px-3 py-2"><div className="flex flex-wrap items-center justify-between gap-2"><span>{resource.resource_role.replaceAll("_", " ")}{resource.provider_resource_identity ? ` · ${resource.provider_resource_identity}` : ""}</span><Badge variant="outline">{resource.lifecycle_state.replaceAll("_", " ")}</Badge></div>{Object.keys(resource.readback_evidence).length ? <><p className="mt-2 text-xs uppercase text-muted-foreground">Readback</p><M03Json value={resource.readback_evidence} /></> : null}</div>)}{detail.attempts.map((attempt) => <div key={attempt.id} className="rounded-lg border p-3"><p>Attempt {attempt.attempt_number} · {attempt.action} · {attempt.result.replaceAll("_", " ")}{attempt.replacement_stage ? ` · ${attempt.replacement_stage.replaceAll("_", " ")}` : ""}</p>{Object.keys(attempt.provider_result_evidence).length ? <><p className="mt-2 text-xs uppercase text-muted-foreground">Provider result</p><M03Json value={attempt.provider_result_evidence} /></> : null}{Object.keys(attempt.readback_evidence).length ? <><p className="mt-2 text-xs uppercase text-muted-foreground">Readback</p><M03Json value={attempt.readback_evidence} /></> : null}</div>)}{!detail.resource_mappings.length && !detail.operation_resources.length && !detail.attempts.length ? <p className="text-muted-foreground">No provider attempt has run. Successful replacement stages will be resumable and will not be recreated.</p> : null}</div></M03Info>
      <M03Info title="Audit history"><div className="space-y-2">{detail.events.map((event) => <div key={event.id} className="flex flex-wrap justify-between gap-2 border-b pb-2 last:border-0"><span>{event.event_type.replaceAll("_", " ")} {event.from_status ? `· ${event.from_status} → ${event.to_status}` : ""}{event.revision_id ? ` · revision ${event.revision_id.slice(0, 8)}` : ""}</span><span className="text-muted-foreground">{event.actor_name ?? "System"}{event.actor_role ? ` (${event.actor_role})` : ""} · {formatM03Time(event.created_at)}{event.trusted_ip ? ` · ${event.trusted_ip}` : ""}</span></div>)}</div></M03Info>
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="font-medium text-amber-950">Provider execution locked</p><p className="mt-1 text-sm text-amber-900">Approved is not published, and published is not verified. A separate test-account pilot must enable deployment, platform/account allowlists, and exact revision selection.</p><div className="mt-3 flex flex-wrap gap-2">{["Publish", "Retry", "Verify", "Resolve conflict", "Create rollback"].map((label) => <Button key={label} size="sm" variant="outline" disabled title="Locked until a separately approved test-account pilot">{label}</Button>)}</div></div>
    </div>
  );
}

export function displayM03Value(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function M03ValueBlock({ label, value, emphasis = false }: { label: string; value: unknown; emphasis?: boolean }) {
  return <div className={`min-h-24 rounded-lg border p-3 ${emphasis ? "border-red-200 bg-red-50" : "bg-slate-50"}`}><p className="text-xs uppercase text-muted-foreground">{label}</p><div className="mt-2 whitespace-pre-wrap break-words text-sm">{displayM03Value(value)}</div></div>;
}

function M03Info({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <div className="self-start rounded-xl border p-4"><h4 className="mb-2 flex items-center gap-2 font-medium">{icon}{title}</h4><div className="text-sm">{children}</div></div>;
}

function M03Json({ value }: { value: unknown }) {
  return <M03TechnicalDetails value={value} />;
}

const readableLabels: Record<string, string> = {
  account_identity: "Account ID", advertiser_id: "Advertiser ID", account_id: "Account ID", account_name: "Account",
  campaign_identity: "Campaign ID", campaign_id: "Campaign ID", campaign_name: "Campaign",
  adgroup_id: "Ad group ID", ad_group_id: "Ad group ID", ad_id: "Ad ID",
  source: "Source", baseline_source: "Baseline source", captured_at: "Captured", baseline_hash: "Baseline reference",
  plan_id: "Plan ID", revision_id: "Revision ID", provider_account_identity: "Provider account ID",
};

export function readableM03Entries(value: unknown): Array<{ label: string; value: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const entries: Array<{ label: string; value: string }> = [];
  for (const [key, raw] of Object.entries(value)) {
    if (raw == null || raw === "") continue;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const child of readableM03Entries(raw)) entries.push({ label: child.label === "Source" ? `${humanizeM03Key(key)} source` : child.label, value: child.value });
      continue;
    }
    entries.push({ label: readableLabels[key] ?? humanizeM03Key(key), value: humanizeM03Value(key, raw) });
  }
  return entries;
}

function humanizeM03Key(key: string) {
  return key.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
}

function humanizeM03Value(key: string, value: unknown) {
  if (key.endsWith("_at") && typeof value === "string") return formatM03Time(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value !== "string") return String(value);
  if (key === "source") return value.replaceAll("_", " ").replace(/\btiktok\b/gi, "TikTok").replace(/^./, (character) => character.toUpperCase());
  if (!value.includes("_")) return value;
  return value.replaceAll("_", " ").replace(/\btiktok\b/gi, "TikTok").replace(/^./, (character) => character.toUpperCase());
}

function M03ReadableBlock({ label, value }: { label: string; value: unknown }) {
  return <div className="rounded-lg border bg-slate-50 p-3"><p className="text-xs uppercase text-muted-foreground">{label}</p><M03ReadableDetails value={value} /><M03TechnicalDetails value={value} /></div>;
}

function M03ReadableDetails({ value }: { value: unknown }) {
  const entries = readableM03Entries(value);
  if (!entries.length) return <p className="mt-2 text-muted-foreground">No additional details.</p>;
  return <dl className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">{entries.map((entry, index) => <div key={`${entry.label}:${index}`} className="min-w-0"><dt className="text-xs text-muted-foreground">{entry.label}</dt><dd className="break-words font-medium">{entry.value}</dd></div>)}</dl>;
}

function M03TechnicalDetails({ value }: { value: unknown }) {
  return <details className="mt-3 border-t pt-2"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">Technical details</summary><pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-100 p-2 text-xs">{JSON.stringify(value, null, 2)}</pre></details>;
}
