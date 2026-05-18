import { Suspense } from "react";

import { AdvancedPageClient } from "@/components/reporting/advanced-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";

function getSingleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdvancedPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  return (
    <Suspense fallback={<ReportRouteLoading kind="insights" />}>
      <AdvancedPageClient
        initialAccountId={getSingleValue(resolvedSearchParams?.accountId)}
        initialCountry={getSingleValue(resolvedSearchParams?.country)}
        initialStartDate={getSingleValue(resolvedSearchParams?.startDate)}
        initialEndDate={getSingleValue(resolvedSearchParams?.endDate)}
      />
    </Suspense>
  );
}
