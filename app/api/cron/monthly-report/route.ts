import {
  parseBooleanEnv,
  parseTargetList,
  type MonthlyReportTargetConfig,
} from "@/src/lib/cron/monthly-report-targets";
import { runMonthlyReportJob } from "@/src/lib/cron/run-monthly-report-job";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ message: "CRON ENDPOINT LIVE" });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json(
      {
        success: false,
        error: "Unauthorized",
      },
      { status: 401 }
    );
  }

  try {
    console.log("Monthly report cron triggered");
    const body = (await safeReadJson(request)) as
      | {
          forceTestMode?: boolean | string;
          forceDryRun?: boolean | string;
          overrideTargets?: MonthlyReportTargetConfig[];
          overrideTargetsJson?: string;
        }
      | null;
    const result = await runMonthlyReportJob({
      forceTestMode: parseOptionalBoolean(body?.forceTestMode),
      forceDryRun: parseOptionalBoolean(body?.forceDryRun),
      overrideTargets:
        Array.isArray(body?.overrideTargets)
          ? body.overrideTargets
          : parseTargetList(typeof body?.overrideTargetsJson === "string" ? body.overrideTargetsJson : undefined),
    });

    return Response.json({
      success: true,
      message: "CRON STARTED",
      result,
    });
  } catch (error) {
    console.error("CRON ERROR", error);

    return Response.json(
      {
        success: false,
        error: "Internal error",
      },
      { status: 500 }
    );
  }
}

function isAuthorized(request: Request): boolean {
  const expectedSecret =
    process.env.CRON_SECRET?.trim() || process.env.REPORT_AUTOMATION_SECRET?.trim();

  if (!expectedSecret) {
    return false;
  }

  const authorization = request.headers.get("authorization") ?? "";
  return authorization === `Bearer ${expectedSecret}`;
}

function parseOptionalBoolean(value: boolean | string | undefined): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return parseBooleanEnv(value);
  }
  return undefined;
}

async function safeReadJson(request: Request): Promise<unknown> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return null;
    }

    return await request.json();
  } catch {
    return null;
  }
}
