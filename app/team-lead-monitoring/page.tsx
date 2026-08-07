import { redirect } from "next/navigation";

import { TeamLeadMonitoringPageClient } from "@/components/team-lead-monitoring/team-lead-monitoring-page-client";
import { getServerAuthSession } from "@/lib/auth/server-session";

export default async function TeamLeadMonitoringPage() {
  const session = await getServerAuthSession();
  if (!session) redirect("/");
  if (!["tl", "admin", "ethan"].includes(session.role)) redirect("/dashboard");
  return <TeamLeadMonitoringPageClient role={session.role} />;
}
