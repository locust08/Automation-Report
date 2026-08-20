import type { TikTokAdsActionName } from "@/lib/tiktok/ads-actions";
import type { TikTokBudgetResult, TikTokDailyReportResult } from "@/lib/tiktok/worker-reporting";

export type TikTokCacheProvenance = {
  cacheHitDates: string[];
  cacheMissDates: string[];
  dataTimestamps: Record<string, string>;
  originatingRequestIds: string[];
  providerRequestIds: string[];
};

export type TikTokAdvertiserValidation = {
  advertiserId: string;
  readable: boolean;
  advertiserName: string | null;
  currency: string | null;
  timezone: string | null;
  warning: string | null;
  cache: "hit" | "miss";
  validatedAt: string;
  tokenUpdatedAt: string | null;
  requestId?: string;
};

export type TikTokValidationResponse = {
  apiVersion: string;
  tokenUpdatedAt: string | null;
  advertisers: TikTokAdvertiserValidation[];
};

export type TikTokGatewayDailyResult = TikTokDailyReportResult & TikTokCacheProvenance;
export type TikTokGatewayBudgetResult = TikTokBudgetResult & {
  cache: "hit" | "miss";
  dataTimestamp: string;
  originatingRequestIds: string[];
  providerRequestIds: string[];
};

export interface TikTokReadGatewayService {
  validateAdvertisers(input: { advertiserIds: string[]; fresh?: boolean }): Promise<TikTokValidationResponse>;
  getBillingDaily(input: { advertiserId: string; startDate: string; endDate: string; fresh?: boolean }): Promise<TikTokGatewayDailyResult>;
  getLiveBudget(input: { advertiserId: string; fresh?: boolean }): Promise<TikTokGatewayBudgetResult>;
  executeRead(input: { action: TikTokAdsActionName; input: Record<string, unknown> }): Promise<{
    data: unknown;
    requestId?: string;
    apiVersion: string;
  }>;
}

export function createTikTokGatewayReporting(service: TikTokReadGatewayService) {
  return {
    fetchDailyPerformance(advertiserId: string, startDate: string, endDate: string, fresh = false) {
      return service.getBillingDaily({ advertiserId, startDate, endDate, fresh });
    },
    fetchLiveDailyBudget(advertiserId: string, fresh = false) {
      return service.getLiveBudget({ advertiserId, fresh });
    },
  };
}


