"use client";

import { SearchIcon } from "lucide-react";

import { UnifiedManagementAccountSearch } from "@/components/ads-management/unified-management-account-search";
import { ReportShell } from "@/components/reporting/report-shell";
import type { AuthRole } from "@/lib/auth/roles";

export function UnifiedManagementLanding({ initialRole }: { initialRole: AuthRole }) {
  return (
    <ReportShell title="Ads Management" dateLabel="Search for an account to begin" activeQuery="" reportReady initialRole={initialRole}>
      <div className="mx-auto max-w-3xl space-y-5 text-slate-900">
        <UnifiedManagementAccountSearch />
        <section className="rounded-2xl border border-dashed bg-white p-10 text-center shadow-sm">
          <SearchIcon className="mx-auto size-8 text-slate-400" />
          <h2 className="mt-3 text-lg font-semibold">Find an ads account</h2>
          <p className="mt-1 text-sm text-slate-500">Search once to open Meta, Google, or TikTok management with the correct provider safeguards.</p>
        </section>
      </div>
    </ReportShell>
  );
}
