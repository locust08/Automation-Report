import { Suspense } from "react";

import { InsightsPageClient } from "@/components/reporting/insights-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";

export default function InsightsPage() {
  return (
    <Suspense fallback={<ReportRouteLoading kind="dashboard" />}>
      <InsightsPageClient />
    </Suspense>
  );
}
