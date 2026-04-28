import { Suspense } from "react";

import { OverallPageClient } from "@/components/reporting/overall-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";
import { ReportFilters } from "@/components/reporting/use-report-filters";

function getSingleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toPlatform(value: string | undefined): ReportFilters["platform"] | undefined {
  return value === "meta" || value === "google" || value === "googleYoutube" ? value : undefined;
}

export default async function OverallPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialFilters = {
    accountId: getSingleValue(resolvedSearchParams?.accountId),
    metaAccountId: getSingleValue(resolvedSearchParams?.metaAccountId),
    googleAccountId: getSingleValue(resolvedSearchParams?.googleAccountId),
    startDate: getSingleValue(resolvedSearchParams?.startDate),
    endDate: getSingleValue(resolvedSearchParams?.endDate),
    platform: toPlatform(getSingleValue(resolvedSearchParams?.platform)),
  } satisfies Partial<ReportFilters>;

  return (
    <Suspense fallback={<ReportRouteLoading kind="overall" />}>
      <OverallPageClient initialFilters={initialFilters} />
    </Suspense>
  );
}
