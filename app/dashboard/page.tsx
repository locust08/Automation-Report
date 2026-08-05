import { Suspense } from "react";
import { redirect } from "next/navigation";

import { HomePageClient } from "@/components/reporting/home-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";
import { getServerAuthSession } from "@/lib/auth/server-session";

export default async function DashboardPage() {
  const session = await getServerAuthSession();

  if (!session) {
    redirect("/");
  }

  return (
    <Suspense fallback={<ReportRouteLoading kind="fallback" />}>
      <HomePageClient displayName={session.fullName?.trim() || session.email} role={session.role} />
    </Suspense>
  );
}
