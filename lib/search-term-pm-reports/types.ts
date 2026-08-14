export type SearchTermPmReportSummary = {
  id: string;
  changeSetId: string;
  googleCustomerId: string;
  customerName: string;
  reportingStartDate: string | null;
  reportingEndDate: string | null;
  publishedByEmail: string;
  publishedAt: string;
  verifiedAt: string;
  itemCount: number;
  affectedCampaignCount: number;
  totalSpend: number;
  totalClicks: number;
  totalConversions: number;
  generatedAt: string;
};

export type SearchTermPmReportItem = {
  id: string;
  recommendationId: string;
  campaignName: string;
  adGroupName: string;
  searchTerm: string;
  optimizationType: string;
  negativeMatchType: string;
  classification: string;
  reason: string;
  spend: number;
  clicks: number;
  conversions: number;
};

export type SearchTermPmReport = SearchTermPmReportSummary & {
  verificationStatus: "verified";
  items: SearchTermPmReportItem[];
};

export type SearchTermPmReportList = {
  reports: SearchTermPmReportSummary[];
  accounts: Array<{ id: string; name: string }>;
  verifiedChangeSets: Array<{
    id: string;
    googleCustomerId: string;
    customerName: string;
    itemCount: number;
    verifiedAt: string;
    reportId: string | null;
  }>;
  total: number;
  limit: number;
  offset: number;
};
