export type AdsManagementStatus =
  | "draft" | "validation_in_progress" | "validation_failed" | "conflict_detected"
  | "awaiting_approval" | "approved" | "ready_to_publish" | "publishing"
  | "published" | "verification_in_progress" | "verified" | "partially_completed"
  | "failed" | "cancelled" | "reverted";

export type ManagedEntityType = "campaign" | "ad_group" | "ad";
export type ManagedFieldKey = string;

export interface ManagedAdTextAsset { text: string; pinnedField?: string }
export interface ManagedCustomParameter { key: string; value: string }
export interface ManagedAsset {
  resourceName: string; name: string; type: string;
  imageUrl?: string; youtubeVideoId?: string; youtubeVideoTitle?: string; callToAction?: string;
}
export interface ManagedAssetAutomationSetting { assetAutomationType: string; assetAutomationStatus: string }
export type ManagedSitelinkScope = "customer" | "campaign" | "ad_group";
export interface ManagedSitelinkAssociation {
  linkResourceName: string;
  scope: ManagedSitelinkScope;
  targetResourceName: string;
  status?: string;
}
export interface ManagedSitelink {
  id: string;
  assetResourceName?: string;
  linkResourceName?: string;
  scope: ManagedSitelinkScope;
  targetResourceName: string;
  source?: string;
  status?: string;
  linkText: string;
  description1: string;
  description2: string;
  finalUrls: string[];
  finalMobileUrls: string[];
  startDate: string;
  endDate: string;
  editable: boolean;
  associations?: ManagedSitelinkAssociation[];
}
export type ManagedRecommendationCategory = "repairs" | "bidding_budgets" | "keywords_targeting" | "ads_assets" | "measurement";
export interface ManagedRecommendationMetrics { impressions?: number; clicks?: number; costMicros?: string; conversions?: number; videoViews?: number }
export type ManagedRecommendationDetailFamily = "keyword" | "budget" | "bidding" | "asset" | "targeting" | "shopping" | "repair" | "generic";
export interface ManagedRecommendationDetailItem {
  label: string;
  value?: string;
  values?: string[];
  previousValue?: string;
  recommendedValue?: string;
}
export interface ManagedRecommendationDetailSection {
  title: string;
  layout: "facts" | "chips" | "comparison";
  items: ManagedRecommendationDetailItem[];
}
export type ManagedRecommendationDetails =
  | { family: "keyword"; sections: ManagedRecommendationDetailSection[] }
  | { family: "budget"; sections: ManagedRecommendationDetailSection[] }
  | { family: "bidding"; sections: ManagedRecommendationDetailSection[] }
  | { family: "asset"; sections: ManagedRecommendationDetailSection[] }
  | { family: "targeting"; sections: ManagedRecommendationDetailSection[] }
  | { family: "shopping"; sections: ManagedRecommendationDetailSection[] }
  | { family: "repair"; sections: ManagedRecommendationDetailSection[] }
  | { family: "generic"; sections: ManagedRecommendationDetailSection[] };
export interface ManagedRecommendation {
  resourceName: string; type: string; category: ManagedRecommendationCategory; title: string; description: string;
  campaignResourceName?: string; campaignName?: string; adGroupResourceName?: string; adGroupName?: string;
  baseMetrics?: ManagedRecommendationMetrics; potentialMetrics?: ManagedRecommendationMetrics;
  optimizationScoreUplift?: number;
  details: ManagedRecommendationDetails;
}
export interface ManagedCampaignPerformancePoint { date: string; costMicros: string; impressions: number; clicks: number; conversions: number; interactions: number }
export interface ManagedPerformanceMetrics { costMicros: string; impressions: number; clicks: number; conversions: number; interactions: number }
export interface ManagedCampaignSummaryMetrics extends ManagedPerformanceMetrics { allConversions: number; conversionRate: number | null; searchBudgetLostImpressionShare: number | null; searchRankLostImpressionShare: number | null }

export interface ManagedFieldValue {
  entityType: ManagedEntityType;
  entityId: string;
  entityName: string;
  fieldKey: ManagedFieldKey;
  fieldLabel: string;
  valueType: "string" | "date" | "money_micros" | "url" | "url_list" | "custom_parameters" | "text_assets" | "single_text_asset" | "asset_refs" | "asset_ref" | "boolean" | "asset_automation_settings" | "sitelinks";
  value: unknown;
  editable: boolean;
  assetOptions?: ManagedAsset[];
  sitelinkTargets?: Array<{ scope: ManagedSitelinkScope; resourceName: string; label: string }>;
  /** @deprecated Kept so drafts created before association-aware sitelinks can still be resumed. */
  sitelinkTarget?: { scope: "ad_group"; resourceName: string };
}

