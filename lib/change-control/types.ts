export type M03Platform = "google" | "meta" | "tiktok";

export type M03ChangeItemInput = {
  entity_type: string;
  entity_identity: string;
  field_path: string;
  baseline_value: unknown;
  proposed_value: unknown;
  evidence?: Record<string, unknown>;
};

export type M03MockChangeRequestInput = {
  platform: M03Platform;
  workflow_mode: "mock";
  title: string;
  reason: string;
  client_id?: string | null;
  account_identity: string;
  campaign_identity: string;
  source_m04_plan_id?: number | null;
  source_m04_revision_id?: number | null;
  items: M03ChangeItemInput[];
  idempotency_key: string;
};

export interface FutureM03ProviderAdapter {
  readonly platform: M03Platform;
  readonly enabled: false;
  publish(): Promise<never>;
  verify(): Promise<never>;
}

export const PROVIDER_EXECUTION_LOCKED = {
  error: "provider_execution_locked",
  message: "Provider execution is outside this dashboard-only phase.",
} as const;
