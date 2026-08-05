import { redirect } from "next/navigation";

import { UserManagementPageClient } from "@/components/user-management/user-management-page-client";
import { getServerAuthSession } from "@/lib/auth/server-session";

export default async function UserManagementPage() {
  const session = await getServerAuthSession();
  if (!session) redirect("/");
  if (session.role !== "admin") redirect("/dashboard");
  return <UserManagementPageClient currentUserId={session.sub} />;
}
