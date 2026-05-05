export type ReportLoadingKind =
  | "overall"
  | "preview"
  | "campaign"
  | "adGroup"
  | "ad"
  | "dashboard"
  | "download"
  | "keywords"
  | "auction"
  | "insights"
  | "fallback";

export interface ReportLoadingDefinition {
  kind: ReportLoadingKind;
  title: string;
  description: string;
  supportMessages: readonly string[];
  steps: readonly string[];
  icon: "layers" | "hierarchy" | "lineChart" | "search" | "layout" | "megaphone" | "gauge";
  longWaitTitle: string;
  longWaitMessage: string;
  errorTitle: string;
  successTitle: string;
  successMessage: string;
}

const REPORT_LOADING_DEFINITIONS: Record<ReportLoadingKind, ReportLoadingDefinition> = {
  overall: {
    kind: "overall",
    title: "Preparing your overall report...",
    description: "Loading live Google Ads and Meta Ads hierarchy...",
    supportMessages: [
      "Validating connected account access and report filters.",
      "Collecting source data across the selected reporting window.",
      "Normalizing metrics into the shared reporting structure.",
      "Assembling your final overview for the current selection.",
    ],
    steps: [
      "Validating access",
      "Collecting data",
      "Normalizing metrics",
      "Assembling the view",
    ],
    icon: "layers",
    longWaitTitle: "Still preparing the overall report...",
    longWaitMessage:
      "This request can take longer when platform APIs are busy or the account returns a large result set.",
    errorTitle: "Unable to prepare the overall report",
    successTitle: "Your report is ready",
    successMessage: "Google Ads and Meta Ads data loaded successfully.",
  },
  preview: {
    kind: "preview",
    title: "Preparing the preview details...",
    description: "Loading campaign, ad group, and ad structure...",
    supportMessages: [
      "Validating access to the selected reporting accounts.",
      "Loading campaign hierarchy and preview-ready metadata.",
      "Aligning the selected campaign and ad group details.",
      "Finalizing the read-only preview view.",
    ],
    steps: [
      "Validating access",
      "Loading hierarchy",
      "Aligning preview",
      "Finalizing view",
    ],
    icon: "hierarchy",
    longWaitTitle: "Still preparing the preview details...",
    longWaitMessage:
      "Preview assembly can take longer when hierarchy data needs additional lookups across platforms.",
    errorTitle: "Unable to prepare the preview details",
    successTitle: "Preview is ready",
    successMessage: "Campaign, ad group, and ad details are ready to view.",
  },
  campaign: {
    kind: "campaign",
    title: "Loading campaign insights...",
    description: "Comparing selected campaign performance across the reporting period...",
    supportMessages: [
      "Resolving the selected campaign and active platform filters.",
      "Collecting current and previous comparison rows.",
      "Calculating deltas and comparison totals.",
      "Building the campaign performance view.",
    ],
    steps: [
      "Resolving campaign",
      "Collecting totals",
      "Comparing periods",
      "Building the view",
    ],
    icon: "lineChart",
    longWaitTitle: "Still loading campaign insights...",
    longWaitMessage:
      "Campaign comparisons may take longer when multiple periods and large result sets need to be matched.",
    errorTitle: "Unable to load campaign insights",
    successTitle: "Campaign insights are ready",
    successMessage: "Campaign comparison metrics have been prepared successfully.",
  },
  adGroup: {
    kind: "adGroup",
    title: "Loading ad group details...",
    description: "Gathering structure, metrics, and supporting metadata for the selected ad group...",
    supportMessages: [
      "Resolving the selected ad group from the campaign hierarchy.",
      "Collecting ad group performance signals.",
      "Aligning supporting creative and keyword metadata.",
      "Preparing the final ad group view.",
    ],
    steps: [
      "Resolving ad group",
      "Collecting metrics",
      "Aligning assets",
      "Preparing the view",
    ],
    icon: "layout",
    longWaitTitle: "Still loading ad group details...",
    longWaitMessage:
      "Ad group lookups can take longer when the system is reconciling related ads, assets, and keyword data.",
    errorTitle: "Unable to load ad group details",
    successTitle: "Ad group details are ready",
    successMessage: "Ad group performance and supporting details are ready to view.",
  },
  ad: {
    kind: "ad",
    title: "Preparing ad details...",
    description: "Gathering creative, copy, and performance signals for the selected ad...",
    supportMessages: [
      "Resolving the selected ad or creative variant.",
      "Collecting headline, asset, and destination details.",
      "Aligning performance signals with the creative payload.",
      "Preparing the final ad detail view.",
    ],
    steps: [
      "Resolving ad",
      "Collecting assets",
      "Aligning signals",
      "Preparing the view",
    ],
    icon: "megaphone",
    longWaitTitle: "Still preparing ad details...",
    longWaitMessage:
      "Creative-level requests can take longer when multiple assets and linked metadata need to be resolved.",
    errorTitle: "Unable to prepare ad details",
    successTitle: "Ad details are ready",
    successMessage: "Creative details and performance signals are ready to view.",
  },
  dashboard: {
    kind: "dashboard",
    title: "Getting your dashboard ready...",
    description: "Loading the dashboard layout and current reporting signals...",
    supportMessages: [
      "Preparing the dashboard frame and active filters.",
      "Collecting the latest summary signals.",
      "Arranging cards, metrics, and comparison panels.",
      "Finalizing your dashboard view.",
    ],
    steps: [
      "Preparing layout",
      "Collecting signals",
      "Arranging modules",
      "Finalizing view",
    ],
    icon: "gauge",
    longWaitTitle: "Still getting the dashboard ready...",
    longWaitMessage:
      "Dashboards can take a bit longer when several modules are waiting on reporting API responses at once.",
    errorTitle: "Unable to get the dashboard ready",
    successTitle: "Dashboard is ready",
    successMessage: "Dashboard data has been prepared successfully.",
  },
  download: {
    kind: "download",
    title: "Preparing your download...",
    description: "Building a high-quality PDF / PNG export...",
    supportMessages: [
      "Gathering content from the current report view.",
      "Formatting the export layout for capture.",
      "Rendering the selected file output.",
      "Finalizing the download package.",
    ],
    steps: [
      "Gathering content",
      "Formatting layout",
      "Rendering file",
      "Finalizing download",
    ],
    icon: "layout",
    longWaitTitle: "Still preparing your download...",
    longWaitMessage:
      "Export preparation can take longer when the report contains large images or extended tables.",
    errorTitle: "Unable to prepare the download",
    successTitle: "Your download is ready",
    successMessage: "Your export file has been prepared successfully.",
  },
  keywords: {
    kind: "keywords",
    title: "Preparing top 10 keywords...",
    description: "Analyzing keyword performance and ranking signals...",
    supportMessages: [
      "Collecting keyword rows from the selected account and month.",
      "Scoring relevance and ranking performance signals.",
      "Ordering the top-performing keyword set.",
      "Building the final keyword view.",
    ],
    steps: [
      "Collecting keywords",
      "Scoring relevance",
      "Ranking performance",
      "Building the view",
    ],
    icon: "search",
    longWaitTitle: "Still preparing top 10 keywords...",
    longWaitMessage:
      "Keyword ranking can take longer when the account returns a large number of search terms to evaluate.",
    errorTitle: "Unable to prepare top 10 keywords",
    successTitle: "Top 10 keywords are ready",
    successMessage: "Keyword performance insights have been prepared.",
  },
  auction: {
    kind: "auction",
    title: "Getting your dashboard ready...",
    description: "Loading auction metrics and competitive visibility signals...",
    supportMessages: [
      "Validating Google Ads access for auction insights.",
      "Collecting overlap, impression share, and ranking signals.",
      "Summarizing competitor comparison metrics.",
      "Building the auction insights view.",
    ],
    steps: [
      "Validating access",
      "Collecting signals",
      "Summarizing metrics",
      "Building the view",
    ],
    icon: "gauge",
    longWaitTitle: "Still getting the dashboard ready...",
    longWaitMessage:
      "Auction insight requests can take longer when Google returns competitive data in larger batches.",
    errorTitle: "Unable to load auction insights",
    successTitle: "Dashboard is ready",
    successMessage: "Auction insight data has been prepared successfully.",
  },
  insights: {
    kind: "insights",
    title: "Getting your dashboard ready...",
    description: "Ranking cross-platform insights from current campaign output...",
    supportMessages: [
      "Collecting output signals from the selected platforms.",
      "Scoring experiment candidates and ranked opportunities.",
      "Ordering the strongest insights for review.",
      "Building the insights dashboard.",
    ],
    steps: [
      "Collecting signals",
      "Scoring insights",
      "Ranking opportunities",
      "Building dashboard",
    ],
    icon: "gauge",
    longWaitTitle: "Still getting the dashboard ready...",
    longWaitMessage:
      "Insight generation can take longer when the system is ranking multiple datasets across Meta and Google.",
    errorTitle: "Unable to load dashboard insights",
    successTitle: "Insights are ready",
    successMessage: "Cross-platform insights have been generated successfully.",
  },
  fallback: {
    kind: "fallback",
    title: "Preparing your page...",
    description: "Loading the requested reporting view and aligning the shared system state...",
    supportMessages: [
      "Preparing the route and shared report filters.",
      "Collecting the data needed for this view.",
      "Shaping the response for the reporting UI.",
      "Finalizing the page layout.",
    ],
    steps: [
      "Preparing route",
      "Collecting data",
      "Shaping response",
      "Finalizing page",
    ],
    icon: "layout",
    longWaitTitle: "Still preparing your page...",
    longWaitMessage:
      "This page is still loading. The request may need a bit more time to complete cleanly.",
    errorTitle: "Unable to prepare the page",
    successTitle: "Your page is ready",
    successMessage: "The requested view has been prepared successfully.",
  },
};

export function getReportLoadingDefinition(kind: ReportLoadingKind = "fallback"): ReportLoadingDefinition {
  return REPORT_LOADING_DEFINITIONS[kind] ?? REPORT_LOADING_DEFINITIONS.fallback;
}
