import { redirect } from "next/navigation";
import { ChangeRequestPageClient } from "@/components/ads-management/change-request-page-client";
import { getServerAuthSession } from "@/lib/auth/server-session";
import { sessionDisplayName } from "@/lib/auth/session";
export default async function ChangeRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession();
  if (!session) redirect("/");
  const currentUser = { id: session.sub, email: session.email, role: session.role, displayName: sessionDisplayName(session) };
  return <ChangeRequestPageClient id={(await params).id} currentUser={currentUser} />;
}
