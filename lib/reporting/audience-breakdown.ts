import type {
  AudienceBreakdownRow,
  AudienceClickBreakdownDimension,
  AudienceClickBreakdownItem,
  AudienceClickBreakdownPlatform,
  AudienceClickBreakdownResponse,
  GoogleAudienceClickBreakdownResponse,
  GoogleAudienceClickBreakdownSource,
} from "./types.ts";

const AGE_ORDER = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+", "Unknown"] as const;
const GENDER_ORDER = ["Male", "Female", "Unknown"] as const;

export function createEmptyAudienceClickBreakdownResponse(): AudienceClickBreakdownResponse {
  return {
    age: [],
    gender: [],
    location: {
      country: [],
      region: [],
      city: [],
    },
  };
}

export function createEmptyGoogleAudienceClickBreakdownResponse(): GoogleAudienceClickBreakdownResponse {
  return {
    age: [],
    gender: [],
    location: {
      country: [],
      region: [],
      city: [],
    },
    sources: {
      keywords: [],
      content: [],
    },
  };
}

export function createAudienceClickBreakdownItem(input: {
  platform: AudienceClickBreakdownPlatform;
  dimension: AudienceClickBreakdownDimension;
  label: string;
  clicks: number;
}): AudienceClickBreakdownItem {
  return {
    platform: input.platform,
    dimension: input.dimension,
    label: input.label,
    clicks: input.clicks,
  };
}

export function addSourceToAudienceItems<
  TDimension extends AudienceClickBreakdownDimension,
>(
  items: AudienceClickBreakdownItem[],
  source: GoogleAudienceClickBreakdownSource,
  dimension: TDimension
): Array<{
  platform: "google";
  source: GoogleAudienceClickBreakdownSource;
  dimension: TDimension;
  label: string;
  clicks: number;
}> {
  return items.map((item) => ({
    platform: "google",
    source,
    dimension,
    label: item.label,
    clicks: item.clicks,
  }));
}

export function mergeAudienceClickBreakdownResponses(
  left: AudienceClickBreakdownResponse,
  right: AudienceClickBreakdownResponse
): AudienceClickBreakdownResponse {
  return {
    age: [...left.age, ...right.age],
    gender: [...left.gender, ...right.gender],
    location: {
      country: [...left.location.country, ...right.location.country],
      region: [...left.location.region, ...right.location.region],
      city: [...left.location.city, ...right.location.city],
    },
  };
}

export function coerceAudienceClicks(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeAudienceAgeLabel(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    return "Unknown";
  }

  const upper = normalized.toUpperCase();
  const googleMap: Record<string, string> = {
    AGE_RANGE_18_24: "18-24",
    AGE_RANGE_25_34: "25-34",
    AGE_RANGE_35_44: "35-44",
    AGE_RANGE_45_54: "45-54",
    AGE_RANGE_55_64: "55-64",
    AGE_RANGE_65_UP: "65+",
    AGE_RANGE_UNSPECIFIED: "Unknown",
    AGE_RANGE_UNDETERMINED: "Unknown",
    AGE_RANGE_UNKNOWN: "Unknown",
    UNKNOWN: "Unknown",
    UNDETERMINED: "Unknown",
    UNSPECIFIED: "Unknown",
  };
  if (googleMap[upper]) {
    return googleMap[upper];
  }

  const compact = normalized.replaceAll("_", "-");
  return AGE_ORDER.includes(compact as (typeof AGE_ORDER)[number]) ? compact : compact;
}

export function normalizeAudienceGenderLabel(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  if (!normalized) {
    return "Unknown";
  }

  const upper = normalized.toUpperCase();
  const googleMap: Record<string, string> = {
    MALE: "Male",
    FEMALE: "Female",
    GENDER_UNSPECIFIED: "Unknown",
    UNKNOWN: "Unknown",
    UNDETERMINED: "Unknown",
    UNSPECIFIED: "Unknown",
  };
  if (googleMap[upper]) {
    return googleMap[upper];
  }

  const lower = normalized.toLowerCase();
  if (lower === "male") {
    return "Male";
  }
  if (lower === "female") {
    return "Female";
  }
  return "Unknown";
}

