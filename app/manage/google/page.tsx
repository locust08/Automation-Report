import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GoogleManagementPageClient } from "@/components/ads-management/google-management-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";
import { AUTH_COOKIE_NAME, sessionDisplayName, verifyAuthToken } from "@/lib/auth/session";
export default async function GoogleManagementPage() {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  const session = token ? await verifyAuthToken(token) : null;
  if (!session) redirect("/");
  const currentUser = { id: session.sub, email: session.email, role: session.role, displayName: sessionDisplayName(session) };
  return <Suspense fallback={<ReportRouteLoading kind="management" />}><GoogleManagementPageClient currentUser={currentUser} /></Suspense>;
}
