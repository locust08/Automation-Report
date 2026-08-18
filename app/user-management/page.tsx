import { redirect } from "next/navigation";
import { isAdminRole } from "@/lib/auth/roles";

import { UserManagementPageClient } from "@/components/user-management/user-management-page-client";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { listManagedUsers } from "@/lib/auth/users";

export default async function UserManagementPage() {
  const session = await getServerAuthSession();
  if (!session) redirect("/");
  if (!isAdminRole(session.role)) redirect("/dashboard");
  const users = await listManagedUsers();
  return <UserManagementPageClient currentUserId={session.sub} initialUsers={users} />;
}
