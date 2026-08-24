export type CampaignDetailColumn = { key: string; label: string; value: string };

export function flattenCampaignDetail(value: Record<string, unknown>): CampaignDetailColumn[] {
  const columns: CampaignDetailColumn[] = [];
  for (const [key, item] of Object.entries(value)) flattenValue(key, [humanize(key)], item, columns);
  return columns;
}

function flattenValue(key: string, labels: string[], value: unknown, columns: CampaignDetailColumn[]) {
  if (Array.isArray(value)) {
    columns.push({ key, label: labels.join(" · "), value: value.map(compactValue).join(" | ") || "—" });
    return;
  }
  if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) flattenValue(`${key}.${childKey}`, [...labels, humanize(childKey)], childValue, columns);
    return;
  }
  columns.push({ key, label: labels.join(" · "), value: displayValue(value) });
}

function compactValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(compactValue).join(", ");
  if (value && typeof value === "object") return Object.entries(value).map(([key, item]) => `${humanize(key)}: ${compactValue(item)}`).join(" · ");
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return humanize(String(value));
}

function humanize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
