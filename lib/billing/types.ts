export type BillingSectionKey =
  | "no_spend"
  | "post_billing_spend"
  | "post_billing_warning"
  | "pacing"
  | "no_conversion"
  | "cpl"
  | "score";

export interface BillingItemPayload {
  pageId: string;
  itemId?: string;
  accountKey?: string;
  url?: string;
  invoiceNo: string;
  accountName?: string;
  clientName: string;
  clientPageId?: string;
  contractStatus?: string;
  platformNames: string[];
  accountIds: string[];
  accountUrls: string[];
  startDate?: string;
  endDate?: string;
  spentPacing?: number | null;
  score?: number | null;
  cpl?: number | null;
  noSpendFlags?: string[];
  noConvFlags?: string[];
  checkedDates?: string[];
  dailySpend?: Record<string, number>;
  combinedSpend?: number;
  verificationError?: string;
}

export interface BillingChecklistItem {
  reportDate: string;
  itemKey: string;
  sectionKey: BillingSectionKey;
  payload: BillingItemPayload;
  checked: boolean;
  remark: string;
  updatedAt: string;
}

export interface BillingCompanySummary {
  companyId: string;
  companyName: string;
  platforms: string[];
  accountIds: string[];
  accountKeys: string[];
  totalIssues: number;
  unresolvedIssues: number;
  warningIssues: number;
  combinedPostBillingSpend: number;
  picName: string | null;
  items: BillingChecklistItem[];
}

export interface BillingReportResponse {
  report: {
    date: string;
    generatedAt: string;
    scannedCount: number;
    alertRowCount: number;
  } | null;
  summary: {
    companies: number;
    issues: number;
    unresolved: number;
    completed: number;
    warnings: number;
  };
  facets: {
    status: Record<string, number>;
    platform: Record<string, number>;
    category: Record<string, number>;
  };
  companies: BillingCompanySummary[];
  pagination: {
    page: number;
    pageSize: number;
    totalCompanies: number;
    totalPages: number;
  };
  picOptions: BillingPicOption[];
}

export interface BillingPicOption {
  key: string;
  name: string;
}
