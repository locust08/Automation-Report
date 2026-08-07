import { redirect } from "next/navigation";
import { isAdminRole } from "@/lib/auth/roles";

import { UserManagementPageClient } from "@/components/user-management/user-management-page-client";
import { getServerAuthSession } from "@/lib/auth/server-session";

export default async function UserManagementPage() {
  const session = await getServerAuthSession();
  if (!session) redirect("/");
  if (!isAdminRole(session.role)) redirect("/dashboard");
  return <UserManagementPageClient currentUserId={session.sub} />;
}
