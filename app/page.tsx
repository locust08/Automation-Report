import { Suspense } from "react";

import { HomePageClient } from "@/components/reporting/home-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";

export default function Page() {
  return (
    <Suspense fallback={<ReportRouteLoading kind="fallback" />}>
      <HomePageClient />
    </Suspense>
  );
}
