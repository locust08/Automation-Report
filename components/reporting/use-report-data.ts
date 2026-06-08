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
import type {
  OverallAudienceBreakdownStagePayload as ServiceOverallAudienceBreakdownStagePayload,
  OverallCampaignPerformanceStagePayload as ServiceOverallCampaignPerformanceStagePayload,
  OverallSummaryStagePayload as ServiceOverallSummaryStagePayload,
} from "@/lib/reporting/service";

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
  loading: boolean;
  queryKey: string | null;
  successToken: string | null;
}

type CachedQueryValue<T> = {
  data: T;
  successToken: string;
};

type InFlightQueryValue = {
  promise: Promise<unknown>;
};

const queryResponseCache = new Map<string, CachedQueryValue<unknown>>();
const inFlightQueries = new Map<string, InFlightQueryValue>();

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
    loading: false,
    queryKey: null,
    successToken: null,
  });
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let ignoreResponse = false;
    const cached = queryResponseCache.get(queryKey) as CachedQueryValue<T> | undefined;

    const existingRequest = inFlightQueries.get(queryKey);
    const requestPromise =
      existingRequest?.promise ??
      fetch(queryKey, {
        cache: "no-store",
      })
        .then(async (response) => {
          const json = (await response.json()) as T & ReportingErrorPayload;
          if (!response.ok) {
            throw new Error(extractErrorMessage(json, fallbackMessage));
          }
          return json;
        })
        .finally(() => {
          inFlightQueries.delete(queryKey);
        });

    if (!existingRequest) {
      inFlightQueries.set(queryKey, { promise: requestPromise });
    }

    requestPromise
      .then((json) => {
        if (ignoreResponse) {
          return;
        }
        const successToken = `${queryKey}::${requestVersion}`;
        queryResponseCache.set(queryKey, {
          data: json as T,
          successToken,
        });
        setState({
          data: json as T,
          error: null,
          loading: false,
          queryKey,
          successToken,
        });
      })
      .catch((fetchError: unknown) => {
        if (ignoreResponse) {
          return;
        }

        setState({
          data: cached?.data ?? null,
          error: fetchError instanceof Error ? fetchError.message : fallbackMessage,
          loading: false,
          queryKey,
          successToken: cached?.successToken ?? null,
        });
      });

    return () => {
      ignoreResponse = true;
    };
  }, [enabled, fallbackMessage, queryKey, requestVersion]);

  const isCurrentQuery = state.queryKey === queryKey;
  const cached = enabled
    ? (queryResponseCache.get(queryKey) as CachedQueryValue<T> | undefined)
    : undefined;
  const data = enabled && isCurrentQuery ? state.data : cached?.data ?? null;
  const error = enabled && isCurrentQuery ? state.error : null;
  const loading = enabled && isCurrentQuery ? state.loading : enabled && !cached;
  const successToken = enabled && isCurrentQuery ? state.successToken : cached?.successToken ?? null;
  const retry = () => {
    queryResponseCache.delete(queryKey);
    setState((current) =>
      current.queryKey === queryKey
        ? {
            data: null,
            error: null,
            loading: true,
            queryKey: null,
            successToken: null,
          }
        : current
    );
    setRequestVersion((current) => current + 1);
  };

  return { data, error, loading, retry, successToken };
}

export function useReportSectionQuery<T>(
  requestPath: string,
  queryString: string,
  enabled: boolean,
  fallbackMessage: string
): LoadingState<T> {
  return useReportQuery<T>(requestPath, queryString, enabled, fallbackMessage);
}

export function useOverallReport(queryString: string, enabled: boolean): LoadingState<OverallReportPayload> {
  return useReportQuery<OverallReportPayload>(
    "/api/reporting",
    queryString,
    enabled,
    "Unable to load overall report."
  );
}

export function useOverallSummaryStage(
  accountKey: string,
  queryString: string,
  enabled: boolean
): LoadingState<ServiceOverallSummaryStagePayload> {
  return useReportQuery<ServiceOverallSummaryStagePayload>(
    `/api/reports/${encodeURIComponent(accountKey || "-")}/summary`,
    queryString,
    enabled,
    "Unable to load summary metrics."
  );
}

export function useOverallCampaignPerformanceStage(
  accountKey: string,
  queryString: string,
  enabled: boolean
): LoadingState<ServiceOverallCampaignPerformanceStagePayload> {
  return useReportQuery<ServiceOverallCampaignPerformanceStagePayload>(
    `/api/reports/${encodeURIComponent(accountKey || "-")}/campaign-performance`,
    queryString,
    enabled,
    "Unable to load campaign performance."
  );
}

export function useOverallAudienceBreakdownStage(
  accountKey: string,
  queryString: string,
  enabled: boolean
): LoadingState<ServiceOverallAudienceBreakdownStagePayload> {
  return useReportQuery<ServiceOverallAudienceBreakdownStagePayload>(
    `/api/reports/${encodeURIComponent(accountKey || "-")}/tables`,
    queryString,
    enabled,
    "Unable to load breakdown tables."
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
