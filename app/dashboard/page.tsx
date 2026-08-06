import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { HomePageClient } from "@/components/reporting/home-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth/session";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const session = token ? await verifyAuthToken(token) : null;

  if (!session) {
    redirect("/");
  }

  return (
    <Suspense fallback={<ReportRouteLoading kind="fallback" />}>
      <HomePageClient displayName={session.fullName?.trim() || session.email} />
    </Suspense>
  );
}
