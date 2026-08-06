"use client";

import { useEffect, useState } from "react";
import { FlagIcon } from "lucide-react";

import type { MonitoringModule } from "@/lib/team-lead-monitoring/types";

type Escalation = { id: string; sourceId: string; note: string; escalatedByEmail: string; createdAt: string };

export function AccountEscalationNotice({ module, accountId }: { module: MonitoringModule; accountId: string | null | undefined }) {
  const [items, setItems] = useState<Escalation[]>([]);
  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    void fetch(`/api/team-lead-monitoring/escalations?module=${module}&accountId=${encodeURIComponent(accountId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ escalations?: Escalation[] }> : null)
      .then((payload) => setItems(payload?.escalations ?? []))
      .catch(() => undefined);
    return () => controller.abort();
  }, [accountId, module]);
  if (!accountId || !items.length) return null;
  return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm"><div className="flex items-start gap-3"><FlagIcon className="mt-0.5 size-5 shrink-0 text-amber-700"/><div><p className="font-semibold text-amber-900">Team Lead escalation · {items.length} active</p><div className="mt-2 space-y-1 text-sm text-amber-800">{items.slice(0,3).map((item)=><p key={item.id}><span className="font-medium">Record #{item.sourceId}:</span> {item.note}</p>)}{items.length>3?<p>+ {items.length-3} more escalations</p>:null}</div></div></div></section>;
}
