import { resolveRouteAccountFallback } from "@/lib/reporting/request";

export type PreviewRoutePlatform = "meta" | "google" | "tiktok";

export function normalizePreviewPlatform(value: string | null): PreviewRoutePlatform | null {
  return value === "meta" || value === "google" || value === "tiktok" ? value : null;
}

export function getPreviewExplicitAccountIds(context: {
  metaAccountId: string | null;
  googleAccountId: string | null;
  tiktokAccountId: string | null;
}) {
  return {
    metaAccountId: context.metaAccountId,
    googleAccountId: context.googleAccountId,
    tiktokAccountId: context.tiktokAccountId,
  };
}

export function resolvePreviewRouteAccountId(
  routeAccountId: string | null,
  context: {
    accountId: string | null;
    metaAccountId: string | null;
    googleAccountId: string | null;
    tiktokAccountId: string | null;
  },
): string | null {
  return resolveRouteAccountFallback(routeAccountId, context);
}
