import { Suspense } from "react";
import { redirect } from "next/navigation";

import { GoogleManagementPageClient } from "@/components/ads-management/google-management-page-client";
import { MetaManagementPageClient } from "@/components/ads-management/meta-management-page-client";
import { TikTokManagementPageClient } from "@/components/ads-management/tiktok-management-page-client";
import { UnifiedManagementLanding } from "@/components/ads-management/unified-management-landing";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { sessionDisplayName } from "@/lib/auth/session";
import { resolveManagementAccount } from "@/lib/ads-management/unified-management";

type ManagePageSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdsManagementPage({ searchParams }: { searchParams: ManagePageSearchParams }) {
  const session = await getServerAuthSession();
  if (!session) redirect("/");

  const params = await searchParams;
  if (session.role === "user" && first(params.view) === "change_requests") {
    const safeParams = new URLSearchParams();
    for (const [key, rawValue] of Object.entries(params)) {
      const value = first(rawValue);
      if (value) safeParams.set(key, value);
    }
    safeParams.set("view", "campaigns");
    redirect("/manage?" + safeParams.toString());
  }
  const platform = first(params.platform);
  const accountId = first(params.accountId);
  const accountName = first(params.accountName);
  const selection = resolveManagementAccount({ directoryPlatform: platform, accountId, accountName });
  const currentUser = {
    id: session.sub,
    email: session.email,
    role: session.role,
    displayName: sessionDisplayName(session),
  };

  return (
    <Suspense fallback={<ReportRouteLoading kind="management" />}>
      {!selection ? <UnifiedManagementLanding initialRole={session.role} /> : null}
      {selection?.platform === "meta" ? (
        <MetaManagementPageClient key={`meta:${selection.accountId}`} initialRole={session.role} />
      ) : null}
      {selection?.platform === "google" ? (
        <GoogleManagementPageClient key={`google:${selection.accountId}`} currentUser={currentUser} />
      ) : null}
      {selection?.platform === "tiktok" ? (
        <TikTokManagementPageClient key={`tiktok:${selection.accountId}`} initialRole={session.role} />
      ) : null}
    </Suspense>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
