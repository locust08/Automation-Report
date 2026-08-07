interface DisplaySitelink {
  id?: unknown;
  assetResourceName?: unknown;
  linkText?: unknown;
  description1?: unknown;
  description2?: unknown;
  finalUrls?: unknown;
  finalMobileUrls?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  scope?: unknown;
  associations?: unknown;
}

export function formatSitelinkAuditValue(value: unknown) {
  if (!Array.isArray(value) || !value.length) return "No sitelinks";
  return value.map((candidate, index) => {
    const sitelink = candidate as DisplaySitelink;
    const lines = [
      `${index + 1}. ${text(sitelink.linkText) || "Untitled sitelink"}`,
      `   Final URL: ${list(sitelink.finalUrls) || "—"}`,
      `   Description line 1: ${text(sitelink.description1) || "—"}`,
      `   Description line 2: ${text(sitelink.description2) || "—"}`,
    ];
    const mobileUrls = list(sitelink.finalMobileUrls);
    if (mobileUrls) lines.push(`   Mobile URL: ${mobileUrls}`);
    if (text(sitelink.startDate)) lines.push(`   Start date: ${text(sitelink.startDate)}`);
    if (text(sitelink.endDate)) lines.push(`   End date: ${text(sitelink.endDate)}`);
    const scopes = sitelinkScopes(sitelink);
    if (scopes.length) lines.push(`   Scope: ${scopes.map(scopeLabel).join(", ")}`);
    return lines.join("\n");
  }).join("\n\n");
}

export function formatFocusedSitelinkAuditValue(baselineValue: unknown, proposedValue: unknown, displayValue: unknown) {
  const baseline = Array.isArray(baselineValue) ? baselineValue as DisplaySitelink[] : [];
  const proposed = Array.isArray(proposedValue) ? proposedValue as DisplaySitelink[] : [];
  const displayed = Array.isArray(displayValue) ? displayValue as DisplaySitelink[] : [];
  const before = new Map(baseline.map((item) => [sitelinkKey(item), item]));
  const after = new Map(proposed.map((item) => [sitelinkKey(item), item]));
  const relevant: Array<{ before?: DisplaySitelink; after?: DisplaySitelink; fields: string[] }> = [];

  for (const item of proposed) {
    const original = before.get(sitelinkKey(item));
    if (!original) relevant.push({ after: item, fields: allSitelinkFields(item) });
    else {
      const fields = changedSitelinkFields(original, item);
      if (fields.length) relevant.push({ before: original, after: item, fields });
    }
  }
  for (const item of baseline) {
    if (!after.has(sitelinkKey(item))) relevant.push({ before: item, fields: allSitelinkFields(item) });
  }

  const sections = relevant.flatMap((change) => {
    const displayedItem = findDisplayedSitelink(displayed, change.before, change.after);
    if (!displayedItem) return [];
    const lines = [`${text(displayedItem.linkText) || "Untitled sitelink"}`];
    for (const field of change.fields) lines.push(`   ${fieldLabel(field)}: ${fieldValue(displayedItem, field) || "—"}`);
    return [lines.join("\n")];
  });
  return sections.join("\n\n") || "—";
}

export function formatSitelinkCompletionValue(value: unknown) {
  if (!Array.isArray(value) || !value.length) return "none";
  return value.map((candidate) => {
    const sitelink = candidate as DisplaySitelink;
    const details = [
      list(sitelink.finalUrls) ? `URL: ${list(sitelink.finalUrls)}` : "",
      text(sitelink.description1) ? `Description 1: ${text(sitelink.description1)}` : "",
      text(sitelink.description2) ? `Description 2: ${text(sitelink.description2)}` : "",
    ].filter(Boolean);
    return `${text(sitelink.linkText) || "Sitelink"}${details.length ? ` [${details.join("; ")}]` : ""}`;
  }).join(" | ");
}