export function normalizeAudienceLocationLabel(
  value: string | null | undefined,
  fallback = "Unknown Location"
): string {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : fallback;
}

export function aggregateAudienceItems(
  items: AudienceClickBreakdownItem[]
): AudienceClickBreakdownItem[] {
  const totals = new Map<string, AudienceClickBreakdownItem>();

  items.forEach((item) => {
    const key = `${item.platform}::${item.dimension}::${item.label.toLowerCase()}`;
    const existing = totals.get(key);
    if (existing) {
      existing.clicks += item.clicks;
      return;
    }
    totals.set(key, { ...item });
  });

  return Array.from(totals.values());
}

export function sortAudienceItems(
  items: AudienceClickBreakdownItem[],
  dimension: AudienceClickBreakdownDimension
): AudienceClickBreakdownItem[] {
  const sorted = [...items];
  sorted.sort((left, right) => {
    if (dimension === "age") {
      return audienceAgeOrder(left.label) - audienceAgeOrder(right.label);
    }
    if (dimension === "gender") {
      return audienceGenderOrder(left.label) - audienceGenderOrder(right.label);
    }
    if (right.clicks !== left.clicks) {
      return right.clicks - left.clicks;
    }
    return left.label.localeCompare(right.label);
  });
  return sorted;
}

export function summarizeAudienceItemsForChart(
  items: AudienceClickBreakdownItem[],
  dimension: AudienceClickBreakdownDimension
): AudienceBreakdownRow[] {
  const byLabel = new Map<string, number>();

  items.forEach((item) => {
    const label = item.label.trim();
    if (!label) {
      return;
    }
    byLabel.set(label, (byLabel.get(label) ?? 0) + item.clicks);
  });

  const rows = Array.from(byLabel.entries()).map(([label, clicks]) => ({ label, clicks }));

  if (dimension === "age") {
    return rows.sort((left, right) => audienceAgeOrder(left.label) - audienceAgeOrder(right.label));
  }
  if (dimension === "gender") {
    return rows.sort(
      (left, right) => audienceGenderOrder(left.label) - audienceGenderOrder(right.label)
    );
  }

  return limitLocationRowsWithOthers(rows, 10);
}

export function limitLocationRowsWithOthers(
  rows: AudienceBreakdownRow[],
  limit: number
): AudienceBreakdownRow[] {
  const sorted = [...rows].sort((left, right) => {
    if (right.clicks !== left.clicks) {
      return right.clicks - left.clicks;
    }
    return left.label.localeCompare(right.label);
  });

  if (sorted.length <= limit) {
    return sorted;
  }

  const visible = sorted.slice(0, limit);
  const remainderClicks = sorted
    .slice(limit)
    .reduce((total, row) => total + row.clicks, 0);

  return [...visible, { label: "Others", clicks: remainderClicks }];
}

export function limitAudienceItemsWithOthers(
  items: AudienceClickBreakdownItem[],
  limit: number
): AudienceClickBreakdownItem[] {
  const sorted = [...items].sort((left, right) => {
    if (right.clicks !== left.clicks) {
      return right.clicks - left.clicks;
    }
    return left.label.localeCompare(right.label);
  });

  if (sorted.length <= limit) {
    return sorted;
  }

  const visible = sorted.slice(0, limit);
  const remainderClicks = sorted
    .slice(limit)
    .reduce((total, item) => total + item.clicks, 0);
  const template = sorted[0];

  return [
    ...visible,
    {
      platform: template.platform,
      dimension: template.dimension,
      label: "Others",
      clicks: remainderClicks,
    },
  ];
}

export function audienceAgeOrder(value: string): number {
  const normalized = value.trim();
  const index = AGE_ORDER.indexOf(normalized as (typeof AGE_ORDER)[number]);
  if (index >= 0) {
    return index;
  }

  const lower = normalized.toLowerCase();
  if (lower.endsWith("+")) {
    return Number.parseInt(lower, 10) || 999;
  }
  const firstPart = lower.split("-")[0];
  return Number.parseInt(firstPart, 10) || 998;
}

export function audienceGenderOrder(value: string): number {
  const normalized = value.trim();
  const index = GENDER_ORDER.indexOf(normalized as (typeof GENDER_ORDER)[number]);
  return index >= 0 ? index : 999;
}
