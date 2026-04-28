interface Env {
  CRON_SECRET: string;
  VERCEL_MONTHLY_REPORT_ENDPOINT: string;
}

interface ScheduledController {
  cron: string;
  scheduledTime: number;
  type: "scheduled";
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const JOB_NAME = "monthly-report";
const JOB_SOURCE = "cloudflare-cron";

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledJob(controller, env));
  },

  async fetch(): Promise<Response> {
    return new Response(
      JSON.stringify({
        ok: true,
        service: "ads-dashboard-monthly-report-cron",
        scheduledTestUrl: "/__scheduled?cron=0+1+5+*+*",
      }),
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      }
    );
  },
};

async function runScheduledJob(controller: ScheduledController, env: Env): Promise<void> {
  const endpoint = readRequiredEnv(env.VERCEL_MONTHLY_REPORT_ENDPOINT, "VERCEL_MONTHLY_REPORT_ENDPOINT");
  const secret = readRequiredEnv(env.CRON_SECRET, "CRON_SECRET");

  console.log(
    `[monthly-report-cron] scheduled trigger started cron=${controller.cron} scheduled_time=${new Date(
      controller.scheduledTime
    ).toISOString()}`
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: JOB_SOURCE,
      job: JOB_NAME,
    }),
  });

  const responseSummary = await buildSafeResponseSummary(response);

  if (!response.ok) {
    console.error(
      `[monthly-report-cron] request failed status=${response.status} summary=${responseSummary}`
    );
    throw new Error(`Monthly report trigger failed with status ${response.status}.`);
  }

  console.log(
    `[monthly-report-cron] request succeeded status=${response.status} summary=${responseSummary}`
  );
}

async function buildSafeResponseSummary(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  const bodyText = await response.text().catch(() => "");

  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(bodyText) as Record<string, unknown>;
      const summary = {
        total_found: parsed.total_found,
        processed: parsed.processed,
        sent: parsed.sent,
        failed: parsed.failed,
        skipped: parsed.skipped,
        error: parsed.error,
      };

      return JSON.stringify(summary);
    } catch {
      return truncate(bodyText);
    }
  }

  return truncate(bodyText);
}

function truncate(value: string, maxLength = 300): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "(empty)";
  }

  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

function readRequiredEnv(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Missing required Worker binding ${name}.`);
  }

  return trimmed;
}
