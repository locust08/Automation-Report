import { Suspense } from "react";

import { AuctionPageClient } from "@/components/reporting/auction-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";

export default function AuctionPage() {
  return (
    <Suspense fallback={<ReportRouteLoading kind="dashboard" />}>
      <AuctionPageClient />
    </Suspense>
  );
}
