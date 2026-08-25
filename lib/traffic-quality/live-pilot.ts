import type { AdsChangeSetRecord, AdsFieldChangeRecord } from "@/lib/ads-management/types";

const LOCKED_MESSAGE = "Provider publishing is disabled until the approved M01 live-pilot change set is explicitly configured.";

export class M01LivePilotLockedError extends Error {
  readonly code = "provider_execution_locked";

  constructor(message = LOCKED_MESSAGE) {
    super(message);
    this.name = "M01LivePilotLockedError";
  }
}

export function assertM01LivePilotAllowed(changeSet: AdsChangeSetRecord, configuredId = process.env.M01_LIVE_PILOT_CHANGE_SET_ID?.trim()) {
  if (!configuredId || changeSet.id !== configuredId) throw new M01LivePilotLockedError();
  if (changeSet.source_module !== "M01") throw new M01LivePilotLockedError("Only an M01-originated request can use the live pilot gate.");

  const changes = changeSet.ads_field_changes ?? [];
  if (changes.length !== 1 || !isExactNegativeKeyword(changes[0])) {
    throw new M01LivePilotLockedError("The M01 live pilot permits exactly one exact-match negative keyword.");
  }
}

function isExactNegativeKeyword(change: AdsFieldChangeRecord) {
  if (change.value_type !== "negative_keyword") return false;
  if (!(["campaign_negative_keyword", "ad_group_negative_keyword"] as string[]).includes(change.entity_type)) return false;
  if (!isRecord(change.proposed_value)) return false;
  return change.proposed_value.negative === true
    && String(change.proposed_value.matchType ?? "").toUpperCase() === "EXACT"
    && String(change.proposed_value.text ?? "").trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
