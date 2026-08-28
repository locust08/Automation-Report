"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { CircleSlash2Icon } from "lucide-react";
import { M03LegacyGoogleHistory, M03WorkflowSettings } from "@/components/change-control/m03-global-controls";
import { M03RequestWorkspace } from "@/components/change-control/m03-request-workspace";
import { ReportShell } from "@/components/reporting/report-shell";
import type { AuthRole } from "@/lib/auth/roles";
import { createEmptyM03ChangeItem, type M03RequestPrefill } from "@/lib/change-control/workspace";

export function ChangeControlPageClient({ initialRole }: { initialRole: AuthRole }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefill = useMemo<M03RequestPrefill | null>(() => {
    if (searchParams.get("open") !== "new" || searchParams.get("platform") !== "google") return null;
    const accountIdentity = searchParams.get("account_identity") || "";
    const campaignIdentity = searchParams.get("campaign_identity") || "";
    const entityType = searchParams.get("entity_type") || "campaign";
    const entityIdentity = searchParams.get("entity_identity") || campaignIdentity;
    return {
      accountIdentity,
      campaignIdentity,
      entityType,
      entityIdentity,
      title: searchParams.get("title") || "Google Ads change request",
      items: [{ ...createEmptyM03ChangeItem(), entity_type: entityType, entity_identity: entityIdentity, field_path: searchParams.get("field_path") || "" }],
    };
  }, [searchParams]);
  const prefillReason = prefill ? searchParams.get("reason") || "" : "";

  useEffect(() => {
    if (!prefill) return;
    router.replace("/change-control", { scroll: false });
  }, [prefill, router]);

  return <ReportShell title="Change Control Admin" dateLabel="Global M03 Administration & Recovery" reportReady initialRole={initialRole}>
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <span className="flex items-center gap-2"><CircleSlash2Icon className="size-4" /> Provider publishing, retry, verification, and rollback remain locked.</span>
        <Link href="/campaigns" className="font-semibold underline underline-offset-4">Initial campaign setup →</Link>
      </div>
      <M03RequestWorkspace prefill={prefill} prefillReason={prefillReason} exactRequestId={searchParams.get("request_id")} />
      <M03LegacyGoogleHistory initialAccountId={searchParams.get("legacy_account_id") || ""} initialRequestId={searchParams.get("legacy_request_id") || ""} />
      <M03WorkflowSettings />
    </div>
  </ReportShell>;
}