export function summarizeSitelinkChanges(baselineValue: unknown, proposedValue: unknown) {
  const baseline = Array.isArray(baselineValue) ? baselineValue as DisplaySitelink[] : [];
  const proposed = Array.isArray(proposedValue) ? proposedValue as DisplaySitelink[] : [];
  const before = new Map(baseline.map((item) => [sitelinkKey(item), item]));
  const after = new Map(proposed.map((item) => [sitelinkKey(item), item]));
  const changes: string[] = [];

  for (const item of proposed) {
    const original = before.get(sitelinkKey(item));
    const label = text(item.linkText) || "Untitled sitelink";
    if (!original) changes.push(`Added “${label}”`);
    else {
      const fields = changedSitelinkFields(original, item);
      if (fields.length) changes.push(`Edited “${label}” (${fields.join(", ")})`);
    }
  }
  for (const item of baseline) {
    if (!after.has(sitelinkKey(item))) changes.push(`Removed “${text(item.linkText) || "Untitled sitelink"}”`);
  }
  return changes.join(" · ") || "Association update";
}

function changedSitelinkFields(before: DisplaySitelink, after: DisplaySitelink) {
  const fields: Array<[string, unknown, unknown]> = [
    ["link text", text(before.linkText), text(after.linkText)],
    ["final URL", list(before.finalUrls), list(after.finalUrls)],
    ["description line 1", text(before.description1), text(after.description1)],
    ["description line 2", text(before.description2), text(after.description2)],
    ["mobile URL", list(before.finalMobileUrls), list(after.finalMobileUrls)],
    ["start date", text(before.startDate), text(after.startDate)],
    ["end date", text(before.endDate), text(after.endDate)],
    ["scope", sitelinkScopes(before).sort().join("|"), sitelinkScopes(after).sort().join("|")],
  ];
  return fields.filter(([, left, right]) => left !== right).map(([label]) => label);
}

function allSitelinkFields(item: DisplaySitelink) {
  return ["link text", "final URL", "description line 1", "description line 2", "mobile URL", "start date", "end date", "scope"]
    .filter((field) => field === "link text" || field === "final URL" || fieldValue(item, field));
}

function findDisplayedSitelink(displayed: DisplaySitelink[], before?: DisplaySitelink, after?: DisplaySitelink) {
  const keys = [before, after].filter((item): item is DisplaySitelink => Boolean(item)).map(sitelinkKey);
  const labels = [before, after].filter((item): item is DisplaySitelink => Boolean(item)).map((item) => text(item.linkText)).filter(Boolean);
  return displayed.find((item) => keys.includes(sitelinkKey(item)))
    ?? displayed.find((item) => labels.includes(text(item.linkText)));
}

function fieldLabel(field: string) {
  return field === "link text" ? "Link text" : field === "final URL" ? "Final URL" : field === "mobile URL" ? "Mobile URL" : field[0].toUpperCase() + field.slice(1);
}

function fieldValue(item: DisplaySitelink, field: string) {
  if (field === "link text") return text(item.linkText);
  if (field === "final URL") return list(item.finalUrls);
  if (field === "description line 1") return text(item.description1);
  if (field === "description line 2") return text(item.description2);
  if (field === "mobile URL") return list(item.finalMobileUrls);
  if (field === "start date") return text(item.startDate);
  if (field === "end date") return text(item.endDate);
  if (field === "scope") return sitelinkScopes(item).map(scopeLabel).join(", ");
  return "";
}

function sitelinkKey(item: DisplaySitelink) {
  return text(item.id) || text(item.assetResourceName) || `${text(item.linkText)}|${list(item.finalUrls)}`;
}

function sitelinkScopes(item: DisplaySitelink) {
  if (Array.isArray(item.associations)) {
    const scopes = item.associations.map((association) => text((association as { scope?: unknown }).scope)).filter(Boolean);
    if (scopes.length) return Array.from(new Set(scopes));
  }
  return text(item.scope) ? [text(item.scope)] : [];
}

function scopeLabel(value: string) {
  if (value === "customer") return "Account";
  if (value === "ad_group") return "Ad group";
  return value === "campaign" ? "Campaign" : value.replaceAll("_", " ");
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function list(value: unknown) { return Array.isArray(value) ? value.map(text).filter(Boolean).join(", ") : ""; }
