"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangleIcon, CheckCircle2Icon, CopyIcon, Loader2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adsRoleLabel, canEditAds, type AuthenticatedAdsUser } from "@/lib/auth/permissions";
import type { AdsChangeSetRecord, AdsFieldChangeRecord } from "@/lib/ads-management/types";
import { formatFocusedSitelinkAuditValue, formatSitelinkCompletionValue, summarizeSitelinkChanges } from "@/lib/ads-management/sitelink-display";

export function ChangeRequestPageClient({ id, currentUser, embedded = false, open = true, onClose, onProgressChange }: { id: string; currentUser: AuthenticatedAdsUser; embedded?: boolean; open?: boolean; onClose?: (keepAlive?: boolean) => void; onProgressChange?: (busy: boolean, status: string) => void }) {
  const [data, setData] = useState<AdsChangeSetRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [completionMessage, setCompletionMessage] = useState("");
  const canEdit = canEditAds(currentUser.role);

  const load = useCallback(async () => {
    const response = await fetch(`/api/ads-management/change-requests/${id}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    setData(payload);
    setCompletionMessage((current) => current || buildCompletionMessage(payload));
  }, [id]);

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load request.")); }, [load]);
  useEffect(() => { onProgressChange?.(busy, data?.status || "loading"); }, [busy, data?.status, onProgressChange]);
  useEffect(() => {
    if (!embedded || !open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose?.(busy); };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [busy, embedded, onClose, open]);

  async function act(url: string, body: unknown = {}) {
    setBusy(true);
    setError(null);
    const trackProgress = url.endsWith("/submit") || url.endsWith("/retry-verification");
    let polling = trackProgress;
    let pollTimer: number | undefined;
    if (trackProgress) {
      const poll = async () => {
        try {
          const response = await fetch(`/api/ads-management/change-requests/${id}`, { cache: "no-store" });
          const payload = await response.json();
          if (polling && response.ok) setData(payload);
        } catch {}
      };
      pollTimer = window.setInterval(() => void poll(), 900);
    }
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      polling = false;
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      polling = false;
      if (pollTimer) window.clearInterval(pollTimer);
      setBusy(false);
    }
  }

  if (!data) return embedded ? <div className={`${open ? "fixed inset-0 z-[60] flex justify-end" : "hidden"}`}><button type="button" className="absolute inset-0 bg-slate-950/45" aria-label="Close review" onClick={() => onClose?.(busy)} /><aside className="relative z-10 grid h-full w-full max-w-[1100px] place-items-center bg-slate-50 shadow-2xl"><div>{error || "Loading change request…"}</div></aside></div> : <main className="grid min-h-screen place-items-center"><div>{error || "Loading change request…"}</div></main>;

  const changes = data.ads_field_changes ?? [];
  const recommendationOnly = changes.length > 0 && changes.every((change) => change.field_key === "recommendation.apply");
  const notification = data.ads_change_notifications?.[0] as { message?: string } | undefined;
  const content = <div className={`${embedded ? "space-y-5 p-4 sm:p-5" : "mx-auto max-w-6xl space-y-5"}`}>
    <header className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-4"><div><p className="text-sm text-slate-500">Change request · {data.status.replaceAll("_", " ")}</p><h1 className="text-2xl font-semibold">{data.title}</h1><p className="mt-1 text-sm text-slate-500">{data.account_name} · created by {data.created_by_name} · version {data.version}</p><p className="mt-1 text-xs text-slate-500">Signed in as {currentUser.displayName} · {adsRoleLabel(currentUser.role)}</p></div><div className="flex gap-2">{embedded ? <Button type="button" variant="outline" onClick={() => onClose?.(busy)}><XIcon />{busy ? "Continue in background" : "Close"}</Button> : <><Button asChild variant="outline"><Link href={`/manage/google?accountId=${data.account_id}&accountName=${encodeURIComponent(data.account_name)}`}>Manage account</Link></Button><Button asChild variant="outline"><Link href={`/manage/google/history?accountId=${data.account_id}&accountName=${encodeURIComponent(data.account_name)}`}>History</Link></Button></>}</div></div></header>
    {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700"><AlertTriangleIcon className="mr-2 inline size-4" />{error}</div> : null}
    {busy ? <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-900"><div className="flex items-center gap-3"><Loader2Icon className="size-5 animate-spin" /><div><strong className="block">{workflowProgressLabel(data.status)}</strong><span className="text-sm text-blue-700">This panel updates automatically while Google processes the request.</span></div></div></section> : null}
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="border-b p-4"><h2 className="font-semibold">Proposed edits</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Entity / field</th><th className="p-3">Synchronized original</th><th className="p-3">Latest Google</th><th className="p-3">Proposed</th><th className="p-3">Result</th></tr></thead><tbody>{changes.map((change) => <ChangeRow key={change.id} change={change} conflict={data.status === "conflict_detected"} canResolve={canEdit} busy={busy} resolve={(resolution, newValue) => act(`/api/ads-management/change-requests/${id}/conflicts/${change.id}`, { resolution, newValue })} />)}</tbody></table></div></section>

    {["draft", "validation_failed", "ready_to_publish", "awaiting_approval", "conflict_detected"].includes(data.status) ? <section className="rounded-2xl border bg-white p-5 shadow-sm"><label className="space-y-2"><span className="block font-semibold">Completion email message</span><span className="block text-sm text-slate-500">Edit the message before publishing. It is saved for the daily PIC email only after Google confirms the changes.</span><Textarea className="min-h-28" maxLength={5000} value={completionMessage} onChange={(event) => setCompletionMessage(event.target.value)} /></label><p className="mt-2 text-right text-xs text-slate-400">{completionMessage.length}/5000</p></section> : null}

    {recommendationOnly && ["draft", "validation_failed"].includes(data.status) ? <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5"><h2 className="font-semibold text-blue-900">Google recommendation request</h2><p className="mt-1 text-sm text-blue-800">Confirm the recommendation is still active in Google. Publishing remains blocked if validation or the latest-value check finds a problem.</p>{canEdit ? <Button className="mt-4 bg-blue-600 text-white hover:bg-blue-700" disabled={busy || !completionMessage.trim()} onClick={() => void act(`/api/ads-management/change-requests/${id}/submit`, { completionMessage })}>{busy ? <Loader2Icon className="animate-spin" /> : null}{busy ? "Validating and publishing…" : "Validate and Publish"}</Button> : <RoleNotice text="Your role cannot publish Google Ads changes." />}</section> : null}

    {!recommendationOnly && ["draft", "validation_failed"].includes(data.status) ? <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-semibold">Validate and publish</h2><p className="mt-1 text-sm text-slate-500">The dashboard validates the request, refreshes Google for conflicts, publishes, and verifies the result.</p>{canEdit ? <Button className="mt-4" disabled={busy || !completionMessage.trim()} onClick={() => void act(`/api/ads-management/change-requests/${id}/submit`, { completionMessage })}>{busy ? <Loader2Icon className="animate-spin" /> : null}{busy ? "Validating and publishing…" : "Publish Changes"}</Button> : <RoleNotice text="Your role cannot publish Google Ads changes." />}</section> : null}

    {["ready_to_publish", "awaiting_approval"].includes(data.status) ? <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-semibold">Publish changes</h2><p className="mt-1 text-sm text-slate-500">Google is refreshed once more before publishing. If Google changed again, publishing stops and shows a conflict.</p>{canEdit ? <Button className="mt-4" disabled={busy || !completionMessage.trim()} onClick={() => void act(`/api/ads-management/change-requests/${id}/submit`, { completionMessage })}>{busy ? <Loader2Icon className="animate-spin" /> : null}{busy ? "Publishing and verifying…" : "Publish Changes"}</Button> : <RoleNotice text="Your role cannot publish Google Ads changes." />}</section> : null}

    {data.status === "conflict_detected" && !canEdit ? <RoleNotice text="A user with Google Ads editing permission must resolve these conflicts." /> : null}
    {data.status === "partially_completed" && changes.some((change) => change.publish_status === "succeeded" && change.verification_status === "failed") ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold text-amber-900">Published changes need verification</h2><p className="mt-1 text-sm text-amber-800">This only reads Google again. It will not publish or repeat a successful mutation.</p>{canEdit ? <Button className="mt-4" disabled={busy} onClick={() => void act(`/api/ads-management/change-requests/${id}/retry-verification`)}>{busy ? <Loader2Icon className="animate-spin" /> : null}Retry verification</Button> : <RoleNotice text="Your role cannot retry verification." />}</section> : null}
    {data.status === "cancelled" ? <section className="rounded-2xl border bg-slate-50 p-5"><h2 className="font-semibold text-slate-800">Request cancelled</h2><p className="mt-1 text-sm text-slate-600">This request was cancelled and will not be published. Create a new request if edits are still needed.</p></section> : null}
    {data.status === "verified" ? <section className="rounded-2xl border border-green-200 bg-green-50 p-5"><h2 className="flex items-center gap-2 font-semibold text-green-800"><CheckCircle2Icon />Published and verified</h2>{notification?.message ? <div className="mt-3 rounded-xl bg-white p-4 text-sm"><p>{notification.message}</p><Button variant="outline" className="mt-3" onClick={() => navigator.clipboard.writeText(notification.message || "")}><CopyIcon />Copy completion message</Button></div> : null}</section> : null}
    <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Activity history</h2><ol className="mt-3 space-y-3">{(data.ads_change_events ?? []).sort((left, right) => String(left.created_at).localeCompare(String(right.created_at))).map((event) => <li key={String(event.id)} className="border-l-2 pl-3 text-sm"><strong>{String(event.message)}</strong><div className="text-slate-500">{String(event.actor_name)} · {new Date(String(event.created_at)).toLocaleString()}</div></li>)}</ol></section>
  </div>;
  if (!embedded) return <main className="min-h-screen bg-slate-50 p-5">{content}</main>;
  return <div className={`${open ? "fixed inset-0 z-[60] flex justify-end" : "hidden"}`} role="dialog" aria-modal={open ? "true" : undefined} aria-label="Review and publish changes"><button type="button" className="absolute inset-0 cursor-default bg-slate-950/45" aria-label="Close review" onClick={() => onClose?.(busy)} /><aside className="relative z-10 h-full w-full max-w-[1100px] overflow-y-auto bg-slate-50 shadow-2xl">{content}</aside></div>;
}

function workflowProgressLabel(status: string) {
  if (status === "validation_in_progress") return "Checking the latest Google values and validation rules…";
  if (status === "publishing") return "Publishing changes to Google Ads…";
  if (status === "verification_in_progress" || status === "published") return "Verifying the live values returned by Google…";
  return "Starting the secure publish workflow…";
}

function RoleNotice({ text }: { text: string }) {
  return <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{text}</p>;
}

function ChangeRow({ change: c, conflict, canResolve, busy, resolve }: { change: AdsFieldChangeRecord; conflict: boolean; canResolve: boolean; busy: boolean; resolve: (resolution: string, newValue?: unknown) => Promise<void> }) {
  const [newValue, setNewValue] = useState(c.value_type === "money_micros" ? microsToMyr(c.proposed_value) : String(c.proposed_value ?? ""));
  const hasConflict = conflict && c.conflict_resolution !== "no_conflict" && !c.reviewed_official_value;
  const isSitelink = c.value_type === "sitelinks";
  return <tr className="border-t align-top"><td className="p-3"><strong>{c.entity_name}</strong><div className="text-slate-500">{c.field_label}</div></td><td className={`whitespace-pre-wrap p-3 font-mono ${isSitelink ? "bg-red-50 text-red-800" : ""}`}>{showChangeValue(c, c.baseline_value)}</td><td className={`whitespace-pre-wrap p-3 font-mono ${hasConflict ? "bg-amber-50 text-amber-800" : ""}`}>{showChangeValue(c, c.latest_official_value)}</td><td className={`whitespace-pre-wrap p-3 font-mono ${isSitelink ? "bg-green-50 text-green-800" : "text-blue-700"}`}>{isSitelink ? <div className="mb-2 whitespace-normal font-sans text-xs font-medium text-slate-600">{sitelinkChangeSummary(c)}</div> : null}{showChangeValue(c, c.proposed_value)}</td><td className="p-3">{hasConflict ? canResolve ? <div className="space-y-2"><p className="text-xs font-medium text-slate-600">Choose which version to continue with:</p><div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" disabled={busy} onClick={() => void resolve("keep_official")}>Use Google version</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void resolve("apply_proposed")}>Use proposed version</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void resolve("cancel")}>Remove this change</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void resolve("escalate")}>Flag for review</Button></div>{c.value_type !== "text_assets" ? <div className="flex gap-1"><Input type={c.value_type === "money_micros" ? "number" : "text"} step={c.value_type === "money_micros" ? "0.01" : undefined} value={newValue} onChange={(event) => setNewValue(event.target.value)} aria-label={`Replacement value for ${c.field_label}`} /><Button size="sm" disabled={busy} onClick={() => void resolve("new_value", c.value_type === "money_micros" ? String(Math.round(Number(newValue) * 1_000_000)) : newValue)}>Use replacement</Button></div> : <p className="text-xs text-slate-500">Return to Manage account to enter a different headline set.</p>}</div> : <span className="text-xs text-amber-700">Editing permission required</span> : <div><span>{c.publish_status}</span><div className="text-xs text-slate-500">Verification: {c.verification_status}</div>{c.validation_errors?.length ? <div className="text-xs text-red-600">{c.validation_errors.join(" ")}</div> : null}</div>}</td></tr>;
}

function show(value: unknown) { return value == null ? "—" : typeof value === "string" ? value : JSON.stringify(value); }
function microsToMyr(value: unknown) { if (value == null || value === "") return ""; const amount = Number(value); return Number.isFinite(amount) ? (amount / 1_000_000).toFixed(2) : ""; }
function showChangeValue(change: AdsFieldChangeRecord, value: unknown) { if (value == null) return "—"; if (change.value_type === "money_micros") return `MYR ${microsToMyr(value)}${change.field_key === "campaign_budget.amount_micros" ? "/day" : ""}`; if (change.value_type === "text_assets" && Array.isArray(value)) return value.map((candidate, index) => { const asset = candidate as { text?: string; pinnedField?: string }; return `${index + 1}. ${asset.text || ""}${asset.pinnedField ? ` [${asset.pinnedField}]` : ""}`; }).join("\n"); if (change.value_type === "sitelinks") return formatFocusedSitelinkAuditValue(change.baseline_value, change.proposed_value, value); return show(value); }
function sitelinkChangeSummary(change: AdsFieldChangeRecord) { return summarizeSitelinkChanges(change.baseline_value, change.proposed_value); }

function buildCompletionMessage(request: AdsChangeSetRecord) {
  const changes = request.ads_field_changes ?? [];
  const summary = changes.map((change) => `${change.entity_name}: ${change.field_label} changed from ${completionValue(change, change.baseline_value)} to ${completionValue(change, change.proposed_value)}`).join("; ");
  const date = new Intl.DateTimeFormat("en-MY", { dateStyle: "long", timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
  return `Google Ads changes completed for ${request.account_name}. ${summary || request.title}. Verified on ${date}.`;
}

function completionValue(change: AdsFieldChangeRecord, value: unknown) {
  if (change.value_type === "money_micros") return `MYR ${microsToMyr(value)}${change.field_key === "campaign_budget.amount_micros" ? "/day" : ""}`;
  if (change.value_type === "text_assets" && Array.isArray(value)) return value.map((item) => String((item as { text?: unknown }).text ?? "")).filter(Boolean).join(" | ");
  if (change.value_type === "sitelinks") return formatSitelinkCompletionValue(value);
  return show(value);
}
