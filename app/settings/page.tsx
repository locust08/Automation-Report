import { redirect } from "next/navigation";

import { WorkflowSettingsPageClient } from "@/components/workflow-settings/workflow-settings-page-client";
import { getServerAuthSession } from "@/lib/auth/server-session";

export default async function SettingsPage() {
  const session = await getServerAuthSession();
  if (!session) redirect("/");
  if (session.role !== "admin") redirect("/dashboard");
  return <WorkflowSettingsPageClient initialRole={session.role} />;
}
