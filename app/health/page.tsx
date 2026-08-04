import { Suspense } from "react";

import { GoogleAdsHealthPageClient } from "@/components/reporting/google-ads-health-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";

export default function GoogleAdsHealthPage() {
  return (
    <Suspense fallback={<ReportRouteLoading kind="dashboard" />}>
      <GoogleAdsHealthPageClient />
    </Suspense>
  );
}
