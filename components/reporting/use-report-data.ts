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
  retry: () => void;
  successToken: string | null;
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

interface QueryState<T> {
  data: T | null;
  error: string | null;
  queryKey: string | null;
  successToken: string | null;
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

function useReportQuery<T>(
  requestPath: string,
  queryString: string,
  enabled: boolean,
  fallbackMessage: string
): LoadingState<T> {
  const queryKey = `${requestPath}?${queryString}`;
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    error: null,
    queryKey: null,
    successToken: null,
  });
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();

    fetch(queryKey, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = (await response.json()) as T & ReportingErrorPayload;
        if (!response.ok) {
          throw new Error(extractErrorMessage(json, fallbackMessage));
        }
        return json;
      })
      .then((json) => {
        setState({
          data: json,
          error: null,
          queryKey,
          successToken: `${queryKey}::${requestVersion}`,
        });
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }

        setState({
          data: null,
          error: fetchError instanceof Error ? fetchError.message : fallbackMessage,
          queryKey,
          successToken: null,
        });
      });

    return () => controller.abort();
  }, [enabled, fallbackMessage, queryKey, requestVersion]);

  const isCurrentQuery = state.queryKey === queryKey;
  const data = enabled && isCurrentQuery ? state.data : null;
  const error = enabled && isCurrentQuery ? state.error : null;
  const loading = enabled && !isCurrentQuery;
  const successToken = enabled && isCurrentQuery ? state.successToken : null;
  const retry = () => {
    setState((current) =>
      current.queryKey === queryKey
        ? {
            data: null,
            error: null,
            queryKey: null,
            successToken: null,
          }
        : current
    );
    setRequestVersion((current) => current + 1);
  };

  return { data, error, loading, retry, successToken };
}

export function useOverallReport(queryString: string, enabled: boolean): LoadingState<OverallReportPayload> {
  return useReportQuery<OverallReportPayload>(
    "/api/reporting",
    queryString,
    enabled,
    "Unable to load overall report."
  );
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

  return useReportQuery<CampaignComparisonPayload>(
    "/api/reporting/campaign",
    fullQuery,
    enabled,
    "Unable to load campaign comparison data."
  );
}

export function usePreviewReport(
  queryString: string,
  enabled: boolean
): LoadingState<PreviewReportPayload> {
  return useReportQuery<PreviewReportPayload>(
    "/api/reporting/preview",
    queryString,
    enabled,
    "Unable to load preview report."
  );
}

export function useTopKeywordsReport(
  queryString: string,
  enabled: boolean
): LoadingState<TopKeywordsPayload> {
  return useReportQuery<TopKeywordsPayload>(
    "/api/reporting/keywords",
    queryString,
    enabled,
    "Unable to load top keyword data."
  );
}

export function useAuctionInsightsReport(
  queryString: string,
  enabled: boolean
): LoadingState<AuctionInsightsPayload> {
  return useReportQuery<AuctionInsightsPayload>(
    "/api/reporting/auction",
    queryString,
    enabled,
    "Unable to load auction insights data."
  );
}

export function useInsightsReport(
  queryString: string,
  enabled: boolean
): LoadingState<InsightsPayload> {
  return useReportQuery<InsightsPayload>(
    "/api/reporting/insights",
    queryString,
    enabled,
    "Unable to load insights data."
  );
}
