import { Suspense } from "react";
import { redirect } from "next/navigation";
import { GoogleManagementPageClient } from "@/components/ads-management/google-management-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { sessionDisplayName } from "@/lib/auth/session";
export default async function GoogleManagementPage() {
  const session = await getServerAuthSession();
  if (!session) redirect("/");
  const currentUser = { id: session.sub, email: session.email, role: session.role, displayName: sessionDisplayName(session) };
  return <Suspense fallback={<ReportRouteLoading kind="management" />}><GoogleManagementPageClient currentUser={currentUser} /></Suspense>;
}