export interface ManagedAdGroup {
  id: string; resourceName: string; name: string; status: string; cpcBidMicros: string | null;
  primaryStatus: string; primaryStatusReasons: string[];
  fields: ManagedFieldValue[]; ads: ManagedAd[]; performanceMetrics?: ManagedPerformanceMetrics; performance?: ManagedCampaignPerformancePoint[];
}

export interface ManagedAd {
  id: string; resourceName: string; name: string; status: string; adType: string;
  adStrength: string; actionItems: string[];
  fields: ManagedFieldValue[]; performanceMetrics?: ManagedPerformanceMetrics; performance?: ManagedCampaignPerformancePoint[];
}

export interface ManagedCampaign {
  id: string; resourceName: string; name: string; status: string; startDate: string; endDate: string;
  budgetResourceName: string; budgetAmountMicros: string; budgetName: string; budgetType: string; currencyCode: string; biddingStrategyType: string; channelType: string;
  primaryStatus: string; primaryStatusReasons: string[]; optimizationScore: number | null;
  adGroups: ManagedAdGroup[]; fields: ManagedFieldValue[]; performance: ManagedCampaignPerformancePoint[]; summaryMetrics?: ManagedCampaignSummaryMetrics;
}

export interface AdsFieldChangeRecord {
  id: string; change_set_id: string; entity_type: ManagedEntityType; entity_id: string; entity_name: string;
  field_key: ManagedFieldKey; field_label: string; value_type: string; baseline_value: unknown;
  proposed_value: unknown; latest_official_value: unknown | null; reviewed_official_value: unknown | null;
  published_value: unknown | null; verified_value: unknown | null; conflict_resolution: string | null;
  validation_errors: string[]; publish_status: string; verification_status: string;
  platform_response: unknown | null; last_error_message: string | null; publish_attempts: number;
  idempotency_key?: string | null; execution_claim_id?: string | null;
}

export interface AdsChangeSetRevisionRecord {
  id: string; change_set_id: string; version: number; canonical_payload: Record<string, unknown>;
  payload_hash: string; reason: string; evidence: ChangeEvidence; source_reference: Record<string, unknown>;
  created_by_id: string | null; created_by_name: string; created_at: string;
}

export interface AdsChangeFollowUpRecord {
  id: string; change_set_id: string; source_optimization_action_id: number | null;
  follow_up_window: "7d" | "14d"; due_at: string; status: "pending" | "completed" | "cancelled";
  handoff_payload: Record<string, unknown>; created_at: string; completed_at: string | null;
}

export interface ChangeEvidence {
  summary: string;
  references?: string[];
  sourceType?: "manual" | "module_5_recommendation";
  sourceId?: string;
}

export interface LaunchEligibility {
  eligible: boolean;
  source: "verified_build" | "legacy_adoption" | "unverified";
  sourceId: string | null;
}

export interface AdsChangeSetRecord {
  id: string; account_id: string; account_name: string; platform: "google"; title: string; reason: string;
  status: AdsManagementStatus; created_by_id: string | null; created_by_name: string;
  baseline_captured_at: string; version: number; approved_at: string | null; published_at: string | null;
  verified_at: string | null; created_at: string; updated_at: string;
  evidence?: ChangeEvidence; campaign_id?: string | null; contract_version?: number; project_key?: "lt_paid_media" | null;
  approved_revision_id?: string | null; approved_payload_hash?: string | null;
  preflight_state_hash?: string | null; approval_expires_at?: string | null;
  reverts_change_set_id?: string | null; source_optimization_action_id?: number | null;
  ads_field_changes?: AdsFieldChangeRecord[]; ads_change_approvals?: Array<Record<string, unknown>>;
  ads_change_events?: Array<Record<string, unknown>>; ads_change_notifications?: Array<Record<string, unknown>>;
  ads_change_set_revisions?: AdsChangeSetRevisionRecord[]; ads_change_follow_ups?: AdsChangeFollowUpRecord[];
}

export interface DraftChangeInput {
  entityType: ManagedEntityType; entityId: string; entityName: string; fieldKey: ManagedFieldKey;
  fieldLabel: string; valueType: string; baselineValue: unknown; proposedValue: unknown;
}

export interface DraftEditorContext {
  view: "campaigns" | "ad_groups" | "ads";
  campaignId: string;
  adGroupId?: string;
  adId?: string;
}
