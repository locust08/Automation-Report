import { redirect } from "next/navigation";

import { CampaignsPageClient } from "@/components/campaign-planning/campaigns-page-client";
import { getServerAuthSession } from "@/lib/auth/server-session";

export default async function CampaignsPage() {
  const session = await getServerAuthSession();
  if (!session) redirect("/");
  if (session.role === "user") redirect("/dashboard");
  return <CampaignsPageClient initialRole={session.role} />;
}

