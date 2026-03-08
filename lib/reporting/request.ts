import { Platform, RequestContext } from "@/lib/reporting/types";

export function parseRequestContext(searchParams: URLSearchParams): RequestContext {
  return {
    accountId: getValue(searchParams, "accountId"),
    metaAccountId: getValue(searchParams, "metaAccountId"),
    googleAccountId: getValue(searchParams, "googleAccountId"),
    startDate: getValue(searchParams, "startDate"),
    endDate: getValue(searchParams, "endDate"),
    campaignType: getValue(searchParams, "campaignType"),
    platform: toPlatform(getValue(searchParams, "platform")),
  };
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
  if (value === "meta" || value === "google" || value === "googleYoutube") {
    return value;
  }
  return null;
}
