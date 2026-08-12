import { redirect } from "next/navigation";

import { SearchTermPmReportsPageClient } from "@/components/search-term-pm-reports/search-term-pm-reports-page-client";
import { getServerAuthSession } from "@/lib/auth/server-session";

export default async function SearchTermPmReportsPage() {
  const session = await getServerAuthSession();
  if (!session) redirect("/");
  if (!["pm", "admin"].includes(session.role)) redirect("/dashboard");
  return <SearchTermPmReportsPageClient />;
}
