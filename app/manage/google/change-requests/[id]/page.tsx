import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChangeRequestPageClient } from "@/components/ads-management/change-request-page-client";
import { AUTH_COOKIE_NAME, sessionDisplayName, verifyAuthToken } from "@/lib/auth/session";
export default async function ChangeRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  const session = token ? await verifyAuthToken(token) : null;
  if (!session) redirect("/");
  const currentUser = { id: session.sub, email: session.email, role: session.role, displayName: sessionDisplayName(session) };
  return <ChangeRequestPageClient id={(await params).id} currentUser={currentUser} />;
}
