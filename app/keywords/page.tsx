import { Suspense } from "react";

import { TopKeywordsPageClient } from "@/components/reporting/top-keywords-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";

export default function KeywordsPage() {
  return (
    <Suspense fallback={<ReportRouteLoading kind="keywords" />}>
      <TopKeywordsPageClient />
    </Suspense>
  );
}
