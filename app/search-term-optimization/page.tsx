import { Suspense } from "react";
import { redirect } from "next/navigation";

import { SearchTermOptimizationPageClient } from "@/components/search-term-optimization/search-term-optimization-page-client";
import { getServerAuthSession } from "@/lib/auth/server-session";

export default async function SearchTermOptimizationPage() {
  const session = await getServerAuthSession();
  if (!session) redirect("/");
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f0f0f0] p-8">Loading optimization dashboard…</div>}>
      <SearchTermOptimizationPageClient role={session.role} />
    </Suspense>
  );
}
