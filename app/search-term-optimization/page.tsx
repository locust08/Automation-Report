import { Suspense } from "react";

import { SearchTermOptimizationPageClient } from "@/components/reporting/search-term-optimization-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";

export default function SearchTermOptimizationPage() {
  return (
    <Suspense fallback={<ReportRouteLoading kind="dashboard" />}>
      <SearchTermOptimizationPageClient />
    </Suspense>
  );
}
