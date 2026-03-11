"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AuctionInsightsPayload,
  CampaignComparisonPayload,
  InsightsPayload,
  OverallReportPayload,
  Platform,
  TopKeywordsPayload,
} from "@/lib/reporting/types";

interface LoadingState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
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
        const json = (await response.json()) as OverallReportPayload & { error?: string };
        if (!response.ok) {
          throw new Error(json.error ?? "Unable to load overall report.");
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
        const json = (await response.json()) as CampaignComparisonPayload & { error?: string };
        if (!response.ok) {
          throw new Error(json.error ?? "Unable to load campaign comparison data.");
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
        const json = (await response.json()) as TopKeywordsPayload & { error?: string };
        if (!response.ok) {
          throw new Error(json.error ?? "Unable to load top keyword data.");
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
        const json = (await response.json()) as AuctionInsightsPayload & { error?: string };
        if (!response.ok) {
          throw new Error(json.error ?? "Unable to load auction insights data.");
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
        const json = (await response.json()) as InsightsPayload & { error?: string };
        if (!response.ok) {
          throw new Error(json.error ?? "Unable to load insights data.");
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
