import { redirect } from "next/navigation";
import { ChangeControlPageClient } from "@/components/change-control/change-control-page-client";
import { getServerAuthSession } from "@/lib/auth/server-session";

export default async function ChangeControlPage() {
  const session = await getServerAuthSession();
  if (!session) redirect("/");
  if (session.role !== "admin") redirect("/dashboard");
  return <ChangeControlPageClient initialRole={session.role} />;
}
