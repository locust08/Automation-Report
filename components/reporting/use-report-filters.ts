"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface ReportFilters {
  accountId: string;
  metaAccountId: string;
  googleAccountId: string;
  startDate: string;
  endDate: string;
  platform: "meta" | "google" | "googleYoutube";
}

const DEFAULT_PLATFORM: ReportFilters["platform"] = "meta";
const REPORT_FILTERS_STORAGE_KEY = "reporting:filters";

export function useReportFilters(): {
  filters: ReportFilters;
  hasAccountId: boolean;
  setFilters: (next: Partial<ReportFilters>, options?: { push?: boolean }) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo<ReportFilters>(() => {
    const defaults = defaultDateRange();
    const persistedFilters = readPersistedFilters();
    const platform = searchParams.get("platform") ?? persistedFilters?.platform;

    return {
      accountId: searchParams.get("accountId") ?? persistedFilters?.accountId ?? "",
      metaAccountId: searchParams.get("metaAccountId") ?? persistedFilters?.metaAccountId ?? "",
      googleAccountId: searchParams.get("googleAccountId") ?? persistedFilters?.googleAccountId ?? "",
      startDate: searchParams.get("startDate") ?? persistedFilters?.startDate ?? defaults.startDate,
      endDate: searchParams.get("endDate") ?? persistedFilters?.endDate ?? defaults.endDate,
      platform:
        platform === "meta" || platform === "google" || platform === "googleYoutube"
          ? platform
          : DEFAULT_PLATFORM,
    };
  }, [searchParams]);

  useEffect(() => {
    persistFilters(filters);
  }, [filters]);

  const hasAccountId = Boolean(
    filters.accountId || filters.metaAccountId || filters.googleAccountId
  );

  function setFilters(next: Partial<ReportFilters>, options?: { push?: boolean }) {
    const merged = { ...filters, ...next };
    persistFilters(merged);
    const params = new URLSearchParams(searchParams.toString());

    setParam(params, "accountId", merged.accountId);
    setParam(params, "metaAccountId", merged.metaAccountId);
    setParam(params, "googleAccountId", merged.googleAccountId);
    setParam(params, "startDate", merged.startDate);
    setParam(params, "endDate", merged.endDate);
    setParam(params, "platform", merged.platform);

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

function defaultDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
  };
}

function readPersistedFilters(): ReportFilters | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(REPORT_FILTERS_STORAGE_KEY);
    if (!storedValue) {
      return null;
    }

    const parsed = JSON.parse(storedValue) as Partial<ReportFilters>;
    return {
      accountId: typeof parsed.accountId === "string" ? parsed.accountId : "",
      metaAccountId: typeof parsed.metaAccountId === "string" ? parsed.metaAccountId : "",
      googleAccountId: typeof parsed.googleAccountId === "string" ? parsed.googleAccountId : "",
      startDate: typeof parsed.startDate === "string" ? parsed.startDate : "",
      endDate: typeof parsed.endDate === "string" ? parsed.endDate : "",
      platform:
        parsed.platform === "meta" || parsed.platform === "google" || parsed.platform === "googleYoutube"
          ? parsed.platform
          : DEFAULT_PLATFORM,
    };
  } catch {
    return null;
  }
}

function persistFilters(filters: ReportFilters) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(REPORT_FILTERS_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Ignore storage write failures and continue using URL state.
  }
}
