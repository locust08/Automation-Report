import { PROVIDER_EXECUTION_LOCKED } from "@/lib/change-control/types";

export class ProviderExecutionLockedError extends Error {
  readonly code = PROVIDER_EXECUTION_LOCKED.error;
  readonly status = 423;
  constructor(message = PROVIDER_EXECUTION_LOCKED.message) {
    super(message);
    this.name = "ProviderExecutionLockedError";
  }
}
