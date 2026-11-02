export const bootstrapStages = ["worker_configuration", "credential_configuration", "credential_fetch", "credential_response", "credential_records", "workflow_dispatch"] as const;
export const bootstrapReasons = ["missing_configuration", "invalid_configuration", "authentication", "permission", "timeout", "network", "upstream_http", "response_size", "response_json", "response_shape", "required_record_missing", "required_record_malformed", "unexpected_failure"] as const;
export type BootstrapStage = typeof bootstrapStages[number];
export type BootstrapReason = typeof bootstrapReasons[number];

// Never attach the original error, response, credential name or value.
export class PauseBootstrapError extends Error {
  constructor(readonly stage: BootstrapStage, readonly reason: BootstrapReason, readonly httpStatus?: number) {
    super("pause_credentials_unavailable");
    this.name = "PauseBootstrapError";
  }
}

// Rebuild the payload rather than spreading error properties. Logging must not
// change the HTTP outcome, even when a logger fails.
export function reportBootstrapFailure(error: unknown, fallbackStage: BootstrapStage, started: number, correlationId: string): void {
  const typed = error instanceof PauseBootstrapError;
  const stage = typed && bootstrapStages.includes(error.stage) ? error.stage : fallbackStage;
  const reason = typed && bootstrapReasons.includes(error.reason) ? error.reason : "unexpected_failure";
  const httpStatus = typed && Number.isInteger(error.httpStatus) && error.httpStatus! >= 100 && error.httpStatus! <= 599 ? error.httpStatus : undefined;
  const elapsed = performance.now() - started;
  try {
    console.error(JSON.stringify({
      event: "m03_bootstrap_failure", stage, reason,
      duration_ms: Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : 0,
      ...(httpStatus === undefined ? {} : { http_status: httpStatus }),
      correlation_id: correlationId,
    }));
  } catch { /* Protected diagnostics never change fail-closed behavior. */ }
}
