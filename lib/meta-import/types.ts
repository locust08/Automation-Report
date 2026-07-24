export const META_IMPORT_MAX_FILE_BYTES = 4 * 1024 * 1024;
export const META_IMPORT_MAX_ROWS = 25_000;

export type MetaImportReportingLevel = "campaign" | "adset" | "ad" | "mixed" | "unknown";
export type MetaImportRowStatus = "valid" | "warning" | "invalid" | "duplicate";
export type MetaImportDuplicateAction = "create" | "update" | "skip";

export type MetaImportCanonicalField =
  | "accountId"
  | "accountName"
  | "campaignId"
  | "campaignName"
  | "adSetId"
  | "adSetName"
  | "adId"
  | "adName"
  | "delivery"
  | "status"
  | "objective"
  | "buyingType"
  | "budget"
  | "budgetType"
  | "reportingStart"
  | "reportingEnd"
  | "day"
  | "amountSpent"
  | "impressions"
  | "reach"
  | "frequency"
  | "linkClicks"
  | "clicks"
  | "ctr"
  | "cpc"
  | "cpm"
  | "results"
  | "resultType"
  | "costPerResult"
  | "landingPageViews"
  | "addToCart"
  | "initiateCheckout"
  | "purchases"
  | "purchaseConversionValue"
  | "roas"
  | "leads"
  | "messagingConversationsStarted";

export type MetaImportColumnMapping = Partial<Record<MetaImportCanonicalField, string>>;

export interface MetaImportIssue {
  severity: "warning" | "error";
  code: string;
  message: string;
  column?: string;
}

export interface MetaImportedRow {
  uniqueKey: string;
  source: "meta_csv";
  accountId: string;
  accountName: string | null;
  reportingLevel: Exclude<MetaImportReportingLevel, "mixed" | "unknown">;
  campaignId: string | null;
  campaignName: string | null;
  adSetId: string | null;
  adSetName: string | null;
  adId: string | null;
  adName: string | null;
  delivery: string | null;
  status: string | null;
  objective: string | null;
  buyingType: string | null;
  budget: number | null;
  budgetType: string | null;
  reportingStart: string;
  reportingEnd: string;
  amountSpent: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  linkClicks: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  results: number;
  resultType: string | null;
  costPerResult: number | null;
  landingPageViews: number;
  addToCart: number;
  initiateCheckout: number;
  purchases: number;
  purchaseConversionValue: number;
  roas: number | null;
  leads: number;
  messagingConversationsStarted: number;
  rawMetadata: Record<string, string>;
}

export interface MetaImportPreviewRow extends MetaImportedRow {
  rowNumber: number;
  validationStatus: MetaImportRowStatus;
  duplicateAction: MetaImportDuplicateAction;
  issues: MetaImportIssue[];
}

export interface MetaImportSummary {
  totalRows: number;
  validRows: number;
  warningRows: number;
  invalidRows: number;
  duplicateRows: number;
  createRows: number;
  updateRows: number;
  skipRows: number;
}

export interface MetaImportPreview {
  headers: string[];
  mapping: MetaImportColumnMapping;
  requiredFields: MetaImportCanonicalField[];
  reportingLevel: MetaImportReportingLevel;
  dateRange: { startDate: string | null; endDate: string | null };
  detectedDelimiter: string;
  rows: MetaImportPreviewRow[];
  summary: MetaImportSummary;
  file: { name: string; size: number; rowCount: number };
  fileIssues: MetaImportIssue[];
}

export interface MetaImportJob {
  id: string;
  originalFilename: string;
  accountId: string;
  importedBy: string;
  uploadedAt: string;
  completedAt: string | null;
  reportingStart: string | null;
  reportingEnd: string | null;
  reportingLevel: MetaImportReportingLevel;
  totalRows: number;
  createdRows: number;
  updatedRows: number;
  skippedRows: number;
  failedRows: number;
  status: "completed" | "failed" | "partial";
  errorSummary: string | null;
}

export interface MetaImportCommitResult {
  success: boolean;
  job: MetaImportJob;
  rowsCreated: number;
  rowsUpdated: number;
  rowsSkipped: number;
  invalidRows: number;
  errors: string[];
  reportUrl: string;
}
