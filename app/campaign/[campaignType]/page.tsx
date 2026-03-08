import { Suspense } from "react";

import { CampaignDashboard } from "@/components/reporting/campaign-dashboard";

export default async function CampaignTypePage({
  params,
}: {
  params: Promise<{ campaignType: string }>;
}) {
  const { campaignType } = await params;
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#8f0018]" />}>
      <CampaignDashboard campaignType={campaignType} />
    </Suspense>
  );
}
