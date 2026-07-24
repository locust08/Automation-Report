import type { MetaImportCanonicalField, MetaImportColumnMapping } from "@/lib/meta-import/types";

export interface MetaImportFieldDefinition {
  field: MetaImportCanonicalField;
  label: string;
  required: boolean;
  aliases: string[];
}

export const META_IMPORT_FIELD_DEFINITIONS: MetaImportFieldDefinition[] = [
  field("accountId", "Account ID", false, ["account id", "ad account id", "account_id"]),
  field("accountName", "Account name", false, ["account name", "ad account name", "account_name"]),
  field("campaignId", "Campaign ID", false, ["campaign id", "campaign_id"]),
  field("campaignName", "Campaign name", false, ["campaign name", "campaign", "campaign_name"]),
  field("adSetId", "Ad set ID", false, ["ad set id", "adset id", "adset_id"]),
  field("adSetName", "Ad set name", false, ["ad set name", "adset name", "adset_name"]),
  field("adId", "Ad ID", false, ["ad id", "ad_id"]),
  field("adName", "Ad name", false, ["ad name", "ad_name"]),
  field("delivery", "Delivery", false, ["campaign delivery", "ad set delivery", "ad delivery", "delivery", "delivery status"]),
  field("status", "Status", false, ["status", "effective status", "campaign status", "ad set status", "ad status"]),
  field("objective", "Objective", false, ["objective", "campaign objective"]),
  field("buyingType", "Buying type", false, ["buying type", "buying_type"]),
  field("budget", "Budget", false, ["budget", "campaign budget", "ad set budget"]),
  field("budgetType", "Budget type", false, ["budget type", "budget_type"]),
  field("reportingStart", "Reporting starts", false, ["reporting starts", "reporting start", "date start", "date_start", "start date"]),
  field("reportingEnd", "Reporting ends", false, ["reporting ends", "reporting end", "date stop", "date_stop", "end date"]),
  field("day", "Day", false, ["day", "date", "reporting day"]),
  field("amountSpent", "Amount spent", true, ["amount spent", "spend", "total spend", "amount_spent"]),
  field("impressions", "Impressions", true, ["impressions"]),
  field("reach", "Reach", false, ["reach"]),
  field("frequency", "Frequency", false, ["frequency"]),
  field("linkClicks", "Link clicks", false, ["link clicks", "inline link clicks", "link_clicks"]),
  field("clicks", "Clicks", true, ["clicks", "all clicks"]),
  field("ctr", "CTR", false, ["ctr (all)", "ctr", "click-through rate"]),
  field("cpc", "CPC", false, ["cpc (all)", "cpc", "cost per click"]),
  field("cpm", "CPM", false, ["cpm", "cost per 1,000 impressions", "cost per 1000 impressions"]),
  field("results", "Results", false, ["results", "result", "conversions"]),
  field("resultType", "Result type", false, ["result type", "result indicator", "result_type"]),
  field("costPerResult", "Cost per result", false, ["cost per results", "cost per result", "cost/result", "cost_per_result"]),
  field("landingPageViews", "Landing page views", false, ["landing page views", "landing_page_views"]),
  field("addToCart", "Add to cart", false, ["adds to cart", "add to cart", "add_to_cart"]),
  field("initiateCheckout", "Initiate checkout", false, ["checkouts initiated", "initiate checkout", "initiated checkout"]),
  field("purchases", "Purchases", false, ["purchases", "purchase"]),
  field("purchaseConversionValue", "Purchase conversion value", false, ["purchase conversion value", "purchase value", "conversion value"]),
  field("roas", "ROAS", false, ["purchase roas", "roas", "return on ad spend"]),
  field("leads", "Leads", false, ["leads", "lead"]),
  field("messagingConversationsStarted", "Messaging conversations started", false, ["messaging conversations started", "new messaging connections", "messaging conversations"]),
];

export const META_IMPORT_REQUIRED_FIELDS = META_IMPORT_FIELD_DEFINITIONS.filter((item) => item.required).map(
  (item) => item.field
);

export function detectMetaImportMapping(headers: string[]): MetaImportColumnMapping {
  const normalizedHeaders = headers.map((header) => ({ header, normalized: normalizeHeader(header) }));
  const mapping: MetaImportColumnMapping = {};

  for (const definition of META_IMPORT_FIELD_DEFINITIONS) {
    const aliases = definition.aliases.map(normalizeHeader);
    const exact = aliases.map((alias) => normalizedHeaders.find((candidate) => candidate.normalized === alias)).find(Boolean);
    const fuzzy = exact ?? findMostSpecificPrefixMatch(normalizedHeaders, aliases);
    if (fuzzy) {
      mapping[definition.field] = fuzzy.header;
    }
  }

  return mapping;
}

export function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*\([^)]*(?:attribution|click|view)[^)]*\)\s*/g, " ")
    .trim();
}

function findMostSpecificPrefixMatch(
  headers: Array<{ header: string; normalized: string }>,
  aliases: string[]
): { header: string; normalized: string } | undefined {
  return headers
    .map((candidate) => ({
      candidate,
      specificity: Math.max(
        0,
        ...aliases
          .filter((alias) => candidate.normalized.startsWith(`${alias} `))
          .map((alias) => alias.length)
      ),
    }))
    .filter((match) => match.specificity > 0)
    .sort((left, right) => right.specificity - left.specificity)[0]?.candidate;
}

function field(
  fieldName: MetaImportCanonicalField,
  label: string,
  required: boolean,
  aliases: string[]
): MetaImportFieldDefinition {
  return { field: fieldName, label, required, aliases };
}
