import { Suspense } from "react";

import { AdvancedPageClient } from "@/components/reporting/advanced-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";

function getSingleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getValues(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}

function getFirstAccountId(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const accountId = value
      ?.split(/[\s,;|]+/)
      .map((item) => item.trim())
      .find(Boolean);

    if (accountId) {
      return accountId;
    }
  }

  return undefined;
}

export default async function AdvancedPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialAccountId = getFirstAccountId(
    getSingleValue(resolvedSearchParams?.accountId),
    getSingleValue(resolvedSearchParams?.metaAccountId),
    getSingleValue(resolvedSearchParams?.googleAccountId),
    getSingleValue(resolvedSearchParams?.tiktokAccountId)
  );

  return (
    <Suspense fallback={<ReportRouteLoading kind="insights" />}>
      <AdvancedPageClient
        initialAccountId={initialAccountId}
        initialTikTokAccountId={getSingleValue(resolvedSearchParams?.tiktokAccountId)}
        initialPlatform={getSingleValue(resolvedSearchParams?.platform)}
        initialCountry={getSingleValue(resolvedSearchParams?.country)}
        initialStartDate={getSingleValue(resolvedSearchParams?.startDate)}
        initialEndDate={getSingleValue(resolvedSearchParams?.endDate)}
        initialCampaignNameFilterMode={getSingleValue(resolvedSearchParams?.campaignNameFilterMode)}
        initialCampaignNameFilterValues={getValues(resolvedSearchParams?.campaignNameFilterValue)}
      />
    </Suspense>
  );
}
