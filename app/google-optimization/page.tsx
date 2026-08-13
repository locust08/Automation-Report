import { Suspense } from "react";
import { redirect } from "next/navigation";

import { GoogleOptimizationPageClient } from "@/components/optimization/google-optimization-page-client";
import { getServerAuthSession } from "@/lib/auth/server-session";

export default async function GoogleOptimizationPage() {
  const session = await getServerAuthSession();
  if (!session) redirect("/");
  if (session.role !== "admin") redirect("/dashboard");
  return <Suspense fallback={<div className="min-h-screen bg-[#f0f0f0] p-8">Loading Google Optimization…</div>}><GoogleOptimizationPageClient role={session.role} /></Suspense>;
}
