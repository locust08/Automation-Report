import { sendDailyAdsChangeDigest } from "@/lib/ads-management/change-digest";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ success: true, ...(await sendDailyAdsChangeDigest()) });
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Daily change digest failed." }, { status: 500 });
  }
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() || process.env.WORKER_API_SECRET?.trim();
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}
