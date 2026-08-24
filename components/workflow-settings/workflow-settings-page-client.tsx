"use client";

import { AlertTriangleIcon, CheckCircle2Icon, LoaderCircleIcon, ShieldCheckIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ReportShell } from "@/components/reporting/report-shell";
import type { AuthRole } from "@/lib/auth/roles";
import type { WorkflowPolicy, WorkflowPolicyKey } from "@/lib/workflow-settings/policy";

const POLICY_COPY: Record<WorkflowPolicyKey, { title: string; description: string; skipped: string }> = {
  search_term_approval: {
    title: "Search-term optimization",
    description: "Require a separate approver after the specialist reviews keywords and negative keywords.",
    skipped: "Specialist approval advances the recommendation directly to M03 review.",
  },
  placement_exclusion_approval: {
    title: "Placement exclusions",
    description: "Require a separate approver after websites, apps, or videos are selected for exclusion.",
    skipped: "Confirmed placement decisions advance directly to M03 review.",
  },
  m03_change_control_approval: {
    title: "M03 change control",
    description: "Require an explicit approval after a change request passes validation.",
    skipped: "A valid request is approved locally by the same authenticated administrator.",
  },
  m04_campaign_readiness_approval: {
    title: "M04 campaign readiness",
    description: "Require an explicit approval after the exact campaign revision passes readiness checks.",
    skipped: "Passing readiness checks approve the immutable revision and create its pending local build.",
  },
};

export function WorkflowSettingsPageClient({ initialRole }: { initialRole: AuthRole }) {
  const [policies, setPolicies] = useState<WorkflowPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<WorkflowPolicyKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/workflow-settings", { cache: "no-store" });
      const payload = await response.json() as { policies?: WorkflowPolicy[]; error?: string };
      if (!response.ok || !payload.policies) throw new Error(payload.error || "Unable to load workflow settings.");
      setPolicies(payload.policies);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load workflow settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function update(policy: WorkflowPolicy, approvalRequired: boolean) {
    setSaving(policy.key);
    setError(null);
    try {
      const response = await fetch("/api/admin/workflow-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: policy.key,
          approvalRequired,
          expectedLockVersion: policy.lockVersion,
          idempotencyKey: `workflow-policy:${policy.key}:${crypto.randomUUID()}`,
        }),
      });
      const payload = await response.json() as { policy?: WorkflowPolicy; error?: string };
      if (!response.ok || !payload.policy) throw new Error(payload.error || "Unable to save workflow setting.");
      setPolicies((current) => current.map((item) => item.key === payload.policy?.key ? payload.policy : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save workflow setting.");
      await load();
    } finally {
      setSaving(null);
    }
  }

  return (
    <ReportShell title="Workflow Settings" dateLabel="Admin controls" initialRole={initialRole} reportReady={!loading}>
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"><ShieldCheckIcon className="mt-0.5 size-5 shrink-0" /><div><p className="font-semibold">Provider execution remains locked</p><p className="mt-1 text-sm">These switches only remove or restore local approval steps. They never publish, activate, retry, or verify changes on Google, Meta, or TikTok.</p></div></div>
        {error ? <div role="alert" className="flex gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900"><AlertTriangleIcon className="mt-0.5 size-5 shrink-0" /><div><p className="font-semibold">Settings unavailable</p><p className="mt-1 text-sm">{error} Approval is required whenever policy data cannot be loaded.</p></div></div> : null}
        <Card className="gap-0 bg-white">
          <CardHeader className="border-b">
            <CardTitle>Approval requirements</CardTitle>
            <CardDescription>Global controls for the current single-user dashboard. Changes apply only to future workflow transitions.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {loading ? <LoadingRows /> : policies.map((policy) => {
              const copy = POLICY_COPY[policy.key];
              const busy = saving === policy.key;
              return <div key={policy.key} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2"><h2 className="font-semibold">{copy.title}</h2>{busy ? <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" /> : <CheckCircle2Icon className="size-4 text-emerald-600" />}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
                  <p className="mt-2 text-xs text-slate-600">{policy.approvalRequired ? "A separate approval is required." : copy.skipped}</p>
                  {policy.updatedAt ? <p className="mt-1 text-xs text-muted-foreground">Updated {new Date(policy.updatedAt).toLocaleString()}{policy.updatedByName ? ` by ${policy.updatedByName}` : ""}</p> : null}
                </div>
                <label className="flex shrink-0 items-center gap-3 rounded-lg border bg-slate-50 px-4 py-3 text-sm font-medium">
                  Require approval
                  <Switch checked={policy.approvalRequired} disabled={busy} onCheckedChange={(checked) => void update(policy, checked)} aria-label={`Require approval for ${copy.title}`} />
                </label>
              </div>;
            })}
          </CardContent>
        </Card>
      </div>
    </ReportShell>
  );
}

function LoadingRows() {
  return <>{Array.from({ length: 4 }, (_, index) => <div key={index} className="flex animate-pulse items-center justify-between gap-4 p-5"><div className="space-y-2"><div className="h-4 w-52 rounded bg-slate-200" /><div className="h-3 w-96 max-w-full rounded bg-slate-100" /></div><div className="h-9 w-36 rounded bg-slate-100" /></div>)}</>;
}
