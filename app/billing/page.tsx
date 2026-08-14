import { Suspense } from "react";

import { BillingOperationsPageClient } from "@/components/billing/billing-operations-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";

export default function BillingPage() {
  return (
    <Suspense fallback={<ReportRouteLoading kind="fallback" />}>
      <BillingOperationsPageClient />
    </Suspense>
  );
}
