import { Suspense } from "react";
import { DemandGenPageClient } from "@/components/reporting/demand-gen-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";

export default function DemandGenPage() {
  return <Suspense fallback={<ReportRouteLoading kind="insights" />}><DemandGenPageClient /></Suspense>;
}
