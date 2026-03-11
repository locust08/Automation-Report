import { Suspense } from "react";

import { InsightsPageClient } from "@/components/reporting/insights-page-client";

export default function InsightsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#8f0018]" />}>
      <InsightsPageClient />
    </Suspense>
  );
}
