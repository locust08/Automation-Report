import { Suspense } from "react";
import { redirect } from "next/navigation";

import { TikTokManagementPageClient } from "@/components/ads-management/tiktok-management-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";
import { getServerAuthSession } from "@/lib/auth/server-session";

export default async function TikTokManagementPage() {
  const session = await getServerAuthSession();
  if (!session) redirect("/");
  return <Suspense fallback={<ReportRouteLoading kind="management" />}><TikTokManagementPageClient initialRole={session.role} /></Suspense>;
}
