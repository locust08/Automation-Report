import { Platform, RequestContext } from "@/lib/reporting/types";

export function parseRequestContext(searchParams: URLSearchParams): RequestContext {
  return {
    accountId: getValue(searchParams, "accountId"),
    metaAccountId: getValue(searchParams, "metaAccountId"),
    googleAccountId: getValue(searchParams, "googleAccountId"),
    tiktokAccountId: getValue(searchParams, "tiktokAccountId"),
    startDate: getValue(searchParams, "startDate"),
    endDate: getValue(searchParams, "endDate"),
    campaignType: getValue(searchParams, "campaignType"),
    platform: toPlatform(getValue(searchParams, "platform")),
    source: searchParams.get("source") === "meta_csv" ? "meta_csv" : "api",
  };
}

export function resolveRouteAccountFallback(
  routeAccountId: string | null,
  context: Pick<RequestContext, "accountId" | "metaAccountId" | "googleAccountId" | "tiktokAccountId">,
): string | null {
  if (context.accountId) return context.accountId;
  if (context.metaAccountId || context.googleAccountId || context.tiktokAccountId) return null;
  return routeAccountId;
}

function getValue(searchParams: URLSearchParams, key: string): string | null {
  const value = searchParams.get(key);
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toPlatform(value: string | null): Platform | null {
  if (!value) {
    return null;
  }
  if (value === "meta" || value === "google" || value === "googleYoutube" || value === "tiktok") {
    return value;
  }
  return null;
}
