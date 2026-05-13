export const DEFAULT_GOOGLE_ADS_FALLBACK_LOGIN_CUSTOMER_ID = "3666137525";

export interface GoogleAdsResolvedAccessPath {
  accountId: string;
  customerId: string;
  originalAccessPath: string | null;
  resolvedAccessPath: string;
  fallbackUsed: boolean;
  loginCustomerId: string | null;
  resolutionMode: "direct" | "manager";
}

export interface GoogleAdsAccessPathErrorPayload {
  success: false;
  stage: "google_ads_access_path";
  errorCode: string;
  message: string;
  accountId: string;
  originalAccessPath: string | null;
  resolvedAccessPath: string | null;
  fallbackUsed: boolean;
  loginCustomerId: string | null;
  customerId: string;
  errorMessage: string;
}

export function normalizeGoogleAdsCustomerId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = String(value).replace(/\D/g, "");
  return normalized.length === 10 ? normalized : null;
}

export function sanitizeGoogleAdsAccessPath(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed || null;
}

export function isDirectGoogleAdsAccessPath(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  return /^(personal|direct)$/i.test(String(value).trim());
}

export function formatGoogleAdsCustomerId(value: string | null | undefined): string {
  const normalized = normalizeGoogleAdsCustomerId(value);
  if (!normalized) {
    return value?.trim() || "";
  }

  return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}

export function normalizeGoogleAdsAccessPath(value: string | null | undefined): string | null {
  const sanitized = sanitizeGoogleAdsAccessPath(value);
  if (!sanitized) {
    return null;
  }

  if (isDirectGoogleAdsAccessPath(sanitized)) {
    return "Personal";
  }

  const managerCustomerId = normalizeGoogleAdsCustomerId(sanitized);
  return managerCustomerId ? formatGoogleAdsCustomerId(managerCustomerId) : null;
}

export function resolveGoogleAdsAccessPath(input: {
  accountId: string;
  originalAccessPath: string | null;
  fallbackLoginCustomerId?: string | null;
}): GoogleAdsResolvedAccessPath {
  const accountId = normalizeGoogleAdsCustomerId(input.accountId);
  if (!accountId) {
    throw new Error("Google Ads account ID must be a 10-digit customer ID.");
  }

  const originalAccessPath = sanitizeGoogleAdsAccessPath(input.originalAccessPath);
  if (isDirectGoogleAdsAccessPath(originalAccessPath)) {
    return {
      accountId,
      customerId: accountId,
      originalAccessPath,
      resolvedAccessPath: "Personal",
      fallbackUsed: false,
      loginCustomerId: null,
      resolutionMode: "direct",
    };
  }

  const managerFromAccessPath = normalizeGoogleAdsCustomerId(originalAccessPath);
  if (managerFromAccessPath) {
    return {
      accountId,
      customerId: accountId,
      originalAccessPath,
      resolvedAccessPath: formatGoogleAdsCustomerId(managerFromAccessPath),
      fallbackUsed: false,
      loginCustomerId: managerFromAccessPath,
      resolutionMode: "manager",
    };
  }

  const fallbackLoginCustomerId =
    normalizeGoogleAdsCustomerId(input.fallbackLoginCustomerId) ??
    DEFAULT_GOOGLE_ADS_FALLBACK_LOGIN_CUSTOMER_ID;

  return {
    accountId,
    customerId: accountId,
    originalAccessPath,
    resolvedAccessPath: formatGoogleAdsCustomerId(fallbackLoginCustomerId),
    fallbackUsed: true,
    loginCustomerId: fallbackLoginCustomerId,
    resolutionMode: "manager",
  };
}

export function formatGoogleAdsAccessPathErrorMessage(
  payload: Pick<
    GoogleAdsAccessPathErrorPayload,
    | "accountId"
    | "originalAccessPath"
    | "resolvedAccessPath"
    | "fallbackUsed"
    | "errorCode"
    | "errorMessage"
  >
): string {
  const accountLabel = formatGoogleAdsCustomerId(payload.accountId);
  const originalLabel = payload.originalAccessPath ?? "(missing)";
  const resolvedLabel = payload.resolvedAccessPath ?? "(none)";
  const fallbackLabel = payload.fallbackUsed ? "yes" : "no";
  const errorCode = payload.errorCode || "UNKNOWN";
  const errorMessage = payload.errorMessage || "Unknown Google Ads access-path failure.";

  return `Google Ads access-path resolution failed for ${accountLabel}. originalAccessPath=${originalLabel}; resolvedAccessPath=${resolvedLabel}; fallbackUsed=${fallbackLabel}; errorCode=${errorCode}; errorMessage=${errorMessage}`;
}
