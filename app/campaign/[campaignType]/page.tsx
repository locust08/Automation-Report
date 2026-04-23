import { Suspense } from "react";

import { CampaignDashboard } from "@/components/reporting/campaign-dashboard";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";

export default async function CampaignTypePage({
  params,
}: {
  params: Promise<{ campaignType: string }>;
}) {
  const { campaignType } = await params;
  return (
    <Suspense fallback={<ReportRouteLoading />}>
      <CampaignDashboard campaignType={campaignType} />
    </Suspense>
  );
}
