"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface ReportFilters {
  accountId: string;
  metaAccountId: string;
  googleAccountId: string;
  startDate: string;
  endDate: string;
  platform: "meta" | "google" | "googleYoutube";
  campaignNameFilterMode: "include" | "exclude";
  campaignNameFilterValues: string[];
}

const DEFAULT_PLATFORM: ReportFilters["platform"] = "meta";

export function useReportFilters(initialFilters?: Partial<ReportFilters>): {
  filters: ReportFilters;
  hasAccountId: boolean;
  setFilters: (next: Partial<ReportFilters>, options?: { push?: boolean }) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<ReportFilters>(() => {
    const defaults = defaultDateRange();
    const platform =
      searchParams.get("platform") ?? initialFilters?.platform;

    return {
      accountId:
        searchParams.get("accountId") ?? initialFilters?.accountId ?? "",
      metaAccountId:
        searchParams.get("metaAccountId") ?? initialFilters?.metaAccountId ?? "",
      googleAccountId:
        searchParams.get("googleAccountId") ?? initialFilters?.googleAccountId ?? "",
      startDate:
        searchParams.get("startDate") ?? initialFilters?.startDate ?? defaults.startDate,
      endDate:
        searchParams.get("endDate") ?? initialFilters?.endDate ?? defaults.endDate,
      platform:
        platform === "meta" || platform === "google" || platform === "googleYoutube"
          ? platform
          : DEFAULT_PLATFORM,
      campaignNameFilterMode:
        searchParams.get("campaignNameFilterMode") === "exclude" ||
        initialFilters?.campaignNameFilterMode === "exclude"
          ? "exclude"
          : "include",
      campaignNameFilterValues:
        searchParams.getAll("campaignNameFilterValue").length > 0
          ? searchParams.getAll("campaignNameFilterValue")
          : initialFilters?.campaignNameFilterValues ?? [],
    };
  }, [initialFilters, searchParams]);

  const hasAccountId = Boolean(
    filters.accountId || filters.metaAccountId || filters.googleAccountId
  );

  function setFilters(next: Partial<ReportFilters>, options?: { push?: boolean }) {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams(searchParams.toString());

    setParam(params, "accountId", merged.accountId);
    setParam(params, "metaAccountId", merged.metaAccountId);
    setParam(params, "googleAccountId", merged.googleAccountId);
    setParam(params, "startDate", merged.startDate);
    setParam(params, "endDate", merged.endDate);
    setParam(params, "platform", merged.platform);
    setParam(params, "campaignNameFilterMode", merged.campaignNameFilterValues.length ? merged.campaignNameFilterMode : "");
    setParamValues(params, "campaignNameFilterValue", merged.campaignNameFilterValues);

    const query = params.toString();
    const target = query ? `${pathname}?${query}` : pathname;
    if (options?.push) {
      router.push(target);
      return;
    }
    router.replace(target);
  }

  return {
    filters,
    hasAccountId,
    setFilters,
  };
}

function setParam(searchParams: URLSearchParams, key: string, value: string) {
  if (!value) {
    searchParams.delete(key);
    return;
  }
  searchParams.set(key, value);
}

function setParamValues(searchParams: URLSearchParams, key: string, values: string[]) {
  searchParams.delete(key);
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => searchParams.append(key, value));
}

function defaultDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
  };
}
