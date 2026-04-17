"use client";

import { useEffect, useMemo, useState } from "react";

import { formatGoogleAdsAccessPathErrorMessage } from "@/lib/reporting/google-access-path";
import {
  GoogleAdsAccessPathErrorPayload,
  AuctionInsightsPayload,
  CampaignComparisonPayload,
  InsightsPayload,
  OverallReportPayload,
  Platform,
  PreviewReportPayload,
  TopKeywordsPayload,
} from "@/lib/reporting/types";

interface LoadingState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

interface ReportingErrorPayload {
  error?: string;
  message?: string;
  stage?: string;
  errorCode?: string;
  originalAccessPath?: string | null;
  resolvedAccessPath?: string | null;
  fallbackUsed?: boolean;
  loginCustomerId?: string | null;
  customerId?: string | null;
  accountId?: string | null;
  errorMessage?: string;
  googleAdsAccessPathError?: GoogleAdsAccessPathErrorPayload;
}

function extractErrorMessage(
  payload: ReportingErrorPayload | null | undefined,
  fallbackMessage: string
): string {
  if (payload?.googleAdsAccessPathError) {
    return formatGoogleAdsAccessPathErrorMessage(payload.googleAdsAccessPathError);
  }

  if (payload?.stage === "google_ads_access_path" && payload.accountId) {
    return formatGoogleAdsAccessPathErrorMessage({
      accountId: payload.accountId,
      originalAccessPath: payload.originalAccessPath ?? null,
      resolvedAccessPath: payload.resolvedAccessPath ?? null,
      fallbackUsed: Boolean(payload.fallbackUsed),
      errorCode: payload.errorCode ?? "UNKNOWN",
      errorMessage: payload.errorMessage ?? payload.message ?? payload.error ?? fallbackMessage,
    });
  }

  return payload?.error ?? payload?.message ?? fallbackMessage;
}

export function useOverallReport(queryString: string, enabled: boolean): LoadingState<OverallReportPayload> {
  const [data, setData] = useState<OverallReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });

    fetch(`/api/reporting?${queryString}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = (await response.json()) as OverallReportPayload & ReportingErrorPayload;
        if (!response.ok) {
          throw new Error(extractErrorMessage(json, "Unable to load overall report."));
        }
        return json;
      })
      .then((json) => {
        setData(json);
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }
        setError(fetchError instanceof Error ? fetchError.message : "Unable to load overall report.");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [enabled, queryString]);

  return {
    data: enabled ? data : null,
    error: enabled ? error : null,
    loading: enabled ? loading : false,
  };
}

export function useCampaignComparison(
  queryString: string,
  campaignType: string,
  platform: Platform,
  enabled: boolean
): LoadingState<CampaignComparisonPayload> {
  const fullQuery = useMemo(() => {
    const params = new URLSearchParams(queryString);
    params.set("campaignType", campaignType);
    params.set("platform", platform);
    return params.toString();
  }, [campaignType, platform, queryString]);

  const [data, setData] = useState<CampaignComparisonPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });

    fetch(`/api/reporting/campaign?${fullQuery}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = (await response.json()) as CampaignComparisonPayload & ReportingErrorPayload;
        if (!response.ok) {
          throw new Error(extractErrorMessage(json, "Unable to load campaign comparison data."));
        }
        return json;
      })
      .then((json) => {
        setData(json);
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to load campaign comparison data."
        );
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [enabled, fullQuery]);

  return {
    data: enabled ? data : null,
    error: enabled ? error : null,
    loading: enabled ? loading : false,
  };
}

export function usePreviewReport(
  queryString: string,
  enabled: boolean
): LoadingState<PreviewReportPayload> {
  const [data, setData] = useState<PreviewReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });

    fetch(`/api/reporting/preview?${queryString}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = (await response.json()) as PreviewReportPayload & ReportingErrorPayload;
        if (!response.ok) {
          throw new Error(extractErrorMessage(json, "Unable to load preview report."));
        }
        return json;
      })
      .then((json) => {
        setData(json);
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }
        setError(fetchError instanceof Error ? fetchError.message : "Unable to load preview report.");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [enabled, queryString]);

  return {
    data: enabled ? data : null,
    error: enabled ? error : null,
    loading: enabled ? loading : false,
  };
}

export function useTopKeywordsReport(
  queryString: string,
  enabled: boolean
): LoadingState<TopKeywordsPayload> {
  const [data, setData] = useState<TopKeywordsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });

    fetch(`/api/reporting/keywords?${queryString}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = (await response.json()) as TopKeywordsPayload & ReportingErrorPayload;
        if (!response.ok) {
          throw new Error(extractErrorMessage(json, "Unable to load top keyword data."));
        }
        return json;
      })
      .then((json) => {
        setData(json);
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }
        setError(fetchError instanceof Error ? fetchError.message : "Unable to load top keyword data.");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [enabled, queryString]);

  return {
    data: enabled ? data : null,
    error: enabled ? error : null,
    loading: enabled ? loading : false,
  };
}

export function useAuctionInsightsReport(
  queryString: string,
  enabled: boolean
): LoadingState<AuctionInsightsPayload> {
  const [data, setData] = useState<AuctionInsightsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });

    fetch(`/api/reporting/auction?${queryString}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = (await response.json()) as AuctionInsightsPayload & ReportingErrorPayload;
        if (!response.ok) {
          throw new Error(extractErrorMessage(json, "Unable to load auction insights data."));
        }
        return json;
      })
      .then((json) => {
        setData(json);
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }
        setError(
          fetchError instanceof Error ? fetchError.message : "Unable to load auction insights data."
        );
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [enabled, queryString]);

  return {
    data: enabled ? data : null,
    error: enabled ? error : null,
    loading: enabled ? loading : false,
  };
}

export function useInsightsReport(
  queryString: string,
  enabled: boolean
): LoadingState<InsightsPayload> {
  const [data, setData] = useState<InsightsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });

    fetch(`/api/reporting/insights?${queryString}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = (await response.json()) as InsightsPayload & ReportingErrorPayload;
        if (!response.ok) {
          throw new Error(extractErrorMessage(json, "Unable to load insights data."));
        }
        return json;
      })
      .then((json) => {
        setData(json);
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }
        setError(fetchError instanceof Error ? fetchError.message : "Unable to load insights data.");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [enabled, queryString]);

  return {
    data: enabled ? data : null,
    error: enabled ? error : null,
    loading: enabled ? loading : false,
  };
}
