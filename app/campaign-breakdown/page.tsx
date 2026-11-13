import { Suspense } from "react";
import { CampaignBreakdownPageClient } from "@/components/reporting/campaign-breakdown-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";

export default function CampaignBreakdownPage() {
  return <Suspense fallback={<ReportRouteLoading kind="overall" />}><CampaignBreakdownPageClient /></Suspense>;
}
