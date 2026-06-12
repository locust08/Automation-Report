import {
  DEFAULT_NETWORK,
  DEFAULT_TARGET_LOCATION,
  MEDIA_PLAN_LIMITS,
  MEDIA_PLAN_PROMPT_VARIABLE_DEFAULTS,
  MediaPlan,
  MediaPlanAdGroup,
  MediaPlanKeyword,
  MediaPlanSitelink,
} from "@/lib/media-plan/schema";

export const GOOGLE_AD_GROUP_SETUP_DATA_SOURCE_ID =
  "collection://6bd2bd23-2361-4b0d-bac7-6eaea2ce85b9";

export const GOOGLE_AD_GROUP_SETUP_PROPERTIES = [
  "01 Ad Group Name",
  "04 Brand / Client Name",
  "05 Campaign Name",
  "06 Campaign Objective",
  "07 Campaign Type",
  "08 Bidding Strategy",
  "09 Website URL",
  "10 Final URL",
  "11 Start Date",
  "12 Average Daily Budget",
  "13 Target CPA",
  "14 Network",
  "15 Network Notes",
  "16 Target Location",
  "17 Language",
  "18 Keyword 1",
  "19 Keyword 2",
  "20 Keyword 3",
  "21 Keyword 4",
  "22 Keyword 5",
  "23 Keyword 6",
  "24 Keyword 7",
  "25 Keyword 8",
  "26 Keyword 9",
  "27 Keyword 10",
  "28 Display Path 1",
  "29 Display Path 2",
  "30 Headline 1",
  "31 Headline 2",
  "32 Headline 3",
  "33 Headline 4",
  "34 Headline 5",
  "35 Headline 6",
  "36 Headline 7",
  "37 Headline 8",
  "38 Headline 9",
  "39 Headline 10",
  "40 Headline 11",
  "41 Headline 12",
  "42 Headline 13",
  "43 Headline 14",
  "44 Headline 15",
  "45 Description 1",
  "46 Description 2",
  "47 Description 3",
  "48 Description 4",
  "49 Business Name",
  "53 Sitelink 1 Title",
  "54 Sitelink 1 URL",
  "55 Sitelink 2 Title",
  "56 Sitelink 2 URL",
  "57 Sitelink 3 Title",
  "58 Sitelink 3 URL",
  "59 Sitelink 4 Title",
  "60 Sitelink 4 URL",
  "61 Sitelink 5 Title",
  "62 Sitelink 5 URL",
  "63 Sitelink 6 Title",
  "64 Sitelink 6 URL",
  "65 Status",
  "67 Missing Info",
  "69 Setup Notes",
  "70 Review Notes",
] as const;

export type GoogleAdGroupSetupPropertyName =
  (typeof GOOGLE_AD_GROUP_SETUP_PROPERTIES)[number];

export type NotionMapperValue = string | string[] | number | boolean | null;

export interface MappedGoogleAdGroupSetupRow {
  adGroupName: string;
  properties: Record<GoogleAdGroupSetupPropertyName, NotionMapperValue>;
}

export interface MapMediaPlanToNotionRowsInput {
  mediaPlan: MediaPlan;
  googleCid: string;
  batchId: string;
  source: "media-plan";
  createdAt: string;
  clientRequestId?: string;
}

const KEYWORD_PROPERTIES = [
  "18 Keyword 1",
  "19 Keyword 2",
  "20 Keyword 3",
  "21 Keyword 4",
  "22 Keyword 5",
  "23 Keyword 6",
  "24 Keyword 7",
  "25 Keyword 8",
  "26 Keyword 9",
  "27 Keyword 10",
] as const;

const HEADLINE_PROPERTIES = [
  "30 Headline 1",
  "31 Headline 2",
  "32 Headline 3",
  "33 Headline 4",
  "34 Headline 5",
  "35 Headline 6",
  "36 Headline 7",
  "37 Headline 8",
  "38 Headline 9",
  "39 Headline 10",
  "40 Headline 11",
  "41 Headline 12",
  "42 Headline 13",
  "43 Headline 14",
  "44 Headline 15",
] as const;

const DESCRIPTION_PROPERTIES = [
  "45 Description 1",
  "46 Description 2",
  "47 Description 3",
  "48 Description 4",
] as const;

const SITELINK_PROPERTIES = [
  ["53 Sitelink 1 Title", "54 Sitelink 1 URL"],
  ["55 Sitelink 2 Title", "56 Sitelink 2 URL"],
  ["57 Sitelink 3 Title", "58 Sitelink 3 URL"],
  ["59 Sitelink 4 Title", "60 Sitelink 4 URL"],
  ["61 Sitelink 5 Title", "62 Sitelink 5 URL"],
  ["63 Sitelink 6 Title", "64 Sitelink 6 URL"],
] as const;

export function mapMediaPlanToNotionRows(
  input: MapMediaPlanToNotionRowsInput
): MappedGoogleAdGroupSetupRow[] {
  return input.mediaPlan.adGroups.map((adGroup) => ({
    adGroupName: adGroup.adGroupName,
    properties: {
      ...emptyPropertyMap(),
      ...buildCampaignProperties(input),
      ...buildAdGroupProperties(adGroup),
    },
  }));
}

