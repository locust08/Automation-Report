import { Resend } from "resend";

const DEFAULT_FROM_ADDRESS = "LOCUS-T Reports <reports@locus-t.com.my>";

export type OptimizationLifecycleStatus = "running" | "completed" | "failed";

type LifecycleEmailInput = {
  status: OptimizationLifecycleStatus;
  runId: string;
  accountName: string;
  googleCustomerId: string;
  scheduledFor: string;
  termsProcessed?: number;
  batchesCompleted?: number;
  error?: string;
};

function requiredTestRecipient() {
  const recipient =
    process.env.OPTIMIZATION_SCHEDULE_TEST_RECIPIENT?.trim() ||
    process.env.MONTHLY_REPORT_TEST_RECIPIENT?.trim();

  if (!recipient) {
    throw new Error(
      "Set OPTIMIZATION_SCHEDULE_TEST_RECIPIENT or MONTHLY_REPORT_TEST_RECIPIENT before sending optimization lifecycle emails."
    );
  }

  return recipient;
}

function malaysiaDateTime(value: string) {
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendOptimizationLifecycleEmail(input: LifecycleEmailInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");

  const recipient = requiredTestRecipient();
  const from =
    process.env.RESEND_FROM_OPTIMIZATION?.trim() ||
    process.env.RESEND_FROM_MONTHLY_REPORT?.trim() ||
    DEFAULT_FROM_ADDRESS;
  const label =
    input.status === "running"
      ? "Analysis started"
      : input.status === "completed"
        ? "Analysis completed"
        : "Analysis failed";
  const color = input.status === "failed" ? "#b91c1c" : input.status === "completed" ? "#047857" : "#1d4ed8";
  const detailRows = [
    ["Account", input.accountName],
    ["Google Ads CID", input.googleCustomerId],
    ["Scheduled for", `${malaysiaDateTime(input.scheduledFor)} (Malaysia)`],
    ["Run ID", input.runId],
  ];

  if (input.status !== "running") {
    detailRows.push(["Terms processed", String(input.termsProcessed ?? 0)]);
    detailRows.push(["Batches completed", String(input.batchesCompleted ?? 0)]);
  }
  if (input.error) detailRows.push(["Error", input.error]);

  const response = await new Resend(apiKey).emails.send({
    from,
    to: [recipient],
    subject: `[TEST] ${label} - ${input.accountName}`,
    html: `
      <div style="background:#f5f5f5;padding:24px;font-family:Arial,sans-serif;color:#171717">
        <div style="max-width:620px;margin:auto;background:#fff;border:1px solid #e5e5e5;border-radius:14px;overflow:hidden">
          <div style="padding:20px 24px;background:${color};color:#fff">
            <div style="font-size:12px;font-weight:700;letter-spacing:.08em">TEST NOTIFICATION</div>
            <h1 style="margin:6px 0 0;font-size:24px">${escapeHtml(label)}</h1>
          </div>
          <div style="padding:22px 24px">
            <p style="margin:0 0 18px;line-height:1.5">A scheduled search-term optimization analysis changed status.</p>
            <table style="width:100%;border-collapse:collapse">
              ${detailRows
                .map(
                  ([key, value]) =>
                    `<tr><td style="padding:8px 12px 8px 0;color:#737373;vertical-align:top">${escapeHtml(key)}</td><td style="padding:8px 0;font-weight:600">${escapeHtml(value)}</td></tr>`
                )
                .join("")}
            </table>
            <p style="margin:18px 0 0;color:#737373;font-size:12px">This temporary test notification was sent only to the configured test recipient.</p>
          </div>
        </div>
      </div>`,
  });

  if (response.error) throw new Error(response.error.message || "Resend email send failed.");
  return response.data?.id ?? null;
}

export async function sendOptimizationLifecycleEmailSafely(input: LifecycleEmailInput) {
  try {
    const id = await sendOptimizationLifecycleEmail(input);
    console.info(`[optimization-scheduling] lifecycle email sent run_id=${input.runId} status=${input.status} resend_email_id=${id ?? "missing"}`);
  } catch (error) {
    console.error(
      `[optimization-scheduling] lifecycle email failed run_id=${input.runId} status=${input.status}`,
      error
    );
  }
}
