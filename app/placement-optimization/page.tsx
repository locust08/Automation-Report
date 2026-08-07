import { Suspense } from "react";
import { redirect } from "next/navigation";

import { PlacementOptimizationPageClient } from "@/components/placement-optimization/placement-optimization-page-client";
import { getServerAuthSession } from "@/lib/auth/server-session";

export default async function PlacementOptimizationPage() {
  const session = await getServerAuthSession();
  if (!session) redirect("/");
  if (!["co", "approver", "pm", "tl", "admin", "ethan"].includes(session.role)) redirect("/dashboard");
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f0f0f0] p-8">Loading placement optimization…</div>}>
      <PlacementOptimizationPageClient role={session.role} />
    </Suspense>
  );
}