export function formatMediaPlanBatchId(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    "MP-",
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

export function normalizeNotionDataSourceId(value: string): string {
  return value.trim().replace(/^collection:\/\//, "");
}

export function formatKeywordForNotion(keyword: MediaPlanKeyword): string {
  const text = stripKeywordMatchDecorators(keyword.text.trim());
  if (!text) {
    return "";
  }

  if (keyword.matchType === "PHRASE") {
    return `"${text}"`;
  }
  if (keyword.matchType === "EXACT") {
    return `[${text}]`;
  }
  return text;
}

function buildCampaignProperties(
  input: MapMediaPlanToNotionRowsInput
): Partial<Record<GoogleAdGroupSetupPropertyName, NotionMapperValue>> {
  const campaign = input.mediaPlan.campaign;
  const campaignObjective = campaign.campaignObjective || "Leads";
  const biddingStrategy = campaign.biddingStrategy || "Conversions";
  const targetLocation =
    campaign.targetLocation.length > 0 ? campaign.targetLocation : [DEFAULT_TARGET_LOCATION];
  const setupNotes = buildSetupNotes(input);
  const reviewNotes = buildReviewNotes(input);

  return {
    "04 Brand / Client Name": campaign.brandOrClientName,
    "05 Campaign Name": campaign.campaignName,
    "06 Campaign Objective": campaignObjective,
    "07 Campaign Type": "Search",
    "08 Bidding Strategy": biddingStrategy,
    "09 Website URL": campaign.websiteUrl,
    "10 Final URL": campaign.finalUrl,
    "11 Start Date": campaign.startDate,
    "12 Average Daily Budget": campaign.averageDailyBudget,
    "13 Target CPA": campaign.targetCPA,
    "14 Network": [DEFAULT_NETWORK],
    "15 Network Notes": campaign.networkNotes,
    "16 Target Location": targetLocation,
    "17 Language": campaign.language,
    "49 Business Name": campaign.businessName,
    "65 Status": "Ready for Setup",
    "67 Missing Info": false,
    "69 Setup Notes": setupNotes,
    "70 Review Notes": reviewNotes,
  };
}

function buildAdGroupProperties(
  adGroup: MediaPlanAdGroup
): Partial<Record<GoogleAdGroupSetupPropertyName, NotionMapperValue>> {
  const properties: Partial<Record<GoogleAdGroupSetupPropertyName, NotionMapperValue>> = {
    "01 Ad Group Name": adGroup.adGroupName,
    "28 Display Path 1": adGroup.displayPath1,
    "29 Display Path 2": adGroup.displayPath2,
  };

  adGroup.keywords
    .slice(0, MEDIA_PLAN_LIMITS.keywords)
    .map(formatKeywordForNotion)
    .forEach((keyword, index) => {
      properties[KEYWORD_PROPERTIES[index]] = keyword;
    });

  adGroup.headlines.slice(0, 15).forEach((headline, index) => {
    properties[HEADLINE_PROPERTIES[index]] = headline;
  });

  adGroup.descriptions.slice(0, 4).forEach((description, index) => {
    properties[DESCRIPTION_PROPERTIES[index]] = description;
  });

  validSitelinks(adGroup.sitelinks)
    .slice(0, MEDIA_PLAN_LIMITS.sitelinks)
    .forEach((sitelink, index) => {
      const [titleProperty, urlProperty] = SITELINK_PROPERTIES[index];
      properties[titleProperty] = sitelink.title;
      properties[urlProperty] = sitelink.url;
    });

  return properties;
}

function emptyPropertyMap(
  values: Partial<Record<GoogleAdGroupSetupPropertyName, NotionMapperValue>> = {}
): Record<GoogleAdGroupSetupPropertyName, NotionMapperValue> {
  return GOOGLE_AD_GROUP_SETUP_PROPERTIES.reduce(
    (acc, property) => {
      acc[property] = values[property] ?? "";
      return acc;
    },
    {} as Record<GoogleAdGroupSetupPropertyName, NotionMapperValue>
  );
}

function buildSetupNotes(input: MapMediaPlanToNotionRowsInput): string {
  const notes = input.mediaPlan.planningNotes;
  return [
    `MediaPlanBatch: ${input.batchId}`,
    `Source: ${input.source}`,
    `GoogleCID: ${input.googleCid}`,
    "CreatedFrom: Ads Dashboard Media Plan",
    `OpenAIPromptID: ${process.env.OPENAI_MEDIA_PLAN_PROMPT_ID?.trim() || "pmpt_6a2a1ad15e148190af2a58292b6e6186085ff75e3c6e2cf6"}`,
    `CreatedAt: ${input.createdAt}`,
    input.clientRequestId ? `ClientRequestID: ${input.clientRequestId}` : null,
    `PromptDefaults: ${MEDIA_PLAN_PROMPT_VARIABLE_DEFAULTS.defaultCampaignStatus}`,
    notes.strategy ? `Strategy: ${notes.strategy}` : null,
    notes.assumptions.length > 0 ? `Assumptions: ${notes.assumptions.join("; ")}` : null,
    notes.warnings.length > 0 ? `Warnings: ${notes.warnings.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildReviewNotes(input: MapMediaPlanToNotionRowsInput): string {
  return [
    `MediaPlanBatch: ${input.batchId}`,
    input.clientRequestId ? `ClientRequestID: ${input.clientRequestId}` : null,
    "Approved from dashboard, waiting for Google Ads setup.",
  ]
    .filter(Boolean)
    .join("\n");
}

function validSitelinks(sitelinks: MediaPlanSitelink[]): MediaPlanSitelink[] {
  return sitelinks.filter((sitelink) => {
    if (!sitelink.title.trim() || !sitelink.url.trim()) {
      return false;
    }
    try {
      const parsed = new URL(sitelink.url);
      return ["http:", "https:"].includes(parsed.protocol);
    } catch {
      return false;
    }
  });
}

function stripKeywordMatchDecorators(value: string): string {
  return value
    .replace(/^"+|"+$/g, "")
    .replace(/^\[|\]$/g, "")
    .trim();
}
