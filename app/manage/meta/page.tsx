import { Suspense } from "react";
import { redirect } from "next/navigation";

import { MetaManagementPageClient } from "@/components/ads-management/meta-management-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";
import { getServerAuthSession } from "@/lib/auth/server-session";

export default async function MetaManagementPage() {
  const session = await getServerAuthSession();
  if (!session) redirect("/");

  return (
    <Suspense fallback={<ReportRouteLoading kind="management" />}>
      <MetaManagementPageClient initialRole={session.role} />
    </Suspense>
  );
}
