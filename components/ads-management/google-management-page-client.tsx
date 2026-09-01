"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangleIcon, ArrowUpRightIcon, CheckCircle2Icon, ChevronDownIcon, ClipboardListIcon, FileTextIcon, Layers3Icon, LightbulbIcon, Loader2Icon, MegaphoneIcon, PencilIcon, SaveIcon, SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ManagementEntityName,
  ManagementPaginationFooter,
  ManagementStatusDot as StatusDot,
} from "@/components/ads-management/management-entity-report";
import { ManagementPerformancePanel } from "@/components/ads-management/management-performance-panel";
import { UnifiedManagementAccountSearch } from "@/components/ads-management/unified-management-account-search";
import { ManagementSectionNavigation } from "@/components/ads-management/management-section-navigation";
import { ReportShell } from "@/components/reporting/report-shell";
import { ReportHeaderMonthPicker } from "@/components/reporting/report-header-month-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { M03RequestWorkspace, type M03RequestPrefill } from "@/components/change-control/m03-request-workspace";
import { type AuthenticatedAdsUser } from "@/lib/auth/permissions";
import type { AuthRole } from "@/lib/auth/roles";
import { m03CapabilitiesForRole } from "@/lib/change-control/permissions";
import { formatAdsManagementUserError } from "@/lib/ads-management/user-error";
import type { AdsChangeSetRecord, DraftChangeInput, DraftEditorContext, ManagedAd, ManagedAdTextAsset, ManagedAssetAutomationSetting, ManagedCampaign, ManagedCampaignPerformancePoint, ManagedCustomParameter, ManagedFieldValue, ManagedPerformanceMetrics, ManagedRecommendation, ManagedRecommendationCategory, ManagedRecommendationDetailFamily, ManagedRecommendationDetailSection, ManagedSitelink, ManagedSitelinkAssociation, ManagedSitelinkScope } from "@/lib/ads-management/types";
import { getGoogleEntityViewLayout, GOOGLE_PAGINATED_LIST_CLASS, selectGoogleChangeRequestNavigation, selectGooglePrimaryNavigation, shouldDismissGoogleAccountSearch, type GoogleChangeRequestFilter, type GoogleManagementView } from "@/lib/ads-management/google-management-navigation";
import { buildGoogleManagementRequestPrefill, toGoogleAdGroupManagementResource, toGoogleAdManagementResource, toGoogleCampaignManagementResource, type M03GoogleManagementResource } from "@/lib/change-control/google-management-builder";
import { googleChangeFieldsForEntity } from "@/lib/change-control/google-capability-registry";
import { paginateRows, type MetaPageSize } from "@/lib/ads-management/pagination";
import { toGoogleManagementPerformancePoints } from "@/lib/ads-management/management-performance";
import { buildCanonicalManagementQuery, isAdsManagementView } from "@/lib/ads-management/unified-management";

type SaveState = "idle" | "saving" | "saved" | "failed";
type ManagementView = GoogleManagementView;
type ManagementAccountSuggestion = { accountName: string; adAccountId: string };
const MANAGEMENT_ACCOUNT_CACHE_KEY = "google-management-account-search-cache-v1";
const MANAGEMENT_RECENT_ACCOUNTS_KEY = "google-management-recent-accounts-v1";
const MANAGEMENT_ACCOUNT_CACHE_TTL_MS = 15 * 60 * 1000;
const MANAGEMENT_FILTER_MENU_CLASS = "max-h-[22rem]";

export function GoogleManagementPageClient({ currentUser }: { currentUser: AuthenticatedAdsUser }) {
  const role = currentUser.role as AuthRole;
  const canRequestChanges = m03CapabilitiesForRole(role).create;
  const canEdit = false;
  const router = useRouter();
  const params = useSearchParams();
  const accountId = params.get("accountId")?.trim() || "";
  const accountName = params.get("accountName")?.trim() || `Account ${accountId}`;
  const resumeRequestId = "";
  const [campaigns, setCampaigns] = useState<ManagedCampaign[]>([]);
  const [syncedAt, setSyncedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<ManagedRecommendation[]>([]);
  const [optimizationScore, setOptimizationScore] = useState<number | null>(null);
  const [optimizationScoreUrl, setOptimizationScoreUrl] = useState<string | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsLoaded, setRecommendationsLoaded] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);
  const [recommendationFilter, setRecommendationFilter] = useState<"all" | ManagedRecommendationCategory>("all");
  const [reportDates, setReportDates] = useState(() => defaultManagementDateRange(params.get("startDate"), params.get("endDate")));
  const activeQuery = useMemo(() => {
    const query = new URLSearchParams({
      accountId,
      accountName,
      startDate: reportDates.startDate,
      endDate: reportDates.endDate,
    });
    return query.toString();
  }, [accountId, accountName, reportDates.endDate, reportDates.startDate]);
  const [adEditorOpen, setAdEditorOpen] = useState(false);
  const [settingsEditorOpen, setSettingsEditorOpen] = useState(false);
  const [reviewRequestId, setReviewRequestId] = useState("");
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewStatus, setReviewStatus] = useState("");
  const [draftChoice, setDraftChoice] = useState<{
    request: AdsChangeSetRecord;
    context: DraftEditorContext;
  } | null>(null);
  const [editableDrafts, setEditableDrafts] = useState<AdsChangeSetRecord[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(canEdit);
  const [requestPrefill, setRequestPrefill] = useState<M03RequestPrefill | null>(null);
  const [requestReason, setRequestReason] = useState("");
  const [changeRequestFilter, setChangeRequestFilter] = useState<GoogleChangeRequestFilter>("requests");
  const [changeRequestsOpen, setChangeRequestsOpen] = useState(false);
  const requestChange = useCallback((context?: { campaignId?: string; adGroupId?: string; adId?: string; fieldPath?: string; title?: string; reason?: string }) => {
    if (!canRequestChanges) return;
    const campaign = campaigns.find((candidate) => candidate.id === context?.campaignId) ?? campaigns[0];
    if (!campaign) return;
    const adGroup = campaign.adGroups.find((candidate) => candidate.id === context?.adGroupId);
    const ad = adGroup?.ads.find((candidate) => candidate.id === context?.adId);
    const resource = ad && adGroup
      ? toGoogleAdManagementResource(campaign, adGroup, ad)
      : adGroup
        ? toGoogleAdGroupManagementResource(campaign, adGroup)
        : toGoogleCampaignManagementResource(campaign);
    const prefill = buildGoogleManagementRequestPrefill({ accountIdentity: accountId, accountName, resource, fieldPath: context?.fieldPath });
    if (context?.title) prefill.title = context.title;
    setRequestPrefill(prefill);
    setRequestReason(context?.reason ?? "");
    setChangeRequestFilter(resource.entityType);
    setChangeRequestsOpen(true);
    setView("change_requests");
  }, [accountId, accountName, campaigns, canRequestChanges]);
  const handleReviewProgress = useCallback((busy: boolean, status: string) => {
    setReviewBusy(busy);
    setReviewStatus(status);
  }, []);
  const openReviewPanel = useCallback((requestId: string) => {
    setReviewRequestId(requestId);
    setReviewPanelOpen(true);
  }, []);
  const requestedView = isAdsManagementView(params.get("view")) ? params.get("view") as ManagementView : "campaigns";
  const [view, setView] = useState<ManagementView>(requestedView);
  const googleManagementResources = useMemo<M03GoogleManagementResource[]>(() => campaigns.flatMap((campaign) => [
    toGoogleCampaignManagementResource(campaign),
    ...campaign.adGroups.flatMap((adGroup) => [
      toGoogleAdGroupManagementResource(campaign, adGroup),
      ...adGroup.ads.map((ad) => toGoogleAdManagementResource(campaign, adGroup, ad)),
    ]),
  ]), [campaigns]);
  useEffect(() => {
    setView(requestedView);
    setReportDates(defaultManagementDateRange(params.get("startDate"), params.get("endDate")));
  }, [accountId, params, requestedView]);
  useEffect(() => {
    if (!accountId) return;
    const query = buildCanonicalManagementQuery({
      platform: "google",
      accountId,
      accountName: params.get("accountName")?.trim() || accountName,
      startDate: reportDates.startDate,
      endDate: reportDates.endDate,
      view,
    });
    if (params.toString() !== query) router.replace(`/manage?${query}`, { scroll: false });
  }, [accountId, accountName, params, reportDates.endDate, reportDates.startDate, router, view]);
  const refreshOfficialGoogleResources = useCallback(async () => {
    const response = await fetch(`/api/ads-management/google/campaigns?accountId=${encodeURIComponent(accountId)}&startDate=${encodeURIComponent(reportDates.startDate)}&endDate=${encodeURIComponent(reportDates.endDate)}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to refresh Google Ads data.");
    const nextCampaigns = (payload.campaigns || []) as ManagedCampaign[];
    setCampaigns(nextCampaigns);
    setSyncedAt(payload.synchronizedAt || "");
    return nextCampaigns.flatMap((campaign) => [toGoogleCampaignManagementResource(campaign), ...campaign.adGroups.flatMap((adGroup) => [toGoogleAdGroupManagementResource(campaign, adGroup), ...adGroup.ads.map((ad) => toGoogleAdManagementResource(campaign, adGroup, ad))])]);
  }, [accountId, reportDates.endDate, reportDates.startDate]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedAdGroupId, setSelectedAdGroupId] = useState("");
  const [selectedAdId, setSelectedAdId] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [baselineOverrides, setBaselineOverrides] = useState<Record<string, unknown>>({});
  const creator = currentUser.displayName;
  const [request, setRequest] = useState<AdsChangeSetRecord | null>(null);
  const [resumeData, setResumeData] = useState<AdsChangeSetRecord | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const first = useRef(true);
  const lastSavedKey = useRef("");
  const resumed = useRef(false);
  const requestRef = useRef<AdsChangeSetRecord | null>(null);
  const saveInFlight = useRef(false);
  useEffect(() => {
    if (!accountId) {
      setCampaigns([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setCampaigns([]);
    setRecommendations([]);
    setRecommendationsLoaded(false);
    fetch(`/api/ads-management/google/campaigns?accountId=${encodeURIComponent(accountId)}&startDate=${encodeURIComponent(reportDates.startDate)}&endDate=${encodeURIComponent(reportDates.endDate)}`, { cache: "no-store" })
      .then(async (r) => {
        const p = await r.json();
        if (!r.ok) throw new Error(p.error);
        setCampaigns(p.campaigns);
        setSyncedAt(p.synchronizedAt);
        setSelectedId((current) => (current && p.campaigns.some((item: ManagedCampaign) => item.id === current) ? current : p.campaigns[0]?.id || ""));
      })
      .catch((cause) => setError(formatAdsManagementUserError(cause, "Unable to load Google Ads management data. Please try again.")))
      .finally(() => setLoading(false));
  }, [accountId, refreshNonce, reportDates.endDate, reportDates.startDate]);
  useEffect(() => {
    if (!accountId || !canEdit) {
      setDraftsLoading(false);
      return;
    }
    setDraftsLoading(true);
    fetch(`/api/ads-management/change-requests?accountId=${encodeURIComponent(accountId)}&editable=true`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        setEditableDrafts(payload.requests || []);
      })
      .catch(() => setEditableDrafts([]))
      .finally(() => setDraftsLoading(false));
  }, [accountId, canEdit]);
  useEffect(() => {
    if (!accountId || view !== "recommendations" || recommendationsLoading || recommendationsLoaded) return;
    setRecommendationsLoading(true);
    setRecommendationsError(null);
    fetch(`/api/ads-management/google/recommendations?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error);
        setRecommendations(payload.recommendations || []);
        setOptimizationScore(payload.optimizationScore ?? null);
        setOptimizationScoreUrl(payload.optimizationScoreUrl || null);
      })
      .catch((cause) => setRecommendationsError(cause instanceof Error ? cause.message : "Unable to load recommendations."))
      .finally(() => {
        setRecommendationsLoading(false);
        setRecommendationsLoaded(true);
      });
  }, [accountId, recommendationsLoaded, recommendationsLoading, view]);
  useEffect(() => {
    if (!resumeRequestId || !campaigns.length) return;
    fetch(`/api/ads-management/change-requests/${resumeRequestId}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        const p = await r.json();
        if (!r.ok) throw new Error(p.error);
        const firstChange = p.ads_field_changes?.[0];
        if (!firstChange) throw new Error("This change request has no editable field changes.");
        if (firstChange.field_key === "recommendation.apply") {
          openReviewPanel(p.id);
          return;
        }
        if (!["draft", "validation_failed", "conflict_detected"].includes(p.status)) throw new Error("This change request is no longer editable.");
        setResumeData(p);
        const savedContext = latestEditorContext(p);
        const contextCampaign = savedContext ? campaigns.find((item) => item.id === savedContext.campaignId) : null;
        if (savedContext && contextCampaign) {
          const contextGroup = contextCampaign.adGroups.find((item) => item.id === savedContext.adGroupId);
          const contextAd = contextGroup?.ads.find((item) => item.id === savedContext.adId);
          setSelectedId(contextCampaign.id);
          if (contextGroup) setSelectedAdGroupId(contextGroup.id);
          if (contextAd) setSelectedAdId(contextAd.id);
          setView(savedContext.view);
          setAdEditorOpen(savedContext.view === "ads" && Boolean(contextAd));
          setSettingsEditorOpen(savedContext.view === "campaigns" || (savedContext.view === "ad_groups" && Boolean(contextGroup)));
          return;
        }
        const location = findChangeLocation(campaigns, firstChange);
        if (!location) throw new Error(`The saved ${firstChange.field_label || "field"} could not be matched to the latest Google Ads data. The draft remains safely stored in change history.`);
        setSelectedId(location.campaign.id);
        if (location.adGroup) setSelectedAdGroupId(location.adGroup.id);
        if (location.ad) setSelectedAdId(location.ad.id);
        const resumedView = firstChange.entity_type === "ad" ? "ads" : firstChange.entity_type === "ad_group" ? "ad_groups" : "campaigns";
        setView(resumedView);
        setAdEditorOpen(resumedView === "ads");
        setSettingsEditorOpen(resumedView !== "ads");
      })
      .catch((cause) => setError(formatAdsManagementUserError(cause, "Unable to load the saved change request. Please try again.")));
  }, [campaigns, openReviewPanel, resumeRequestId]);
  const campaign = campaigns.find((item) => item.id === selectedId) ?? null;
  const selectedAdGroup = campaign?.adGroups.find((item) => item.id === selectedAdGroupId) ?? campaign?.adGroups[0] ?? null;
  const selectedAd = selectedAdGroup?.ads.find((item) => item.id === selectedAdId) ?? selectedAdGroup?.ads[0] ?? null;
  const fields = useMemo(() => (campaign ? [...campaign.fields, ...campaign.adGroups.flatMap((g) => [...g.fields, ...g.ads.flatMap((ad) => ad.fields)])] : []), [campaign]);
  useEffect(() => {
    const next: Record<string, unknown> = {};
    for (const f of fields) next[fieldId(f)] = f.value;
    setValues(next);
    setBaselineOverrides({});
    requestRef.current = null;
    setRequest(null);
    setSaveState("idle");
    lastSavedKey.current = "";
    first.current = true;
    resumed.current = false;
  }, [fields]);
  useEffect(() => {
    if (!resumeData || resumed.current || !fields.length) return;
    const proposals: Record<string, unknown> = {};
    const baselines: Record<string, unknown> = {};
    for (const change of resumeData.ads_field_changes ?? []) {
      const match = fields.find((f) => f.entityType === change.entity_type && f.entityId === change.entity_id && f.fieldKey === change.field_key);
      if (match) {
        proposals[fieldId(match)] = change.proposed_value;
        baselines[fieldId(match)] = change.baseline_value;
      }
    }
    setValues((current) => ({ ...current, ...proposals }));
    setBaselineOverrides(baselines);
    requestRef.current = resumeData;
    setRequest(resumeData);
    resumed.current = true;
  }, [fields, resumeData]);
  const changes = useMemo(
    () =>
      fields.flatMap((f): DraftChangeInput[] => {
        if (!f.editable) return [];
        const baseline = Object.prototype.hasOwnProperty.call(baselineOverrides, fieldId(f)) ? baselineOverrides[fieldId(f)] : f.value;
        const proposed = normalizeDraftValue(f, values[fieldId(f)]);
        const normalizedBaseline = normalizeDraftValue(f, baseline);
        if (JSON.stringify(proposed) === JSON.stringify(normalizedBaseline)) return [];
        return [
          {
            entityType: f.entityType,
            entityId: f.entityId,
            entityName: f.entityName,
            fieldKey: f.fieldKey,
            fieldLabel: f.fieldLabel,
            valueType: f.valueType,
            baselineValue: normalizedBaseline,
            proposedValue: proposed,
          },
        ];
      }),
    [baselineOverrides, fields, values],
  );
  const draftKey = useMemo(() => JSON.stringify({ changes, creator }), [changes, creator]);
  const saveDraft = useCallback(async () => {
    if (!canEdit || saveInFlight.current) return;
    saveInFlight.current = true;
    setSaveState("saving");
    setError(null);
    const activeRequest = requestRef.current;
    const editorContext: DraftEditorContext = {
      view: view === "ads" ? "ads" : view === "ad_groups" ? "ad_groups" : "campaigns",
      campaignId: campaign?.id || selectedId,
      ...(selectedAdGroupId ? { adGroupId: selectedAdGroupId } : {}),
      ...(selectedAdId ? { adId: selectedAdId } : {}),
    };
    try {
      const response = await fetch(activeRequest ? `/api/ads-management/change-requests/${activeRequest.id}` : "/api/ads-management/change-requests", {
        method: activeRequest ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          activeRequest
            ? { version: activeRequest.version, changes, editorContext }
            : {
                accountId,
                accountName,
                campaignId: campaign?.id || selectedId,
                title: `${campaign?.name || "Campaign"} changes`,
                reason: "",
                evidence: { summary: "" },
                baselineCapturedAt: syncedAt,
                changes,
                editorContext,
              },
        ),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      lastSavedKey.current = draftKey;
      requestRef.current = payload;
      setRequest(payload);
      setEditableDrafts((current) => [payload, ...current.filter((item) => item.id !== payload.id)]);
      setSaveState("saved");
    } catch (e) {
      setSaveState("failed");
      setError(formatAdsManagementUserError(e, "Unable to save your changes. Please try again."));
    } finally {
      saveInFlight.current = false;
    }
  }, [accountId, accountName, campaign?.id, campaign?.name, canEdit, changes, draftKey, selectedAdGroupId, selectedAdId, selectedId, syncedAt, view]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!creator.trim() || draftKey === lastSavedKey.current) return;
    if (!changes.length && !requestRef.current) return;
    const timeout = window.setTimeout(() => void saveDraft(), 900);
    return () => window.clearTimeout(timeout);
  }, [changes.length, creator, draftKey, saveDraft]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (saveState === "saving" || saveState === "failed") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);
  async function submit() {
    if (!request || saveState === "saving" || submitting) return;
    setSubmitting(true);
    const submittedRequestId = request.id;
    setAdEditorOpen(false);
    setSettingsEditorOpen(false);
    setReviewRequestId(submittedRequestId);
    setReviewPanelOpen(true);
    const resetValues: Record<string, unknown> = {};
    for (const field of fields) resetValues[fieldId(field)] = field.value;
    setValues(resetValues);
    setBaselineOverrides({});
    requestRef.current = null;
    setRequest(null);
    setSaveState("idle");
    lastSavedKey.current = "";
    setSubmitting(false);
  }
  function openFreshEditor(context: DraftEditorContext, sourceCampaigns = campaigns) {
    const targetCampaign = sourceCampaigns.find((item) => item.id === context.campaignId);
    if (!targetCampaign) return;
    const targetFields = [...targetCampaign.fields, ...targetCampaign.adGroups.flatMap((group) => [...group.fields, ...group.ads.flatMap((ad) => ad.fields)])];
    const nextValues: Record<string, unknown> = {};
    for (const field of targetFields) nextValues[fieldId(field)] = field.value;
    setResumeData(null);
    resumed.current = false;
    requestRef.current = null;
    setRequest(null);
    setSaveState("idle");
    lastSavedKey.current = "";
    first.current = true;
    setBaselineOverrides({});
    setValues(nextValues);
    setSelectedId(context.campaignId);
    setSelectedAdGroupId(context.adGroupId || "");
    setSelectedAdId(context.adId || "");
    setView(context.view);
    setAdEditorOpen(context.view === "ads");
    setSettingsEditorOpen(context.view !== "ads");
  }
  async function openEditor(context: DraftEditorContext) {
    setError(null);
    const activeDraft = requestRef.current;
    if (activeDraft && draftMatchesContext(activeDraft, context, campaigns)) {
      setDraftChoice({ request: activeDraft, context });
      return;
    }
    for (const saved of editableDrafts) {
      if (draftMatchesContext(saved, context, campaigns)) {
        setDraftChoice({ request: saved, context });
        return;
      }
    }
    const campaignToEdit = campaigns.find((item) => item.id === context.campaignId);
    if (!campaignToEdit) return;
    try {
      const eligibilityResponse = await fetch(`/api/ads-management/google/launch-eligibility?accountId=${encodeURIComponent(accountId)}&campaignId=${encodeURIComponent(context.campaignId)}`, { cache: "no-store" });
      const eligibility = await eligibilityResponse.json();
      if (!eligibilityResponse.ok) throw new Error(eligibility.error);
      if (!eligibility.eligible) {
        const reason = window.prompt("This campaign predates verified Module 4 launch records. Enter the business reason for authorizing it as an LT Paid Media legacy campaign:");
        if (!reason?.trim()) return;
        const evidenceSummary = window.prompt("Enter the evidence used to confirm that this campaign belongs to LT Paid Media:");
        if (!evidenceSummary?.trim()) return;
        const adoptionResponse = await fetch("/api/ads-management/google/launch-eligibility", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId, campaignId: context.campaignId, campaignName: campaignToEdit.name, reason, evidence: { summary: evidenceSummary, sourceType: "manual" } }),
        });
        const adopted = await adoptionResponse.json();
        if (!adoptionResponse.ok) throw new Error(adopted.error);
      }
      openFreshEditor(context);
    } catch (cause) {
      setError(formatAdsManagementUserError(cause, "Unable to verify campaign eligibility right now. Please try again later."));
    }
  }
  function resumeDraftInContext(savedRequest: AdsChangeSetRecord, context: DraftEditorContext) {
    const targetCampaign = campaigns.find((item) => item.id === context.campaignId);
    if (!targetCampaign) {
      setError("The campaign for this saved draft is no longer available in the latest Google Ads data.");
      return;
    }
    const targetGroup = context.adGroupId ? targetCampaign.adGroups.find((item) => item.id === context.adGroupId) : null;
    const targetAd = context.adId ? targetGroup?.ads.find((item) => item.id === context.adId) : null;
    if (context.view === "ad_groups" && !targetGroup) {
      setError("The ad group for this saved draft is no longer available in the latest Google Ads data.");
      return;
    }
    if (context.view === "ads" && !targetAd) {
      setError("The ad for this saved draft is no longer available in the latest Google Ads data.");
      return;
    }
    resumed.current = false;
    setResumeData(savedRequest);
    setSelectedId(targetCampaign.id);
    setSelectedAdGroupId(targetGroup?.id || "");
    setSelectedAdId(targetAd?.id || "");
    setView(context.view);
    setAdEditorOpen(context.view === "ads");
    setSettingsEditorOpen(context.view !== "ads");
  }
  function resumeHistoryRequest(savedRequest: AdsChangeSetRecord) {
    const firstChange = savedRequest.ads_field_changes?.[0];
    if (!firstChange) {
      setError("This change request has no editable field changes.");
      return;
    }
    if (firstChange.field_key === "recommendation.apply") {
      setError("Google recommendation requests can be reviewed from their history details but cannot be reopened in an editor.");
      return;
    }
    const savedContext = latestEditorContext(savedRequest);
    const contextCampaign = savedContext ? campaigns.find((item) => item.id === savedContext.campaignId) : null;
    const location = contextCampaign ? null : findChangeLocation(campaigns, firstChange);
    const targetCampaign = contextCampaign ?? location?.campaign;
    if (!targetCampaign) {
      setError(`The saved ${firstChange.field_label || "field"} could not be matched to the latest Google Ads data.`);
      return;
    }
    const targetGroup = savedContext ? targetCampaign.adGroups.find((item) => item.id === savedContext.adGroupId) : location?.adGroup;
    const targetAd = savedContext ? targetGroup?.ads.find((item) => item.id === savedContext.adId) : location?.ad;
    const targetView = savedContext?.view ?? (firstChange.entity_type === "ad" ? "ads" : firstChange.entity_type === "ad_group" ? "ad_groups" : "campaigns");
    resumed.current = false;
    setResumeData(savedRequest);
    setSelectedId(targetCampaign.id);
    if (targetGroup) setSelectedAdGroupId(targetGroup.id);
    if (targetAd) setSelectedAdId(targetAd.id);
    setView(targetView);
    setAdEditorOpen(targetView === "ads" && Boolean(targetAd));
    setSettingsEditorOpen(targetView === "campaigns" || (targetView === "ad_groups" && Boolean(targetGroup)));
  }
  if (!accountId)
    return (
      <ReportShell title="Ads Management" dateLabel="Search for an account to begin" activeQuery="" reportReady>
        <div className="mx-auto max-w-3xl space-y-5 text-slate-900">
          <UnifiedManagementAccountSearch />
          <section className="rounded-2xl border border-dashed bg-white p-10 text-center shadow-sm">
            <SearchIcon className="mx-auto size-8 text-slate-400" />
            <h2 className="mt-3 text-lg font-semibold">Find a Google Ads account</h2>
            <p className="mt-1 text-sm text-slate-500">Search by company name or Google Ads customer ID. Recent and repeated searches load from this browser first.</p>
          </section>
        </div>
      </ReportShell>
    );
  return (
    <ReportShell title="Ads Management" dateLabel={syncedAt ? `Synchronized ${new Date(syncedAt).toLocaleString()}` : "Latest Google Ads values"} activeQuery={activeQuery} reportReady>
      <div className="mx-auto max-w-[1600px] space-y-5 text-slate-900">
        <UnifiedManagementAccountSearch selection={{ platform: "google", accountId, accountName }} synchronizedAt={syncedAt} />
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 shadow-sm">
          <ReportHeaderMonthPicker startDate={reportDates.startDate} endDate={reportDates.endDate} onChange={setReportDates} variant="compact" />
          <Button variant="outline" size="sm" disabled={loading} onClick={() => setRefreshNonce((value) => value + 1)}>
            <Loader2Icon className={loading ? "animate-spin" : "hidden"} />
            Refresh official data
          </Button>
        </section>
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangleIcon className="mr-2 inline size-4" />
            {error}
          </div>
        ) : null}
        <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <ManagementSectionNavigation role={role} value={view} onChange={(next) => {
            if (next === "change_requests") {
              const selected = selectGoogleChangeRequestNavigation("requests");
              setView(selected.view); setChangeRequestFilter(selected.changeRequestFilter); setChangeRequestsOpen(selected.changeRequestsOpen);
            } else {
              const selected = selectGooglePrimaryNavigation(next);
              setView(selected.view); setChangeRequestsOpen(selected.changeRequestsOpen);
            }
          }} />
          <section className="min-w-0 space-y-4">
            {loading || draftsLoading ? <GoogleManagementViewSkeleton view={view} /> : view === "recommendations" ? (
                <RecommendationsPage accountId={accountId} accountName={accountName} recommendations={recommendations} loading={recommendationsLoading} error={recommendationsError} optimizationScore={optimizationScore} optimizationScoreUrl={optimizationScoreUrl} filter={recommendationFilter} onFilter={setRecommendationFilter} canEdit={canRequestChanges} onRequestChange={(recommendation) => requestChange({ campaignId: recommendation.campaignResourceName?.split("/").pop(), title: recommendation.title, reason: recommendation.description, fieldPath: recommendation.category === "bidding_budgets" ? "campaign.budget.amount_micros" : recommendation.category === "repairs" ? "campaign.status" : "campaign.name" })} />
              ) : view === "campaigns" ? (
                <CampaignsPage campaigns={campaigns} onEdit={canRequestChanges ? (campaignId) => requestChange({ campaignId }) : undefined} />
              ) : view === "ad_groups" ? (
                <AdGroupsPage
                  campaigns={campaigns}
                  onEdit={
                    canRequestChanges
                      ? (campaignId, adGroupId) =>
                          requestChange({ campaignId, adGroupId })
                      : undefined
                  }
                />
              ) : view === "ads" ? (
                <AdsTable
                  campaigns={campaigns}
                  onEdit={
                    canRequestChanges
                      ? (campaignId, adGroupId, adId) =>
                          requestChange({ campaignId, adGroupId, adId })
                      : undefined
                  }
                />
              ) : view === "change_requests" ? <GoogleChangeRequestsPanel role={role} filter={changeRequestFilter} accountId={accountId} accountName={accountName} resources={googleManagementResources} prefill={requestPrefill} prefillReason={requestReason} onRequestChange={requestChange} onRefresh={refreshOfficialGoogleResources} /> : null}
          </section>
        </div>
      </div>
    </ReportShell>
  );
}

function GoogleManagementSidebar({ view, changeRequestFilter, changeRequestsOpen, onPrimary, onChangeRequest, onToggleChangeRequests }: {
  view: ManagementView;
  changeRequestFilter: GoogleChangeRequestFilter;
  changeRequestsOpen: boolean;
  onPrimary: (view: Exclude<ManagementView, "change_requests">) => void;
  onChangeRequest: (filter: GoogleChangeRequestFilter) => void;
  onToggleChangeRequests: (open: boolean) => void;
}) {
  const primary = [
    ["recommendations", "Recommendations", LightbulbIcon],
    ["campaigns", "Campaigns", MegaphoneIcon],
    ["ad_groups", "Ad groups", Layers3Icon],
    ["ads", "Ads", FileTextIcon],
  ] as const;
  return <aside className="sticky top-4 hidden rounded-xl border bg-white p-2 shadow-sm md:block" aria-label="Google management navigation">
    <nav className="space-y-1">{primary.map(([value, label, Icon]) => <button key={value} type="button" onClick={() => onPrimary(value)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${view === value ? "border border-red-200 bg-red-50 font-medium text-red-700" : "text-slate-700 hover:bg-slate-50"}`}><Icon className="size-4" />{label}</button>)}</nav>
    <div className="my-2 border-t" />
    <Collapsible open={changeRequestsOpen} onOpenChange={onToggleChangeRequests}>
      <CollapsibleTrigger asChild><button type="button" className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${view === "change_requests" ? "text-red-700" : "text-slate-700"}`}><span className="flex items-center gap-3"><ClipboardListIcon className="size-4" />Change requests</span><ChevronDownIcon className={`size-4 transition ${changeRequestsOpen ? "rotate-180" : ""}`} /></button></CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-1 pl-3">{(["requests", "campaign", "ad_group", "ad"] as const).map((filter) => <button key={filter} type="button" onClick={() => onChangeRequest(filter)} className={`flex w-full rounded-lg px-3 py-2 text-left text-sm ${view === "change_requests" && changeRequestFilter === filter ? "bg-red-50 font-medium text-red-700" : "text-slate-600 hover:bg-slate-50"}`}>{filter === "requests" ? "All requests" : filter === "ad_group" ? "Ad groups" : filter === "ad" ? "Ads" : "Campaign"}</button>)}</CollapsibleContent>
    </Collapsible>
    <p className="mt-3 border-t px-3 pt-3 text-xs leading-5 text-slate-500">Provider execution remains locked.</p>
  </aside>;
}

function GoogleManagementViewSkeleton({ view }: { view: ManagementView }) {
  const rows = view === "recommendations" ? 3 : 6;
  return <div className="space-y-4" aria-label="Loading Google Ads data">
    <div className="rounded-2xl border bg-white p-5 shadow-sm"><Skeleton className="h-4 w-28" /><Skeleton className="mt-3 h-8 w-64" /><Skeleton className="mt-2 h-4 w-80 max-w-full" /></div>
    {view === "recommendations" ? <div className="grid gap-3 sm:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="rounded-xl border bg-white p-4"><Skeleton className="h-4 w-24" /><Skeleton className="mt-4 h-9 w-20" /></div>)}</div> : null}
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">{Array.from({ length: rows }, (_, index) => <div key={index} className="grid gap-3 border-b p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_100px_100px]"><div><Skeleton className="h-4 w-2/3" /><Skeleton className="mt-2 h-3 w-1/2" /></div><Skeleton className="h-8 w-20" /><Skeleton className="h-8 w-24" /></div>)}</div>
  </div>;
}

function GoogleChangeRequestsPanel({ role, filter, accountId, accountName, resources, prefill, prefillReason, onRequestChange, onRefresh }: {
  role: AuthRole;
  filter: GoogleChangeRequestFilter;
  accountId: string;
  accountName: string;
  resources: readonly M03GoogleManagementResource[];
  prefill: M03RequestPrefill | null;
  prefillReason: string;
  onRequestChange: (context?: { campaignId?: string; adGroupId?: string; adId?: string }) => void;
  onRefresh: () => readonly M03GoogleManagementResource[] | Promise<readonly M03GoogleManagementResource[]>;
}) {
  const filteredResources = resources.filter((resource) => filter !== "requests" && resource.entityType === filter);
  const pagination = useClientPagination(filteredResources);
  if (filter !== "requests" && !prefill) {
    const selectedResources = pagination.items;
    return <div className="space-y-4"><div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">Change control</p><h2 className="mt-2 text-xl font-semibold capitalize">{filter.replace("_", " ")} changes</h2><div className="mt-3 flex flex-wrap gap-2">{googleChangeFieldsForEntity(filter).map((field) => <span key={field.field_path} className="rounded-full border bg-slate-50 px-2.5 py-1 text-xs">{field.label}</span>)}</div></div>
      <div className={`${GOOGLE_PAGINATED_LIST_CLASS} border bg-white shadow-sm`}>{selectedResources.map((resource) => <div key={`${resource.entityType}:${resource.entityIdentity}`} className="flex flex-wrap items-center justify-between gap-3 border-b p-4 last:border-b-0"><div><p className="font-medium">{resource.name}</p><p className="text-xs text-slate-500">{resource.entityIdentity} · {resource.status}</p></div><Button variant="outline" size="sm" onClick={() => onRequestChange({ campaignId: resource.campaignIdentity, adGroupId: resource.adGroupIdentity, adId: resource.entityType === "ad" ? resource.entityIdentity : undefined })}>Request change</Button></div>)}<GooglePaginationFooter model={pagination} /></div></div>;
  }
  return <M03RequestWorkspace role={role} scope={{ platform: "google", accountIdentity: accountId }} prefill={prefill} prefillReason={prefillReason} showNewRequestAction={false} focusEditorWhenOpen googleManagement={{ accountIdentity: accountId, accountName, resources, onRefreshOfficialData: onRefresh }} />;
}

function GoogleManagementAccountSearch({ currentAccount, synchronizedAt }: { currentAccount?: ManagementAccountSuggestion; synchronizedAt?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const currentAccountName = currentAccount?.accountName;
  const currentAccountId = currentAccount?.adAccountId;
  const [query, setQuery] = useState(currentAccountName ?? "");
  const [suggestions, setSuggestions] = useState<ManagementAccountSuggestion[]>([]);
  const [recentAccounts, setRecentAccounts] = useState<ManagementAccountSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchContainerRef = useRef<HTMLElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    setQuery(currentAccountName ?? "");
  }, [currentAccountName]);
  useEffect(() => {
    setRecentAccounts(readRecentManagementAccounts());
  }, []);
  useEffect(() => {
    function closeAccountResults(event: PointerEvent) {
      if (shouldDismissGoogleAccountSearch(searchContainerRef.current, event.composedPath())) setOpen(false);
    }
    document.addEventListener("pointerdown", closeAccountResults);
    return () => document.removeEventListener("pointerdown", closeAccountResults);
  }, []);
  useEffect(() => {
    const trimmed = query.trim();
    if (currentAccountName && (trimmed === currentAccountName || trimmed === currentAccountId)) {
      setSuggestions([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    if (trimmed.length < 2) {
      setSuggestions([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    const cached = readManagementAccountCache(trimmed);
    if (cached) {
      setSuggestions(cached);
      setSearching(false);
      setSearchError(null);
      return;
    }
    const controller = new AbortController();
    const activeRequest = ++requestId.current;
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const response = await fetch(`/api/search-term-optimization/account-search?q=${encodeURIComponent(trimmed)}`, { cache: "no-store", signal: controller.signal });
        const payload = (await response.json()) as {
          accounts?: unknown[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "Unable to search Google Ads accounts.");
        if (controller.signal.aborted || activeRequest !== requestId.current) return;
        const accounts = (payload.accounts ?? []).filter(isManagementAccountSuggestion);
        setSuggestions(accounts);
        writeManagementAccountCache(trimmed, accounts);
      } catch (cause) {
        if (controller.signal.aborted || activeRequest !== requestId.current) return;
        setSuggestions([]);
        setSearchError(cause instanceof Error ? cause.message : "Unable to search Google Ads accounts.");
      } finally {
        if (!controller.signal.aborted && activeRequest === requestId.current) setSearching(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [currentAccountId, currentAccountName, query]);

  function selectAccount(account: ManagementAccountSuggestion) {
    const nextRecent = [account, ...recentAccounts.filter((item) => item.adAccountId !== account.adAccountId)].slice(0, 5);
    setRecentAccounts(nextRecent);
    writeRecentManagementAccounts(nextRecent);
    setOpen(false);
    setQuery(account.accountName);
    const next = new URLSearchParams(params.toString());
    next.set("accountId", account.adAccountId);
    next.set("accountName", account.accountName);
    next.delete("requestId");
    router.push(`/manage/google?${next.toString()}`);
  }
  const trimmedQuery = query.trim();
  return (
    <section ref={searchContainerRef} className="relative rounded-2xl border bg-white p-5 shadow-sm">
      <label className="block text-sm font-semibold text-slate-800" htmlFor="google-management-account-search">
        Google Ads account search
      </label>
      <div className="relative mt-2">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input
          id="google-management-account-search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder="Search company or Google Ads CID"
          className="pl-9 pr-10"
          autoComplete="off"
        />
        {searching ? <Loader2Icon className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-slate-400" /> : null}
        {open ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[80] max-h-80 overflow-y-auto rounded-xl border bg-white p-2 shadow-2xl">
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Results</p>
            {trimmedQuery.length < 2 ? <p className="px-3 py-2 text-sm text-slate-500">Type at least 2 characters to search accounts.</p> : searching ? <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500"><Loader2Icon className="size-4 animate-spin" /> Searching accounts…</div> : suggestions.length ? suggestions.map((account) => (
              <button key={`result:${account.adAccountId}`} type="button" onClick={() => selectAccount(account)} className="flex w-full rounded-lg px-3 py-3 text-left hover:bg-slate-50">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">{account.accountName}</span>
                  <span className="block text-xs text-slate-500">CID {account.adAccountId}</span>
                </span>
              </button>
            )) : <p className="px-3 py-2 text-sm text-slate-500">No matching Google Ads accounts found.</p>}
            <div className="mt-1 border-t pt-1">
              <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent</p>
              {recentAccounts.length ? recentAccounts.map((account) => (
                <button key={`recent:${account.adAccountId}`} type="button" onClick={() => selectAccount(account)} className="flex w-full rounded-lg px-3 py-3 text-left hover:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">{account.accountName}</span>
                    <span className="block text-xs text-slate-500">CID {account.adAccountId}</span>
                  </span>
                </button>
              )) : <p className="px-3 py-2 text-sm text-slate-500">No cached accounts yet. Search and open an account to keep it here.</p>}
            </div>
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-slate-500">Select an account to retrieve its latest editable Google Ads settings.</p>
      {currentAccount ? (
        <div className="mt-4 border-t border-slate-200 pt-5">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">{currentAccount.accountName}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <span>CID {currentAccount.adAccountId}</span>
            <span aria-hidden="true">·</span>
            <span>{synchronizedAt ? `Synchronized ${new Date(synchronizedAt).toLocaleString()}` : "Retrieving latest Google Ads values..."}</span>
          </div>
        </div>
      ) : null}
      {searchError ? <p className="mt-2 text-sm text-red-600">{searchError}</p> : null}
    </section>
  );
}
function isManagementAccountSuggestion(value: unknown): value is ManagementAccountSuggestion {
  if (!value || typeof value !== "object") return false;
  const account = value as Record<string, unknown>;
  return typeof account.accountName === "string" && /^google\s*-\s*/i.test(account.accountName.trim()) && typeof account.adAccountId === "string";
}
function readManagementAccountCache(query: string): ManagementAccountSuggestion[] | null {
  try {
    const cache = JSON.parse(window.localStorage.getItem(MANAGEMENT_ACCOUNT_CACHE_KEY) ?? "{}") as Record<string, { expiresAt?: number; accounts?: unknown }>;
    const entry = cache[query.toLowerCase()];
    if (!entry || typeof entry.expiresAt !== "number" || entry.expiresAt <= Date.now() || !Array.isArray(entry.accounts)) return null;
    return entry.accounts.filter(isManagementAccountSuggestion);
  } catch {
    window.localStorage.removeItem(MANAGEMENT_ACCOUNT_CACHE_KEY);
    return null;
  }
}
function writeManagementAccountCache(query: string, accounts: ManagementAccountSuggestion[]) {
  try {
    const cache = JSON.parse(window.localStorage.getItem(MANAGEMENT_ACCOUNT_CACHE_KEY) ?? "{}") as Record<string, { expiresAt: number; accounts: ManagementAccountSuggestion[] }>;
    cache[query.toLowerCase()] = {
      expiresAt: Date.now() + MANAGEMENT_ACCOUNT_CACHE_TTL_MS,
      accounts,
    };
    const fresh = Object.entries(cache)
      .filter(([, entry]) => entry.expiresAt > Date.now())
      .slice(-20);
    window.localStorage.setItem(MANAGEMENT_ACCOUNT_CACHE_KEY, JSON.stringify(Object.fromEntries(fresh)));
  } catch {
    /* Account search remains available when localStorage is unavailable. */
  }
}
function readRecentManagementAccounts(): ManagementAccountSuggestion[] {
  try {
    const accounts = JSON.parse(window.localStorage.getItem(MANAGEMENT_RECENT_ACCOUNTS_KEY) ?? "[]") as unknown[];
    return accounts.filter(isManagementAccountSuggestion).slice(0, 5);
  } catch {
    window.localStorage.removeItem(MANAGEMENT_RECENT_ACCOUNTS_KEY);
    return [];
  }
}
function writeRecentManagementAccounts(accounts: ManagementAccountSuggestion[]) {
  try {
    window.localStorage.setItem(MANAGEMENT_RECENT_ACCOUNTS_KEY, JSON.stringify(accounts.slice(0, 5)));
  } catch {
    /* Recent accounts are optional. */
  }
}
function ResourceTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`min-w-[130px] flex-1 rounded-xl border px-4 py-3 text-center text-sm font-semibold transition-colors ${active ? "border-red-200 bg-red-50 text-red-800" : "border-transparent text-slate-700 hover:bg-slate-50"}`}>
      {label}
    </button>
  );
}
function EmptyEditor({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">{text}</div>;
}
function useClientPagination<T>(rows: readonly T[]) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<MetaPageSize>(10);
  const model = useMemo(() => paginateRows(rows, page, pageSize), [page, pageSize, rows]);
  return { ...model, setPage, setPageSize: (value: MetaPageSize) => { setPageSize(value); setPage(1); } };
}
function GooglePaginationFooter({ model }: { model: ReturnType<typeof useClientPagination<unknown>> }) {
  return <ManagementPaginationFooter model={model} />;
}
function CampaignsPage({ campaigns, onEdit }: { campaigns: ManagedCampaign[]; onEdit?: (campaignId: string) => void }) {
  const layout = getGoogleEntityViewLayout("campaigns");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const filteredCampaigns = useMemo(() => (campaignFilter === "all" ? campaigns : campaigns.filter((campaign) => campaign.id === campaignFilter)), [campaignFilter, campaigns]);
  const pagination = useClientPagination(filteredCampaigns);
  const performance = useMemo(() => {
    const daily = new Map<string, ManagedCampaignPerformancePoint>();
    for (const campaign of filteredCampaigns)
      for (const point of campaign.performance ?? []) {
        const current = daily.get(point.date) ?? {
          date: point.date,
          costMicros: "0",
          impressions: 0,
          clicks: 0,
          conversions: 0,
          interactions: 0,
        };
        daily.set(point.date, {
          date: point.date,
          costMicros: String(Number(current.costMicros) + Number(point.costMicros)),
          impressions: current.impressions + point.impressions,
          clicks: current.clicks + point.clicks,
          conversions: current.conversions + point.conversions,
          interactions: current.interactions + point.interactions,
        });
      }
    return [...daily.values()].sort((left, right) => left.date.localeCompare(right.date));
  }, [filteredCampaigns]);
  return (
    <div className="space-y-8">
      <div className="py-1">
        <PerformancePanel
          performance={performance}
          title={layout.performanceTitle}
          headerControl={
            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger id="campaign-filter" aria-label="Campaign filter" className="w-full bg-white sm:w-72">
                <SelectValue placeholder="Select a campaign" />
              </SelectTrigger>
              <SelectContent position="popper" align="end" className={MANAGEMENT_FILTER_MENU_CLASS}>
                <SelectItem value="all">All campaigns</SelectItem>
                {campaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>)}
              </SelectContent>
            </Select>
          }
        />
      </div>
      <div className={GOOGLE_PAGINATED_LIST_CLASS}><CampaignsTable campaigns={pagination.items} onEdit={onEdit} /><GooglePaginationFooter model={pagination} /></div>
    </div>
  );
}
function CampaignsTable({ campaigns, onEdit = () => undefined }: { campaigns: ManagedCampaign[]; onEdit?: (campaignId: string) => void }) {
  const number = new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 });
  const percent = (value: number | null | undefined) => (typeof value === "number" ? `${number.format(value * 100)}%` : "—");
  return <section className="overflow-hidden rounded-t-2xl border border-b-0 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-5"><div><h3 className="font-semibold">Campaign report</h3><p className="mt-1 text-xs text-slate-500">Each campaign starts collapsed. Select View metrics to see its performance and delivery details.</p></div><span className="text-xs text-slate-500">{campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}</span></div>{campaigns.length ? <div className="divide-y">{campaigns.map((campaign) => { const fallback = campaignMetricSummary(campaign); const summary = campaign.summaryMetrics; const metrics = summary ? metricSummary(summary) : fallback; const interactions = Number(summary?.interactions ?? (campaign.performance ?? []).reduce((sum, point) => sum + point.interactions, 0)); const costPerConversion = metrics.conversions ? metrics.cost / metrics.conversions : 0; const budgetPeriod = campaign.budgetType === "DAILY" ? "/day" : ` · ${formatStatus(campaign.budgetType)}`; const details = [{ label: "Budget", value: `${campaign.currencyCode}${number.format(Number(campaign.budgetAmountMicros) / 1_000_000)}${budgetPeriod}` }, { label: "Optimization score", value: campaign.optimizationScore == null ? "—" : percent(campaign.optimizationScore) }, { label: "Impressions", value: number.format(metrics.impressions) }, { label: "Clicks", value: number.format(metrics.clicks) }, { label: "Average CPC", value: metrics.clicks ? number.format(metrics.averageCpc) : "—" }, { label: "CTR", value: metrics.impressions ? `${number.format(metrics.ctr)}%` : "—" }, { label: "Cost", value: number.format(metrics.cost) }, { label: "Conversions", value: number.format(metrics.conversions) }, { label: "Cost / conversion", value: metrics.conversions ? number.format(costPerConversion) : "0.00" }, { label: "Conversion rate", value: summary?.conversionRate == null ? interactions ? `${number.format((metrics.conversions / interactions) * 100)}%` : "0.00%" : percent(summary.conversionRate) }, { label: "All conversions", value: number.format(summary?.allConversions ?? metrics.conversions) }, { label: "Interactions", value: number.format(interactions) }, { label: "Lost IS (budget)", value: percent(summary?.searchBudgetLostImpressionShare) }, { label: "Lost IS (rank)", value: percent(summary?.searchRankLostImpressionShare) }]; return <Collapsible key={campaign.id} defaultOpen={false} className="group/campaign"><div className="grid items-center gap-4 py-4 pl-5 pr-7 md:grid-cols-[minmax(0,1fr)_40px_150px_190px_128px]"><div className="min-w-0"><span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Campaign</span><div className="flex min-w-0 items-center gap-3"><StatusDot status={campaign.status} /><ManagementEntityName text={campaign.name} /></div></div><Button type="button" size="icon-sm" variant="ghost" className="ads-edit-action justify-self-center text-red-700" aria-label={`Edit campaign ${campaign.name}`} onClick={() => onEdit(campaign.id)}><PencilIcon /></Button><div className="text-sm"><span className="block text-[11px] uppercase tracking-wide text-slate-400">Budget</span><span className="font-medium">{campaign.currencyCode}{number.format(Number(campaign.budgetAmountMicros) / 1_000_000)}{budgetPeriod}</span></div><div className="min-w-0 text-sm"><span className="block text-[11px] uppercase tracking-wide text-slate-400">Delivery status</span><ServingStatus status={campaign.primaryStatus || campaign.status} reasons={campaign.primaryStatusReasons} /></div><CollapsibleTrigger asChild><Button type="button" variant="outline" size="sm" className="w-32 justify-center" aria-label={`Toggle details for ${campaign.name}`}><span className="group-data-[state=open]/campaign:hidden">View metrics</span><span className="hidden group-data-[state=open]/campaign:inline">Hide metrics</span><ChevronDownIcon className="transition-transform group-data-[state=open]/campaign:rotate-180" /></Button></CollapsibleTrigger></div><CollapsibleContent className="border-t bg-slate-50/70 px-5 py-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">{details.map((detail) => <div key={detail.label} className="rounded-lg border bg-white p-3 shadow-xs"><span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">{detail.label}</span><strong className="mt-1 block text-sm font-semibold text-slate-800">{detail.value}</strong></div>)}</div></CollapsibleContent></Collapsible>; })}</div> : <EmptyEditor text="No campaigns match this filter." />}</section>;
}
function AdGroupsPage({ campaigns, onEdit }: { campaigns: ManagedCampaign[]; onEdit?: (campaignId: string, adGroupId: string) => void }) {
  const layout = getGoogleEntityViewLayout("ad_groups");
  const rows = useMemo(() => campaigns.flatMap((campaign) => campaign.adGroups.map((adGroup) => ({ campaign, adGroup }))), [campaigns]);
  const [adGroupFilter, setAdGroupFilter] = useState("all");
  const filteredRows = useMemo(() => (adGroupFilter === "all" ? rows : rows.filter(({ adGroup }) => adGroup.id === adGroupFilter)), [adGroupFilter, rows]);
  const pagination = useClientPagination(filteredRows);
  const performance = useMemo(() => {
    const daily = new Map<string, ManagedCampaignPerformancePoint>();
    for (const { adGroup } of filteredRows)
      for (const point of adGroup.performance ?? []) {
        const current = daily.get(point.date) ?? {
          date: point.date,
          costMicros: "0",
          impressions: 0,
          clicks: 0,
          conversions: 0,
          interactions: 0,
        };
        daily.set(point.date, {
          date: point.date,
          costMicros: String(Number(current.costMicros) + Number(point.costMicros)),
          impressions: current.impressions + point.impressions,
          clicks: current.clicks + point.clicks,
          conversions: current.conversions + point.conversions,
          interactions: current.interactions + point.interactions,
        });
      }
    return [...daily.values()].sort((left, right) => left.date.localeCompare(right.date));
  }, [filteredRows]);
  const selectedName = adGroupFilter === "all" ? "All ad groups" : rows.find(({ adGroup }) => adGroup.id === adGroupFilter)?.adGroup.name || "Selected ad group";
  return (
    <div className="space-y-8">
      <div className="py-1">
        <PerformancePanel
          performance={performance}
          title={layout.performanceTitle}
          subtitle={`${selectedName} · daily official Google Ads metrics`}
          headerControl={
            <Select value={adGroupFilter} onValueChange={setAdGroupFilter}>
              <SelectTrigger id="ad-group-filter" aria-label={layout.filterLabel} className="w-full bg-white sm:w-72">
                <SelectValue placeholder="Select an ad group" />
              </SelectTrigger>
              <SelectContent position="popper" align="end" className={MANAGEMENT_FILTER_MENU_CLASS}>
                <SelectItem value="all">All ad groups</SelectItem>
                {rows.map(({ campaign, adGroup }) => <SelectItem key={adGroup.id} value={adGroup.id}>{adGroup.name} · {campaign.name}</SelectItem>)}
              </SelectContent>
            </Select>
          }
        />
      </div>
      <div className={GOOGLE_PAGINATED_LIST_CLASS}><AdGroupsTable rows={pagination.items} onEdit={onEdit} /><GooglePaginationFooter model={pagination} /></div>
    </div>
  );
}
function AdGroupsTable({ rows, onEdit = () => undefined }: { rows: Array<{ campaign: ManagedCampaign; adGroup: ManagedCampaign["adGroups"][number] }>; onEdit?: (campaignId: string, adGroupId: string) => void }) {
  const currency = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", minimumFractionDigits: 2 });
  const number = new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 });
  const cpcBid = (adGroup: ManagedCampaign["adGroups"][number]) => { const field = adGroup.fields.find((item) => item.fieldKey.includes("cpc_bid_micros")); const micros = Number(field?.value); return Number.isFinite(micros) && micros > 0 ? currency.format(micros / 1_000_000) : "—"; };
  return <section className="overflow-hidden rounded-t-2xl border border-b-0 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-5"><div><h3 className="font-semibold">Ad group report</h3><p className="mt-1 text-xs text-slate-500">Each ad group starts collapsed. Select View metrics to see its performance details.</p></div><span className="text-xs text-slate-500">{rows.length} ad group{rows.length === 1 ? "" : "s"}</span></div>{rows.length ? <div className="divide-y">{rows.map(({ campaign, adGroup }) => { const metrics = metricSummary(adGroup.performanceMetrics); const interactions = Number(adGroup.performanceMetrics?.interactions || 0); const averageCpm = metrics.impressions ? (metrics.cost / metrics.impressions) * 1000 : 0; const costPerConversion = metrics.conversions ? metrics.cost / metrics.conversions : 0; const interactionRate = metrics.impressions ? (interactions / metrics.impressions) * 100 : 0; const details = [{ label: "Ad group ID", value: adGroup.id }, { label: "Default max. CPC", value: cpcBid(adGroup) }, { label: "Impressions", value: number.format(metrics.impressions) }, { label: "Average CPM", value: metrics.impressions ? currency.format(averageCpm) : "—" }, { label: "Clicks", value: number.format(metrics.clicks) }, { label: "Average CPC", value: metrics.clicks ? currency.format(metrics.averageCpc) : "—" }, { label: "CTR", value: metrics.impressions ? `${number.format(metrics.ctr)}%` : "—" }, { label: "Cost", value: currency.format(metrics.cost) }, { label: "Conversions", value: number.format(metrics.conversions) }, { label: "Cost / conversion", value: metrics.conversions ? currency.format(costPerConversion) : "—" }, { label: "Interactions", value: number.format(interactions) }, { label: "Interaction rate", value: metrics.impressions ? `${number.format(interactionRate)}%` : "—" }, { label: "Ads", value: number.format(adGroup.ads.length) }]; return <Collapsible key={`${campaign.id}-${adGroup.id}`} defaultOpen={false} className="group/ad-group"><div className="grid items-center gap-4 py-4 pl-5 pr-7 md:grid-cols-[minmax(0,1fr)_40px_minmax(180px,260px)_190px_128px]"><div className="min-w-0"><span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Ad group</span><div className="flex min-w-0 items-center gap-3"><StatusDot status={adGroup.status} /><ManagementEntityName text={adGroup.name} /></div></div><Button type="button" size="icon-sm" variant="ghost" className="ads-edit-action justify-self-center text-red-700" aria-label={`Edit ad group ${adGroup.name}`} onClick={() => onEdit(campaign.id, adGroup.id)}><PencilIcon /></Button><div className="min-w-0 text-sm"><span className="block text-[11px] uppercase tracking-wide text-slate-400">Campaign</span><ManagementEntityName text={campaign.name} /></div><div className="min-w-0 text-sm"><span className="block text-[11px] uppercase tracking-wide text-slate-400">Delivery status</span><ServingStatus status={adGroup.primaryStatus || adGroup.status} reasons={adGroup.primaryStatusReasons} /></div><CollapsibleTrigger asChild><Button type="button" variant="outline" size="sm" className="w-32 justify-center" aria-label={`Toggle metrics for ${adGroup.name}`}><span className="group-data-[state=open]/ad-group:hidden">View metrics</span><span className="hidden group-data-[state=open]/ad-group:inline">Hide metrics</span><ChevronDownIcon className="transition-transform group-data-[state=open]/ad-group:rotate-180" /></Button></CollapsibleTrigger></div><CollapsibleContent className="border-t bg-slate-50/70 px-5 py-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">{details.map((detail) => <div key={detail.label} className="rounded-lg border bg-white p-3 shadow-xs"><span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">{detail.label}</span><strong className="mt-1 block break-words text-sm font-semibold text-slate-800">{detail.value}</strong></div>)}</div></CollapsibleContent></Collapsible>; })}</div> : <EmptyEditor text="No ad groups match this filter." />}</section>;
}
function ServingStatus({ status, reasons }: { status: string; reasons: string[] }) {
  return (
    <>
      <span className={status === "ELIGIBLE" ? "text-green-700" : status === "NOT_ELIGIBLE" ? "text-red-700" : "text-amber-700"}>{formatStatus(status)}</span>
      {reasons.length ? <span className="mt-1 block max-w-52 text-[11px] text-slate-500">{reasons.slice(0, 2).map(formatStatus).join(" · ")}</span> : null}
    </>
  );
}
function campaignMetricSummary(campaign: ManagedCampaign) {
  return metricSummary({
    costMicros: String((campaign.performance ?? []).reduce((sum, point) => sum + Number(point.costMicros), 0)),
    impressions: (campaign.performance ?? []).reduce((sum, point) => sum + point.impressions, 0),
    clicks: (campaign.performance ?? []).reduce((sum, point) => sum + point.clicks, 0),
    conversions: (campaign.performance ?? []).reduce((sum, point) => sum + point.conversions, 0),
    interactions: (campaign.performance ?? []).reduce((sum, point) => sum + point.interactions, 0),
  });
}
function metricSummary(metrics?: ManagedPerformanceMetrics) {
  const cost = Number(metrics?.costMicros || 0) / 1_000_000;
  const impressions = Number(metrics?.impressions || 0);
  const clicks = Number(metrics?.clicks || 0);
  const conversions = Number(metrics?.conversions || 0);
  return {
    cost,
    impressions,
    clicks,
    conversions,
    ctr: impressions ? (clicks / impressions) * 100 : 0,
    averageCpc: clicks ? cost / clicks : 0,
  };
}
function SettingsEditorSidePanel({ kind, campaign, adGroup, values, creator, changesCount, saveState, canSubmit, submitting, onFieldChange, onSave, onSubmit, onClose }: { kind: "campaign" | "ad_group"; campaign: ManagedCampaign; adGroup: ManagedCampaign["adGroups"][number] | null; values: Record<string, unknown>; creator: string; changesCount: number; saveState: SaveState; canSubmit: boolean; submitting: boolean; onFieldChange: (field: ManagedFieldValue, value: unknown) => void; onSave: () => void; onSubmit: () => void; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);
  const title = kind === "campaign" ? campaign.name : adGroup?.name || "Ad group";
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="settings-editor-title">
      <button type="button" className="absolute inset-0 cursor-default bg-slate-950/45" aria-label="Close settings editor" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-[980px] flex-col bg-[#fffafa] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b bg-white p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Edit {kind === "campaign" ? "campaign" : "ad group"}</p>
            <h2 id="settings-editor-title" className="mt-1 truncate text-2xl font-semibold">
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{kind === "campaign" ? `${formatAdType(campaign.channelType)} · Bidding: ${formatAdType(campaign.biddingStrategyType)}` : `Campaign: ${campaign.name}`}</p>
            <p className="mt-1 text-xs text-slate-400">Editing as {creator}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close settings editor" autoFocus onClick={onClose}>
            <XIcon />
          </Button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {kind === "campaign" ? (
            <>
              <CampaignPerformancePanel campaign={campaign} />
              <FieldSection title="Campaign settings" subtitle={`${formatStatus(campaign.status)} · Unsupported strategy fields remain read-only.`} fields={campaign.fields.filter((field) => field.valueType !== "sitelinks")} values={values} onChange={onFieldChange} />
            </>
          ) : adGroup ? (
            <>
              <ServingStatusPanel configuredStatus={adGroup.status} primaryStatus={adGroup.primaryStatus} reasons={adGroup.primaryStatusReasons} />
              <FieldSection title="Ad group settings" subtitle={`Campaign: ${campaign.name}`} fields={adGroup.fields.filter((field) => field.valueType !== "sitelinks")} values={values} onChange={onFieldChange} />
            </>
          ) : (
            <EmptyEditor text="This campaign has no ad groups." />
          )}
        </div>
        <EditorFooter creator={creator} changesCount={changesCount} saveState={saveState} canSubmit={canSubmit} submitting={submitting} onClose={onClose} onSave={onSave} onSubmit={onSubmit} />
      </aside>
    </div>
  );
}
function EditorFooter({ creator, changesCount, saveState, canSubmit, submitting, onClose, onSave, onSubmit }: { creator: string; changesCount: number; saveState: SaveState; canSubmit: boolean; submitting: boolean; onClose: () => void; onSave: () => void; onSubmit: () => void }) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t bg-white p-4 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
      <div className="text-sm">
        {saveState === "saving" ? (
          <>
            <Loader2Icon className="mr-2 inline size-4 animate-spin" />
            Saving…
          </>
        ) : saveState === "saved" ? (
          <>
            <CheckCircle2Icon className="mr-2 inline size-4 text-green-600" />
            {changesCount ? "Draft saved" : "Draft cleared"}
          </>
        ) : saveState === "failed" ? (
          "Autosave failed"
        ) : (
          `${changesCount} proposed edit${changesCount === 1 ? "" : "s"}`
        )}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button type="button" variant="outline" disabled={!changesCount || !creator.trim() || submitting} onClick={onSave}>
          <SaveIcon />
          Save draft
        </Button>
        <Button type="button" disabled={!canSubmit || submitting} onClick={onSubmit}>
          {submitting ? (
            <>
              <Loader2Icon className="mr-2 inline size-4 animate-spin" />
              Opening review…
            </>
          ) : (
            "Review and Publish"
          )}
        </Button>
      </div>
    </footer>
  );
}
function AdsTable({ campaigns, onEdit = () => undefined }: { campaigns: ManagedCampaign[]; onEdit?: (campaignId: string, adGroupId: string, adId: string) => void }) {
  const layout = getGoogleEntityViewLayout("ads");
  const rows = useMemo(() => campaigns.flatMap((campaign) => campaign.adGroups.flatMap((adGroup) => adGroup.ads.map((ad) => ({ campaign, adGroup, ad })))), [campaigns]);
  const [adFilter, setAdFilter] = useState("all");
  const allFilteredRows = useMemo(() => adFilter === "all" ? rows : rows.filter(({ ad }) => ad.id === adFilter), [adFilter, rows]);
  const pagination = useClientPagination(allFilteredRows);
  const filteredRows = pagination.items;
  const performance = useMemo(() => { const daily = new Map<string, ManagedCampaignPerformancePoint>(); for (const { ad } of filteredRows) for (const point of ad.performance ?? []) { const current = daily.get(point.date) ?? { date: point.date, costMicros: "0", impressions: 0, clicks: 0, conversions: 0, interactions: 0 }; daily.set(point.date, { date: point.date, costMicros: String(Number(current.costMicros) + Number(point.costMicros)), impressions: current.impressions + point.impressions, clicks: current.clicks + point.clicks, conversions: current.conversions + point.conversions, interactions: current.interactions + point.interactions }); } return [...daily.values()].sort((left, right) => left.date.localeCompare(right.date)); }, [filteredRows]);
  const selectedName = adFilter === "all" ? "All ads" : adTableSummary(rows.find(({ ad }) => ad.id === adFilter)?.ad ?? rows[0]?.ad).headlines;
  const currency = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", minimumFractionDigits: 2 });
  const number = new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 });
  return <div className="space-y-8"><div className="py-1"><PerformancePanel performance={performance} title={layout.performanceTitle} subtitle={`${selectedName} · daily official Google Ads metrics`} headerControl={<Select value={adFilter} onValueChange={setAdFilter}><SelectTrigger id="ad-filter" aria-label={layout.filterLabel} className="w-full bg-white sm:w-72"><SelectValue placeholder="Select an ad" /></SelectTrigger><SelectContent position="popper" align="end" className={MANAGEMENT_FILTER_MENU_CLASS}><SelectItem value="all">All ads</SelectItem>{rows.map(({ ad, adGroup }) => <SelectItem key={ad.id} value={ad.id}>{adTableSummary(ad).headlines} · {adGroup.name}</SelectItem>)}</SelectContent></Select>} /></div><div className={GOOGLE_PAGINATED_LIST_CLASS}>{filteredRows.length ? <section className="overflow-hidden rounded-t-2xl border border-b-0 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-5"><div><h3 className="font-semibold">Ad report</h3><p className="mt-1 text-xs text-slate-500">Each ad starts collapsed. Select View metrics to see its creative and performance details.</p></div><span className="text-xs text-slate-500">{filteredRows.length} ad{filteredRows.length === 1 ? "" : "s"}</span></div><div className="divide-y">{filteredRows.map(({ campaign, adGroup, ad }) => { const summary = adTableSummary(ad); const metrics = metricSummary(ad.performanceMetrics); const details = [{ label: "Ad ID", value: ad.id }, { label: "Internal name", value: ad.name }, { label: "Ad type", value: formatAdType(ad.adType) }, { label: "Ad strength", value: formatStatus(ad.adStrength) }, { label: "Final URL", value: summary.displayUrl }, { label: "Description", value: summary.descriptions }, { label: "Impressions", value: number.format(metrics.impressions) }, { label: "Clicks", value: number.format(metrics.clicks) }, { label: "CTR", value: metrics.impressions ? `${number.format(metrics.ctr)}%` : "—" }, { label: "Average CPC", value: metrics.clicks ? currency.format(metrics.averageCpc) : "—" }, { label: "Cost", value: currency.format(metrics.cost) }, { label: "Conversions", value: number.format(metrics.conversions) }]; return <Collapsible key={`${campaign.id}-${adGroup.id}-${ad.id}`} defaultOpen={false} className="group/ad"><div className="grid items-center gap-4 py-4 pl-5 pr-7 md:grid-cols-[minmax(0,1fr)_40px_minmax(160px,220px)_minmax(140px,190px)_128px]"><div className="min-w-0"><span className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Ad</span><div className="flex min-w-0 items-center gap-3"><StatusDot status={ad.status} /><ManagementEntityName text={summary.headlines} multiline /></div></div><Button type="button" size="icon-sm" variant="ghost" className="ads-edit-action justify-self-center text-red-700" aria-label={`Edit ad ${summary.headlines}`} onClick={() => onEdit(campaign.id, adGroup.id, ad.id)}><PencilIcon /></Button><div className="min-w-0 text-sm"><span className="block text-[11px] uppercase tracking-wide text-slate-400">Campaign</span><ManagementEntityName text={campaign.name} /></div><div className="min-w-0 text-sm"><span className="block text-[11px] uppercase tracking-wide text-slate-400">Ad group</span><ManagementEntityName text={adGroup.name} /></div><CollapsibleTrigger asChild><Button type="button" variant="outline" size="sm" className="w-32 justify-center" aria-label={`Toggle metrics for ad ${summary.headlines}`}><span className="group-data-[state=open]/ad:hidden">View metrics</span><span className="hidden group-data-[state=open]/ad:inline">Hide metrics</span><ChevronDownIcon className="transition-transform group-data-[state=open]/ad:rotate-180" /></Button></CollapsibleTrigger></div><CollapsibleContent className="border-t bg-slate-50/70 px-5 py-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">{details.map((detail) => <div key={detail.label} className={`rounded-lg border bg-white p-3 shadow-xs ${detail.label === "Description" ? "sm:col-span-2 lg:col-span-4 xl:col-span-5" : ""}`}><span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">{detail.label}</span><strong className="mt-1 block break-words text-sm font-semibold text-slate-800">{detail.value}</strong></div>)}</div></CollapsibleContent></Collapsible>; })}</div></section> : <EmptyEditor text="No ads match this filter." />}<GooglePaginationFooter model={pagination} /></div></div>;
}
function adTableSummary(ad: ManagedAd) {
  const textField = (ending: string) => ad.fields.find((field) => field.fieldKey.endsWith(ending));
  const textAssets = (field: ManagedFieldValue | undefined) => (Array.isArray(field?.value) ? (field.value as ManagedAdTextAsset[]).map((asset) => asset.text).filter(Boolean) : []);
  const headlines = textAssets(textField("headlines"));
  const descriptions = textAssets(textField("descriptions"));
  const finalUrl = String(ad.fields.find((field) => field.fieldKey === "ad.final_url")?.value || "");
  const path1 = String(ad.fields.find((field) => field.fieldKey === "ad.path1" || field.fieldKey.endsWith("breadcrumb1"))?.value || "");
  const path2 = String(ad.fields.find((field) => field.fieldKey === "ad.path2" || field.fieldKey.endsWith("breadcrumb2"))?.value || "");
  let displayUrl = finalUrl || "No final URL";
  try {
    const parsed = new URL(finalUrl);
    displayUrl = `${parsed.hostname}${path1 ? `/${path1}` : ""}${path2 ? `/${path2}` : ""}`;
  } catch {}
  return {
    headlines: headlines.slice(0, 3).join(" | ") || ad.name,
    moreHeadlines: Math.max(0, headlines.length - 3),
    displayUrl,
    descriptions: descriptions.slice(0, 2).join(" ") || "No description assets returned.",
  };
}
function AdEditorSidePanel({ campaign, adGroupName, ad, values, creator, changesCount, saveState, canSubmit, submitting, onFieldChange, onSave, onSubmit, onClose }: { campaign: ManagedCampaign; adGroupName: string; ad: ManagedAd; values: Record<string, unknown>; creator: string; changesCount: number; saveState: SaveState; canSubmit: boolean; submitting: boolean; onFieldChange: (field: ManagedFieldValue, value: unknown) => void; onSave: () => void; onSubmit: () => void; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);
  const summary = adTableSummary(ad);
  const sitelinkField = campaign.fields.find((field) => field.valueType === "sitelinks");
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="ad-editor-title">
      <button type="button" className="absolute inset-0 cursor-default bg-slate-950/45" aria-label="Close ad editor" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-[980px] flex-col bg-[#fffafa] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b bg-white p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Edit ad</p>
            <h2 id="ad-editor-title" className="mt-1 truncate text-2xl font-semibold">
              {summary.headlines}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {campaign.name} · {adGroupName} · {formatAdType(ad.adType)}
            </p>
            <p className="mt-1 text-xs text-slate-400">Editing as {creator}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close ad editor" autoFocus onClick={onClose}>
            <XIcon />
          </Button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <GoogleStyleAdEditor ad={ad} sitelinkField={sitelinkField} values={values} onChange={onFieldChange} />
        </div>
        <EditorFooter creator={creator} changesCount={changesCount} saveState={saveState} canSubmit={canSubmit} submitting={submitting} onClose={onClose} onSave={onSave} onSubmit={onSubmit} />
      </aside>
    </div>
  );
}
function CampaignPerformancePanel({ campaign }: { campaign: ManagedCampaign }) {
  return <PerformancePanel performance={campaign.performance ?? []} title="Campaign performance" subtitle="Daily official Google Ads metrics for the selected campaign" />;
}
function PerformancePanel({ performance, title, subtitle, headerControl }: { performance: ManagedCampaignPerformancePoint[]; title: string; subtitle?: string; headerControl?: React.ReactNode }) {
  return <ManagementPerformancePanel points={toGoogleManagementPerformancePoints(performance)} title={title} subtitle={subtitle} headerControl={headerControl} labels={{ cost: "Spend", results: "Results", clicks: "Clicks", costPerResult: "Cost / result" }} emptyTitle="No performance activity in this date range" emptyDescription="Google returned no daily spend, result, or click rows for this selection." chartAriaLabel="Google Ads performance line chart" />;
}
function RecommendationsPage({ recommendations, loading, error, optimizationScore, optimizationScoreUrl, filter, onFilter, canEdit, onRequestChange }: { accountId: string; accountName: string; recommendations: ManagedRecommendation[]; loading: boolean; error: string | null; optimizationScore: number | null; optimizationScoreUrl: string | null; filter: "all" | ManagedRecommendationCategory; onFilter: (filter: "all" | ManagedRecommendationCategory) => void; canEdit: boolean; onRequestChange: (recommendation: Pick<ManagedRecommendation, "title" | "description"> & Partial<Pick<ManagedRecommendation, "campaignResourceName" | "category">>) => void }) {
  const filters: Array<{
    key: "all" | ManagedRecommendationCategory;
    label: string;
  }> = [
    { key: "all", label: "All" },
    { key: "repairs", label: "Repairs" },
    { key: "bidding_budgets", label: "Bidding & budgets" },
    { key: "keywords_targeting", label: "Keywords & targeting" },
    { key: "ads_assets", label: "Ads & assets" },
    { key: "measurement", label: "Measurement" },
  ];
  const visible = filter === "all" ? recommendations : recommendations.filter((item) => item.category === filter);
  const visibleGoogleAdsGuidance = filter === "all" ? googleAdsViewOnlyGuidance : googleAdsViewOnlyGuidance.filter((item) => item.category === filter);
  const groups = Object.values(
    visible.reduce<Record<string, ManagedRecommendation[]>>((result, recommendation) => {
      (result[recommendation.type] ??= []).push(recommendation);
      return result;
    }, {}),
  ).sort((left, right) => recommendationGroupUplift(right) - recommendationGroupUplift(left));
  function prepareApply(items: ManagedRecommendation[]) {
    if (!canEdit || !items.length) return;
    onRequestChange(items[0]);
  }
  return (
    <div className={`space-y-5 ${canEdit ? "" : "[&_.recommendation-apply-action]:hidden"}`}>
      <section className="rounded-2xl border bg-white px-6 py-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Google Ads</p>
        <h2 className="mt-1 text-3xl font-semibold">Recommendations</h2>
      </section>
      <div className="grid items-stretch gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold">Your optimization score</p>
          <div className="mt-2 flex items-end justify-between">
            <strong className="text-4xl font-medium text-red-600">{optimizationScore == null ? "—" : `${Math.round(optimizationScore * 100)}%`}</strong>
            <span className="text-xs text-slate-500">Current account score</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-red-600 transition-all"
              style={{
                width: `${Math.max(0, Math.min(100, (optimizationScore ?? 0) * 100))}%`,
              }}
            />
          </div>
        </section>
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex h-full flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {filters.map((item) => {
                const categoryRecommendations = item.key === "all" ? recommendations : recommendations.filter((recommendation) => recommendation.category === item.key);
                const uplift = recommendationCategoryUplift(categoryRecommendations);
                return (
                  <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => onFilter(item.key)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${filter === item.key ? "border-red-200 bg-red-50 text-red-700" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                    {item.label}
                    {uplift ? <span className="ml-1 text-red-600">{uplift}</span> : null}
                    <span className="ml-1 text-[10px] opacity-60">({categoryRecommendations.length})</span>
                  </button>
                );
              })}
            </div>
            {visible.length > 1 ? (
              <Button type="button" size="sm" className="recommendation-apply-action bg-red-600 text-white hover:bg-red-700" onClick={() => prepareApply(visible)}>
                Request selected change
              </Button>
            ) : null}
          </div>
        </section>
      </div>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }, (_, index) => <div key={index} className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div className="flex-1"><Skeleton className="h-4 w-20" /><Skeleton className="mt-4 h-5 w-2/3" /><Skeleton className="mt-3 h-4 w-full" /></div><Skeleton className="h-9 w-28" /></div></div>)}</div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          <AlertTriangleIcon className="mr-2 inline size-4" />
          {error}
        </div>
      ) : null}
      {!loading && !error && groups.length ? (
        <div className="space-y-2">
          {groups.map((items, index) => (
            <RecommendationCard key={items[0].type} recommendations={items} featured={index === 0 && filter === "all"} onApply={() => prepareApply(items)} />
          ))}
        </div>
      ) : null}
      {!loading && !error && !visible.length ? (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center">
          <CheckCircle2Icon className="mx-auto size-8 text-green-600" />
          <h3 className="mt-3 font-semibold">No active recommendations in this category</h3>
          <p className="mt-1 text-sm text-slate-500">Google did not return any current recommendation for the selected filter.</p>
        </div>
      ) : null}
      {!loading && !error && optimizationScoreUrl && visibleGoogleAdsGuidance.length ? (
        <section className="space-y-4">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Additional Google Ads guidance</p>
            <h3 className="mt-1 text-2xl font-semibold">Setup opportunities</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">These suggestions are not returned as live Recommendation API resources. Post-launch changes are reviewed in Change Control; account-level setup still requires Google Ads.</p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {visibleGoogleAdsGuidance.map((item) => (
              <GoogleAdsViewOnlyCard key={item.title} item={item} googleUrl={optimizationScoreUrl} onRequestChange={() => onRequestChange({ title: item.title, description: item.description })} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
interface GoogleAdsViewOnlyGuidanceItem {
  title: string;
  description: string;
  category: ManagedRecommendationCategory;
  editableInDashboard?: boolean;
}
const googleAdsViewOnlyGuidance: GoogleAdsViewOnlyGuidanceItem[] = [
  {
    title: "Finish setting up conversion tracking",
    description: "Review conversion actions that are not yet reporting conversions.",
    category: "measurement",
  },
  {
    title: "Add images to your ads",
    description: "Review image opportunities Google identifies from your ads and landing pages.",
    category: "ads_assets",
    editableInDashboard: true,
  },
  {
    title: "Create and link a Merchant Center account",
    description: "Review whether Merchant Center setup can unlock product advertising options.",
    category: "ads_assets",
  },
  {
    title: "Import Customer Match lists",
    description: "Review eligibility and setup for using customer-provided data in Google Ads.",
    category: "keywords_targeting",
  },
  {
    title: "Use your conversion data for Customer Match",
    description: "Review whether recent conversion data can support Customer Match audiences.",
    category: "keywords_targeting",
  },
  {
    title: "Link a YouTube channel to Google Ads",
    description: "Review channel linking to unlock engagement audiences and additional reporting.",
    category: "ads_assets",
  },
  {
    title: "Use business logo in your search ads",
    description: "Review account-level business logo setup for eligible Search ads.",
    category: "ads_assets",
    editableInDashboard: true,
  },
  {
    title: "Add videos with different orientations",
    description: "Review video coverage across horizontal, square, and vertical placements.",
    category: "ads_assets",
    editableInDashboard: true,
  },
  {
    title: "Try the Google Ads mobile app",
    description: "Open Google Ads to review its mobile account-management guidance.",
    category: "repairs",
  },
];
function GoogleAdsViewOnlyCard({ item, googleUrl, onRequestChange }: { item: GoogleAdsViewOnlyGuidanceItem; googleUrl: string; onRequestChange: () => void }) {
  return (
    <article className="flex min-h-56 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex-1 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-slate-100 text-slate-600">
            <ArrowUpRightIcon className="size-4" />
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.editableInDashboard ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{item.editableInDashboard ? "Change Control" : "Google Ads setup"}</span>
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{recommendationCategoryLabel(item.category)}</p>
        <h4 className="mt-1 text-lg font-semibold">{item.title}</h4>
        <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
      </div>
      <div className="flex justify-end border-t px-5 py-3">
        {item.editableInDashboard ? (
          <Button type="button" size="sm" variant="outline" onClick={onRequestChange}>
            Request change
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <a href={googleUrl} target="_blank" rel="noreferrer">
              Open account setup <ArrowUpRightIcon />
            </a>
          </Button>
        )}
      </div>
    </article>
  );
}
function RecommendationCard({ recommendations, featured, onApply }: { recommendations: ManagedRecommendation[]; featured: boolean; onApply: () => void }) {
  const recommendation = recommendations[0];
  const delta = recommendationGroupDelta(recommendations);
  const uplift = formatRecommendationUplift(recommendationGroupUplift(recommendations));
  const campaignNames = [...new Set(recommendations.flatMap((item) => (item.campaignName ? [item.campaignName] : [])))];
  return (
    <details className="group overflow-hidden rounded-xl border bg-white shadow-sm" open={featured}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-red-50 text-red-700">
          <LightbulbIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <strong className="text-sm text-slate-900">{recommendation.title}</strong>
            {featured ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">Top recommendation</span> : null}
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {recommendationCategoryLabel(recommendation.category)}
            {recommendations.length > 1 ? ` · ${recommendations.length} recommendations` : ""}
          </span>
        </span>
        {uplift ? <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">{uplift}</span> : null}
        <Button
          type="button"
          size="sm"
          className="recommendation-apply-action bg-red-600 text-white hover:bg-red-700"
          aria-label={recommendations.length > 1 ? `Apply ${recommendations.length} recommendations` : `Apply ${recommendation.title}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onApply();
          }}
        >
          {recommendations.length > 1 ? `Apply ${recommendations.length}` : "Apply"}
        </Button>
        <ChevronDownIcon className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t bg-slate-50/60 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-3xl text-sm leading-6 text-slate-600">{recommendation.description}</p>
          {delta ? (
            <div className="shrink-0 rounded-lg border border-green-100 bg-green-50 px-3 py-2">
              <span className="block text-[10px] uppercase tracking-wide text-green-700">Projected impact</span>
              <strong className="text-base text-green-800">{delta}</strong>
            </div>
          ) : null}
        </div>
        <div className="mt-4 space-y-3">
          {recommendations.map((item, index) => (
            <RecommendationInstance key={item.resourceName} recommendation={item} index={index} total={recommendations.length} />
          ))}
        </div>
        {recommendations.length > 1 && campaignNames.length ? <p className="mt-3 text-xs leading-5 text-slate-500">Affected campaigns: {campaignNames.join(" · ")}</p> : null}
      </div>
    </details>
  );
}
function RecommendationInstance({ recommendation, index, total }: { recommendation: ManagedRecommendation; index: number; total: number }) {
  const context = [recommendation.campaignName, recommendation.adGroupName].filter(Boolean).join(" · ");
  const impact = recommendationDelta(recommendation);
  const presentation = recommendationDetailPresentation[recommendation.details.family];
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-wide ${presentation.labelClass}`}>{total > 1 ? `Recommendation ${index + 1} · ${presentation.label}` : presentation.label}</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{context || "Account-level recommendation"}</p>
        </div>
        {impact ? <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">{impact}</span> : null}
      </div>
      {recommendation.details.sections.length ? (
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          {recommendation.details.sections.map((section, sectionIndex) => (
            <RecommendationDetailSectionView key={`${section.title}-${sectionIndex}`} section={section} />
          ))}
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-slate-500">Google did not return additional structured details for this recommendation.</p>
      )}
    </article>
  );
}
const recommendationDetailPresentation: Record<ManagedRecommendationDetailFamily, { label: string; labelClass: string }> = {
  keyword: { label: "Keyword opportunity", labelClass: "text-red-700" },
  budget: { label: "Budget recommendation", labelClass: "text-red-700" },
  bidding: { label: "Bidding recommendation", labelClass: "text-red-700" },
  asset: { label: "Ad and asset recommendation", labelClass: "text-red-700" },
  targeting: { label: "Targeting recommendation", labelClass: "text-red-700" },
  shopping: { label: "Shopping recommendation", labelClass: "text-amber-700" },
  repair: { label: "Issue to resolve", labelClass: "text-red-700" },
  generic: { label: "Recommendation details", labelClass: "text-slate-500" },
};
function RecommendationDetailSectionView({ section }: { section: ManagedRecommendationDetailSection }) {
  if (section.layout === "comparison") {
    return (
      <section className="rounded-xl border border-red-100 bg-red-50/50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">{section.title}</p>
        <div className="mt-3 space-y-3">
          {section.items.map((item, index) => (
            <div key={`${item.label}-${index}`}>
              <p className="text-xs text-slate-500">{item.label}</p>
              <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                <span className="rounded-lg border bg-white px-3 py-2 text-slate-600">{item.previousValue || "—"}</span>
                <span className="text-slate-400">→</span>
                <strong className="rounded-lg border border-red-200 bg-white px-3 py-2 text-red-700">{item.recommendedValue || "—"}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section.title}</p>
      <div className="mt-3 space-y-3">
        {section.items.map((item, index) => (
          <div key={`${item.label}-${index}`}>
            <p className="text-xs text-slate-500">{item.label}</p>
            {item.values?.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {item.values.map((value, valueIndex) => <span key={`${value}-${valueIndex}`} className="max-w-full break-words rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{value}</span>)}
              </div>
            ) : <p className="mt-1 break-words text-sm font-semibold text-slate-900">{item.value || "—"}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
function recommendationDelta(recommendation: ManagedRecommendation): string | null {
  const clicks = Number(recommendation.potentialMetrics?.clicks || 0) - Number(recommendation.baseMetrics?.clicks || 0);
  if (clicks > 0) return `+${Math.round(clicks)} clicks`;
  const conversions = Number(recommendation.potentialMetrics?.conversions || 0) - Number(recommendation.baseMetrics?.conversions || 0);
  if (conversions > 0) return `+${conversions.toFixed(1)} conversions`;
  const impressions = Number(recommendation.potentialMetrics?.impressions || 0) - Number(recommendation.baseMetrics?.impressions || 0);
  return impressions > 0 ? `+${Math.round(impressions)} impressions` : null;
}
function recommendationGroupDelta(recommendations: ManagedRecommendation[]): string | null {
  const clicks = recommendations.reduce((sum, recommendation) => sum + Number(recommendation.potentialMetrics?.clicks || 0) - Number(recommendation.baseMetrics?.clicks || 0), 0);
  if (clicks > 0) return `+${Math.round(clicks)} clicks`;
  const conversions = recommendations.reduce((sum, recommendation) => sum + Number(recommendation.potentialMetrics?.conversions || 0) - Number(recommendation.baseMetrics?.conversions || 0), 0);
  if (conversions > 0) return `+${conversions.toFixed(1)} conversions`;
  const impressions = recommendations.reduce((sum, recommendation) => sum + Number(recommendation.potentialMetrics?.impressions || 0) - Number(recommendation.baseMetrics?.impressions || 0), 0);
  return impressions > 0 ? `+${Math.round(impressions)} impressions` : null;
}
function recommendationGroupUplift(recommendations: ManagedRecommendation[]): number {
  return recommendations.find((recommendation) => typeof recommendation.optimizationScoreUplift === "number")?.optimizationScoreUplift ?? 0;
}
function recommendationCategoryUplift(recommendations: ManagedRecommendation[]): string | null {
  const byType = new Map<string, number>();
  for (const recommendation of recommendations) if (typeof recommendation.optimizationScoreUplift === "number") byType.set(recommendation.type, recommendation.optimizationScoreUplift);
  return formatRecommendationUplift([...byType.values()].reduce((sum, value) => sum + value, 0));
}
function formatRecommendationUplift(value: number): string | null {
  if (!(value > 0)) return null;
  const percent = value * 100;
  return percent < 0.1 ? "+<0.1%" : `+${percent.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}
function recommendationCategoryLabel(category: ManagedRecommendationCategory) {
  return (
    {
      repairs: "Repairs",
      bidding_budgets: "Bidding & budgets",
      keywords_targeting: "Keywords & targeting",
      ads_assets: "Ads & assets",
      measurement: "Measurement",
    } as Record<ManagedRecommendationCategory, string>
  )[category];
}
function ServingStatusPanel({ configuredStatus, primaryStatus, reasons }: { configuredStatus: string; primaryStatus: string; reasons: string[] }) {
  const tone = primaryStatus === "ELIGIBLE" ? "border-green-200 bg-green-50 text-green-900" : primaryStatus === "NOT_ELIGIBLE" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div className={`rounded-2xl border p-5 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Serving status</p>
          <h3 className="mt-1 text-lg font-semibold">{formatStatus(primaryStatus)}</h3>
        </div>
        <div className="rounded-full border border-current/20 bg-white/60 px-3 py-1 text-sm">Configured: {formatStatus(configuredStatus)}</div>
      </div>
      <p className="mt-3 text-sm">{reasons.length ? reasons.map(formatStatus).join(" · ") : "Google returned no additional serving-status reason."}</p>
    </div>
  );
}
function AdStrengthPanel({ strength, actionItems }: { strength: string; actionItems: string[] }) {
  const tone = strength === "EXCELLENT" || strength === "GOOD" ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50";
  return (
    <div className={`rounded-2xl border p-5 ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Google ad strength</p>
      <h3 className="mt-1 text-lg font-semibold">{formatStatus(strength)}</h3>
      {actionItems.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {actionItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-600">Google returned no additional recommendation.</p>
      )}
    </div>
  );
}
function formatStatus(value: string) {
  return value
    ? value
        .toLowerCase()
        .split("_")
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
        .join(" ")
    : "Unknown";
}
function formatAdType(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");
}
function GoogleStyleAdEditor({ ad, sitelinkField, values, onChange }: { ad: ManagedAd; sitelinkField?: ManagedFieldValue; values: Record<string, unknown>; onChange: (field: ManagedFieldValue, value: unknown) => void }) {
  const identity = ad.fields.filter((field) => field.fieldKey === "ad_group_ad.status" || field.fieldKey === "ad.name");
  const destination = ad.fields.filter((field) => field.fieldKey === "ad.final_url");
  const automation = ad.fields.filter((field) => field.valueType === "asset_automation_settings");
  const media = ad.fields.filter((field) => ["asset_ref", "asset_refs"].includes(field.valueType) && !field.fieldKey.includes("call_to_action"));
  const text = ad.fields.filter((field) => field.valueType === "text_assets" || field.valueType === "single_text_asset" || field.fieldKey.includes("business_name") || field.fieldKey.includes("call_to_action"));
  const advanced = ad.fields.filter((field) => field.valueType === "url_list" || field.valueType === "custom_parameters" || field.fieldKey.includes("tracking_url") || field.fieldKey.includes("final_url_suffix") || field.fieldKey.includes("breadcrumb") || field.fieldKey === "ad.path1" || field.fieldKey === "ad.path2");
  const used = new Set([...identity, ...destination, ...automation, ...media, ...text, ...advanced]);
  const additional = ad.fields.filter((field) => !used.has(field));
  return (
    <div className="space-y-4">
      <AdStrengthPanel strength={ad.adStrength} actionItems={ad.actionItems} />
      <GoogleEditorCard title="Ad name" subtitle="Used internally to identify this ad">
        <FieldGrid fields={identity} values={values} onChange={onChange} />
        <p className="mt-3 text-xs text-slate-500">Google’s API makes an existing ad name immutable. Renaming requires a controlled replace-ad workflow.</p>
      </GoogleEditorCard>
      <GoogleEditorCard title="Final URL">
        <FieldGrid fields={destination} values={values} onChange={onChange} />
      </GoogleEditorCard>
      {sitelinkField ? (
        <GoogleEditorCard title="Sitelinks">
          <FieldGrid fields={[sitelinkField]} values={values} onChange={onChange} />
        </GoogleEditorCard>
      ) : null}
      {media.length ? (
        <GoogleEditorCard title="Media" subtitle="Videos, images and logos attached to this ad">
          <FieldGrid fields={media} values={values} onChange={onChange} />
        </GoogleEditorCard>
      ) : null}
      {text.length ? (
        <GoogleEditorCard title="Text">
          <FieldGrid fields={text} values={values} onChange={onChange} />
        </GoogleEditorCard>
      ) : null}
      {automation.length ? (
        <GoogleEditorCard title="Asset optimization" subtitle="Let Google create optimized versions of existing content">
          <FieldGrid fields={automation} values={values} onChange={onChange} />
        </GoogleEditorCard>
      ) : null}
      {advanced.length ? (
        <GoogleEditorCard title="URL and other options" defaultOpen={false}>
          <FieldGrid fields={advanced} values={values} onChange={onChange} />
        </GoogleEditorCard>
      ) : null}
      {additional.length ? (
        <GoogleEditorCard title="Additional settings" defaultOpen={false}>
          <FieldGrid fields={additional} values={values} onChange={onChange} />
        </GoogleEditorCard>
      ) : null}
    </div>
  );
}
function GoogleEditorCard({ title, subtitle, defaultOpen = true, children }: { title: string; subtitle?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
        <span>
          <span className="block text-lg font-semibold">{title}</span>
          {subtitle ? <span className="mt-0.5 block text-xs text-slate-500">{subtitle}</span> : null}
        </span>
        <ChevronDownIcon className={`size-5 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="border-t px-5 py-5">{children}</div> : null}
    </section>
  );
}
function FieldSection({ title, subtitle, fields, values, onChange }: { title: string; subtitle?: string; fields: ManagedFieldValue[]; values: Record<string, unknown>; onChange: (f: ManagedFieldValue, v: unknown) => void }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <h3 className="font-semibold">{title}</h3>
      {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      <div className="mt-4">
        <FieldGrid fields={fields} values={values} onChange={onChange} />
      </div>
    </div>
  );
}
function FieldGrid({ fields, values, onChange }: { fields: ManagedFieldValue[]; values: Record<string, unknown>; onChange: (f: ManagedFieldValue, v: unknown) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => {
        const current = values[fieldId(f)];
        const displayPath = f.fieldKey === "ad.path1" || f.fieldKey === "ad.path2" || f.fieldKey.endsWith(".breadcrumb1") || f.fieldKey.endsWith(".breadcrumb2");
        if (f.valueType === "text_assets") return <TextAssetsEditor key={fieldId(f)} field={f} value={current} onChange={(value) => onChange(f, value)} />;
        if (f.valueType === "sitelinks") return <SitelinksEditor key={fieldId(f)} field={f} value={current} onChange={(value) => onChange(f, value)} />;
        if (f.valueType === "asset_refs") return <AssetRefsEditor key={fieldId(f)} field={f} value={current} onChange={(value) => onChange(f, value)} />;
        if (f.valueType === "url_list") return <StringListEditor key={fieldId(f)} field={f} value={current} onChange={(value) => onChange(f, value)} />;
        if (f.valueType === "custom_parameters") return <CustomParametersEditor key={fieldId(f)} field={f} value={current} onChange={(value) => onChange(f, value)} />;
        if (f.valueType === "asset_automation_settings") return <AssetAutomationEditor key={fieldId(f)} field={f} value={current} onChange={(value) => onChange(f, value)} />;
        if (f.valueType === "money_micros") return <MoneyMicrosInput key={fieldId(f)} field={f} value={current} onChange={(value) => onChange(f, value)} />;
        if (f.valueType === "boolean")
          return (
            <label key={fieldId(f)} className="flex items-center gap-3 rounded-xl border p-3">
              <input type="checkbox" checked={Boolean(current)} disabled={!f.editable} onChange={(event) => onChange(f, event.target.checked)} />
              <span className="text-sm font-medium">{f.fieldLabel}</span>
            </label>
          );
        return (
          <label key={fieldId(f)} className="space-y-1">
            <span className="text-sm font-medium">
              {f.fieldLabel}
              {!f.editable ? <span className="ml-2 text-xs text-slate-400">Read only</span> : null}
            </span>
            {f.fieldKey.endsWith("status") ? (
              <select disabled={!f.editable} value={String(current ?? "")} onChange={(e) => onChange(f, e.target.value)} className="h-10 w-full rounded-md border bg-white px-3">
                <option value="ENABLED">Enabled</option>
                <option value="PAUSED">Paused</option>
              </select>
            ) : (
              <Input type={f.valueType === "date" ? "date" : f.valueType === "url" ? "url" : "text"} maxLength={displayPath ? 15 : f.fieldKey.endsWith("business_name") ? 25 : undefined} disabled={!f.editable} value={String(current ?? "")} onChange={(e) => onChange(f, e.target.value)} />
            )}
            {displayPath ? <span className="text-xs text-slate-500">{String(current ?? "").length} / 15</span> : null}
          </label>
        );
      })}
    </div>
  );
}
function MoneyMicrosInput({ field, value, onChange }: { field: ManagedFieldValue; value: unknown; onChange: (micros: string) => void }) {
  const amount = Number(value ?? 0) / 1_000_000;
  const dailyBudget = field.fieldKey === "campaign_budget.amount_micros";
  return (
    <label className="space-y-1">
      <span className="text-sm font-medium">
        {field.fieldLabel} ({dailyBudget ? "MYR/day" : "MYR"}){!field.editable ? <span className="ml-2 text-xs text-slate-400">Read only</span> : null}
      </span>
      <div className="flex overflow-hidden rounded-md border bg-white focus-within:ring-2 focus-within:ring-red-200">
        <span className="flex items-center border-r bg-slate-50 px-3 text-sm font-medium text-slate-600">MYR</span>
        <input
          className="h-10 min-w-0 flex-1 px-3 outline-none disabled:bg-slate-100"
          type="number"
          min="0.01"
          step="0.01"
          disabled={!field.editable}
          value={Number.isFinite(amount) ? amount : ""}
          onChange={(event) => {
            const next = Number(event.target.value);
            onChange(Number.isFinite(next) ? String(Math.round(next * 1_000_000)) : "0");
          }}
        />
        <span className="flex items-center border-l bg-slate-50 px-3 text-sm text-slate-500">{dailyBudget ? "/day" : ""}</span>
      </div>
      <span className="text-xs text-slate-500">Google stores this amount internally in micros.</span>
    </label>
  );
}
function TextAssetsEditor({ field, value, onChange }: { field: ManagedFieldValue; value: unknown; onChange: (value: ManagedAdTextAsset[]) => void }) {
  const assets = Array.isArray(value) ? (value as ManagedAdTextAsset[]) : [];
  const headlines = field.fieldKey.endsWith("headlines");
  const rsa = field.fieldKey === "ad.headlines" || field.fieldKey === "ad.descriptions";
  const maxItems = rsa ? (headlines ? 15 : 4) : 5;
  const demandGenVideoHeadline = field.fieldKey.includes("demand_gen_video_responsive_ad") && headlines && !field.fieldKey.endsWith("long_headlines");
  const charMax = field.fieldKey.endsWith("long_headlines") || !headlines ? 90 : demandGenVideoHeadline ? 40 : 30;
  function update(index: number, text: string) {
    const current = assets[index];
    const next = [...assets];
    next[index] = {
      text,
      ...(current?.pinnedField ? { pinnedField: current.pinnedField } : {}),
    };
    onChange(next);
  }
  function add() {
    if (assets.length < maxItems) onChange([...assets, { text: "" }]);
  }
  function remove(index: number) {
    onChange(assets.filter((_, itemIndex) => itemIndex !== index));
  }
  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {field.fieldLabel} {assets.length}/{maxItems}
        </span>
        <Button type="button" size="sm" variant="outline" disabled={assets.length >= maxItems} onClick={add}>
          Add {headlines ? "headline" : "description"}
        </Button>
      </div>
      {assets.map((asset, index) => (
        <div key={`${field.fieldKey}-${index}`} className="rounded-xl border p-3">
          <div className="flex gap-2">
            <Input value={asset.text || ""} maxLength={charMax} onChange={(e) => update(index, e.target.value)} />
            <Button type="button" size="sm" variant="outline" onClick={() => remove(index)}>
              Remove
            </Button>
          </div>
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>{asset.pinnedField ? `Required · ${asset.pinnedField}` : "Unpinned"}</span>
            <span>
              {asset.text?.length ?? 0} / {charMax}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
function SitelinksEditor({ field, value, onChange }: { field: ManagedFieldValue; value: unknown; onChange: (value: ManagedSitelink[]) => void }) {
  const items = Array.isArray(value) ? (value as ManagedSitelink[]) : [];
  const targets = field.sitelinkTargets?.length ? field.sitelinkTargets : field.sitelinkTarget ? [{ ...field.sitelinkTarget, label: "Ad group" }] : [];
  const defaultTarget = targets.find((target) => target.scope === "campaign") ?? targets[0];
  function update(index: number, values: Partial<ManagedSitelink>) {
    if (!items[index]?.editable) return;
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...values } : item)));
  }
  function add() {
    if (!defaultTarget || items.length >= 20) return;
    const association: ManagedSitelinkAssociation = {
      linkResourceName: "",
      scope: defaultTarget.scope,
      targetResourceName: defaultTarget.resourceName,
      status: "ENABLED",
    };
    onChange([
      ...items,
      {
        id: `draft-sitelink-${Date.now()}`,
        scope: defaultTarget.scope,
        targetResourceName: defaultTarget.resourceName,
        source: "ADVERTISER",
        status: "ENABLED",
        linkText: "",
        description1: "",
        description2: "",
        finalUrls: [""],
        finalMobileUrls: [],
        startDate: "",
        endDate: "",
        editable: true,
        associations: [association],
      },
    ]);
  }
  function associations(item: ManagedSitelink): ManagedSitelinkAssociation[] {
    return item.associations?.length
      ? item.associations
      : [
          {
            linkResourceName: item.linkResourceName || "",
            scope: item.scope,
            targetResourceName: item.targetResourceName,
            status: item.status,
          },
        ];
  }
  function removeAssociation(itemIndex: number, associationIndex: number) {
    const item = items[itemIndex];
    if (!item?.editable) return;
    const remaining = associations(item).filter((_, index) => index !== associationIndex);
    if (!remaining.length) {
      onChange(items.filter((_, index) => index !== itemIndex));
      return;
    }
    onChange(
      items.map((candidate, index) =>
        index === itemIndex
          ? {
              ...candidate,
              scope: remaining[0].scope,
              targetResourceName: remaining[0].targetResourceName,
              linkResourceName: remaining[0].linkResourceName,
              associations: remaining,
            }
          : candidate,
      ),
    );
  }
  function changeDraftScope(index: number, scope: ManagedSitelinkScope) {
    const target = targets.find((candidate) => candidate.scope === scope);
    if (!target) return;
    const association: ManagedSitelinkAssociation = {
      linkResourceName: "",
      scope,
      targetResourceName: target.resourceName,
      status: "ENABLED",
    };
    update(index, {
      scope,
      targetResourceName: target.resourceName,
      associations: [association],
    });
  }
  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            {items.length} sitelink{items.length === 1 ? "" : "s"}
          </p>
          <p className="text-xs text-slate-500">New sitelinks default to campaign level. Publishing always validates and checks Google for conflicts.</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={!defaultTarget || items.length >= 20} onClick={add}>
          Add sitelink
        </Button>
      </div>
      {!items.length ? (
        <div className="rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">No sitelinks are currently attached. Select Add sitelink to create one.</div>
      ) : (
        items.map((item, index) => {
          const itemAssociations = associations(item);
          const isDraft = item.id.startsWith("draft-sitelink-");
          return (
            <div key={item.id || index} className="rounded-xl border bg-slate-50/50 p-4">
              <div className="mb-3">
                <p className="font-medium">{item.linkText || `New sitelink ${index + 1}`}</p>
                {!item.editable ? <p className="text-xs text-slate-500">Automatically created by Google</p> : null}
              </div>
              {isDraft ? (
                <label className="mb-3 block space-y-1">
                  <span className="text-xs font-medium">Attach new sitelink to</span>
                  <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={item.scope} onChange={(event) => changeDraftScope(index, event.target.value as ManagedSitelinkScope)}>
                    {targets.map((target) => (
                      <option key={`${target.scope}:${target.resourceName}`} value={target.scope}>
                        {target.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="mb-3 space-y-2">
                <p className="text-xs font-medium text-slate-600">Google Ads associations</p>
                {itemAssociations.map((association, associationIndex) => {
                  const inherited = association.scope !== "ad_group";
                  return (
                    <div key={association.linkResourceName || `${association.scope}:${association.targetResourceName}`} className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
                      <div>
                        <p className="text-sm">{association.scope === "customer" ? "Account" : association.scope === "campaign" ? "Campaign" : "Ad group"}</p>
                        <p className="text-xs text-slate-500">{inherited ? "Can appear in child campaigns or ad groups" : "Attached directly to this ad group"}</p>
                      </div>
                      <Button type="button" size="sm" variant="outline" disabled={!item.editable} onClick={() => removeAssociation(index, associationIndex)}>
                        Remove from {association.scope === "customer" ? "account" : association.scope === "campaign" ? "campaign" : "ad group"}
                      </Button>
                    </div>
                  );
                })}
                {itemAssociations.length > 1 ? <p className="text-xs text-amber-700">Removing one association will not remove this sitelink from the other listed locations.</p> : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium">Sitelink text</span>
                  <Input disabled={!item.editable} maxLength={25} value={item.linkText} onChange={(event) => update(index, { linkText: event.target.value })} />
                  <span className="block text-right text-xs text-slate-500">{item.linkText.length} / 25</span>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium">Final URL</span>
                  <Input type="url" disabled={!item.editable} placeholder="https://example.com/page" value={item.finalUrls[0] || ""} onChange={(event) => update(index, { finalUrls: [event.target.value] })} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium">Description line 1</span>
                  <Input disabled={!item.editable} maxLength={35} value={item.description1} onChange={(event) => update(index, { description1: event.target.value })} />
                  <span className="block text-right text-xs text-slate-500">{item.description1.length} / 35</span>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium">Description line 2</span>
                  <Input disabled={!item.editable} maxLength={35} value={item.description2} onChange={(event) => update(index, { description2: event.target.value })} />
                  <span className="block text-right text-xs text-slate-500">{item.description2.length} / 35</span>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium">Mobile final URL (optional)</span>
                  <Input
                    type="url"
                    disabled={!item.editable}
                    value={item.finalMobileUrls[0] || ""}
                    onChange={(event) =>
                      update(index, {
                        finalMobileUrls: event.target.value ? [event.target.value] : [],
                      })
                    }
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs font-medium">Start date</span>
                    <Input type="date" disabled={!item.editable} value={item.startDate} onChange={(event) => update(index, { startDate: event.target.value })} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium">End date</span>
                    <Input type="date" disabled={!item.editable} value={item.endDate} onChange={(event) => update(index, { endDate: event.target.value })} />
                  </label>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
function AssetRefsEditor({ field, value, onChange }: { field: ManagedFieldValue; value: unknown; onChange: (value: string[]) => void }) {
  const refs = Array.isArray(value) ? value.map(String) : [];
  function update(index: number, nextValue: string) {
    const next = [...refs];
    next[index] = nextValue;
    onChange(next);
  }
  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{field.fieldLabel}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...refs, ""])}>
          Add asset
        </Button>
      </div>
      {refs.map((ref, index) => {
        const asset = field.assetOptions?.find((candidate) => candidate.resourceName === ref);
        const previewUrl = asset?.imageUrl || (asset?.youtubeVideoId ? `https://i.ytimg.com/vi/${asset.youtubeVideoId}/mqdefault.jpg` : "");
        return (
          <div key={`${field.fieldKey}-${index}`} className="rounded-xl border p-3">
            <div className="flex items-center gap-3">
              {previewUrl ? (
                <div
                  role="img"
                  aria-label={asset?.name || "Asset preview"}
                  className="h-16 w-24 shrink-0 rounded-lg bg-cover bg-center"
                  style={{
                    backgroundImage: `url(${JSON.stringify(previewUrl)})`,
                  }}
                />
              ) : (
                <div className="grid h-16 w-24 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs text-slate-500">{asset?.type ? formatAdType(asset.type) : "Asset"}</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{asset?.youtubeVideoTitle || (asset?.callToAction ? formatAdType(asset.callToAction) : "") || asset?.name || "Google Ads asset"}</p>
                <p className="truncate text-xs text-slate-500">{asset ? formatAdType(asset.type) : "Paste a Google Ads asset resource name"}</p>
                <Input className="mt-2 font-mono text-xs" value={ref} placeholder="customers/1234567890/assets/123" onChange={(event) => update(index, event.target.value)} />
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => onChange(refs.filter((_, itemIndex) => itemIndex !== index))}>
                Remove
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
function StringListEditor({ field, value, onChange }: { field: ManagedFieldValue; value: unknown; onChange: (value: string[]) => void }) {
  const items = Array.isArray(value) ? value.map(String) : [];
  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{field.fieldLabel}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, ""])}>
          Add URL
        </Button>
      </div>
      {items.length ? (
        items.map((item, index) => (
          <div key={`${field.fieldKey}-${index}`} className="flex gap-2">
            <Input
              type="url"
              value={item}
              onChange={(event) => {
                const next = [...items];
                next[index] = event.target.value;
                onChange(next);
              }}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>
              Remove
            </Button>
          </div>
        ))
      ) : (
        <p className="rounded-xl border border-dashed p-3 text-sm text-slate-500">The regular final URL is used on mobile.</p>
      )}
    </div>
  );
}
function CustomParametersEditor({ field, value, onChange }: { field: ManagedFieldValue; value: unknown; onChange: (value: ManagedCustomParameter[]) => void }) {
  const items = Array.isArray(value) ? (value as ManagedCustomParameter[]) : [];
  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{field.fieldLabel}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, { key: "", value: "" }])}>
          Add parameter
        </Button>
      </div>
      {items.map((item, index) => (
        <div key={`${field.fieldKey}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            aria-label={`Custom parameter ${index + 1} name`}
            placeholder="Name"
            value={item.key || ""}
            onChange={(event) => {
              const next = [...items];
              next[index] = { ...item, key: event.target.value };
              onChange(next);
            }}
          />
          <Input
            aria-label={`Custom parameter ${index + 1} value`}
            placeholder="Value"
            value={item.value || ""}
            onChange={(event) => {
              const next = [...items];
              next[index] = { ...item, value: event.target.value };
              onChange(next);
            }}
          />
          <Button type="button" size="sm" variant="outline" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}
function AssetAutomationEditor({ field, value, onChange }: { field: ManagedFieldValue; value: unknown; onChange: (value: ManagedAssetAutomationSetting[]) => void }) {
  const current = Array.isArray(value) ? (value as ManagedAssetAutomationSetting[]) : [];
  const defaults: ManagedAssetAutomationSetting[] = [
    {
      assetAutomationType: "GENERATE_SHORTER_YOUTUBE_VIDEOS",
      assetAutomationStatus: "OPTED_IN",
    },
    {
      assetAutomationType: "GENERATE_VERTICAL_YOUTUBE_VIDEOS",
      assetAutomationStatus: "OPTED_IN",
    },
    {
      assetAutomationType: "GENERATE_LANDING_PAGE_PREVIEW",
      assetAutomationStatus: "OPTED_OUT",
    },
    {
      assetAutomationType: "GENERATE_LANDING_PAGE_TEXT",
      assetAutomationStatus: "OPTED_IN",
    },
  ];
  const settings = defaults.map((fallback) => current.find((item) => item.assetAutomationType === fallback.assetAutomationType) || fallback);
  return (
    <div className="space-y-2 sm:col-span-2">
      <span className="text-sm font-medium">{field.fieldLabel}</span>
      {settings.map((setting) => (
        <label key={setting.assetAutomationType} className="flex items-center justify-between rounded-xl border p-3">
          <span className="text-sm">{automationLabel(setting.assetAutomationType)}</span>
          <input
            type="checkbox"
            checked={setting.assetAutomationStatus === "OPTED_IN"}
            onChange={(event) =>
              onChange(
                settings.map((item) =>
                  item.assetAutomationType === setting.assetAutomationType
                    ? {
                        ...item,
                        assetAutomationStatus: event.target.checked ? "OPTED_IN" : "OPTED_OUT",
                      }
                    : item,
                ),
              )
            }
          />
        </label>
      ))}
    </div>
  );
}
function automationLabel(value: string) {
  const labels: Record<string, string> = {
    GENERATE_SHORTER_YOUTUBE_VIDEOS: "Create shorter videos",
    GENERATE_VERTICAL_YOUTUBE_VIDEOS: "Create resized vertical videos",
    GENERATE_LANDING_PAGE_PREVIEW: "Use landing-page image previews",
    GENERATE_LANDING_PAGE_TEXT: "Use landing-page text",
  };
  return labels[value] || formatAdType(value);
}
function fieldId(f: Pick<ManagedFieldValue, "entityType" | "entityId" | "fieldKey">) {
  return `${f.entityType}:${f.entityId}:${f.fieldKey}`;
}
function latestEditorContext(changeSet: AdsChangeSetRecord): DraftEditorContext | null {
  const events = [...(changeSet.ads_change_events ?? [])].sort((left, right) => String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")));
  for (const event of events) {
    const metadata = event.metadata && typeof event.metadata === "object" ? (event.metadata as Record<string, unknown>) : null;
    const value = metadata?.editorContext;
    if (!value || typeof value !== "object") continue;
    const context = value as Record<string, unknown>;
    if (!["campaigns", "ad_groups", "ads"].includes(String(context.view)) || typeof context.campaignId !== "string") continue;
    return {
      view: context.view as DraftEditorContext["view"],
      campaignId: context.campaignId,
      ...(typeof context.adGroupId === "string" ? { adGroupId: context.adGroupId } : {}),
      ...(typeof context.adId === "string" ? { adId: context.adId } : {}),
    };
  }
  return null;
}
function draftMatchesContext(changeSet: AdsChangeSetRecord, context: DraftEditorContext, campaigns: ManagedCampaign[]) {
  const savedContext = latestEditorContext(changeSet);
  if (savedContext) return savedContext.view === context.view && savedContext.campaignId === context.campaignId && (savedContext.adGroupId || "") === (context.adGroupId || "") && (savedContext.adId || "") === (context.adId || "");
  const firstChange = changeSet.ads_field_changes?.[0];
  if (!firstChange) return false;
  const location = findChangeLocation(campaigns, firstChange);
  if (!location || location.campaign.id !== context.campaignId) return false;
  if (context.view === "campaigns") return firstChange.entity_type === "campaign";
  if (context.view === "ad_groups") return firstChange.entity_type === "ad_group" && location.adGroup?.id === context.adGroupId;
  return firstChange.entity_type === "ad" && location.adGroup?.id === context.adGroupId && location.ad?.id === context.adId;
}
function findChangeLocation(campaigns: ManagedCampaign[], change: { entity_type: string; entity_id: string; field_key: string }) {
  const matchesField = (field: ManagedFieldValue) => field.entityType === change.entity_type && field.entityId === change.entity_id && field.fieldKey === change.field_key;
  for (const campaign of campaigns) {
    if (campaign.fields.some(matchesField) || (change.entity_type === "campaign" && [campaign.id, campaign.resourceName, campaign.budgetResourceName].includes(change.entity_id))) return { campaign, adGroup: null, ad: null };
    for (const adGroup of campaign.adGroups) {
      if (adGroup.fields.some(matchesField) || (change.entity_type === "ad_group" && [adGroup.id, adGroup.resourceName].includes(change.entity_id))) return { campaign, adGroup, ad: null };
      for (const ad of adGroup.ads) if (ad.fields.some(matchesField) || (change.entity_type === "ad" && [ad.id, ad.resourceName].includes(change.entity_id))) return { campaign, adGroup, ad };
    }
  }
  return null;
}
function normalizeDraftValue(field: ManagedFieldValue, value: unknown): unknown {
  if (["string", "url", "date", "single_text_asset", "asset_ref"].includes(field.valueType)) return String(value ?? "").trim();
  if (["asset_refs", "url_list"].includes(field.valueType) && Array.isArray(value))
    return value
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean);
  if (field.valueType === "custom_parameters" && Array.isArray(value))
    return (value as ManagedCustomParameter[]).flatMap((item) => {
      const key = String(item?.key || "").trim();
      const parameterValue = String(item?.value || "").trim();
      return key || parameterValue ? [{ key, value: parameterValue }] : [];
    });
  if (field.valueType === "text_assets" && Array.isArray(value))
    return (value as ManagedAdTextAsset[]).flatMap((asset) => {
      const text = typeof asset?.text === "string" ? asset.text.trim() : "";
      return text
        ? [
            {
              text,
              ...(asset.pinnedField ? { pinnedField: asset.pinnedField } : {}),
            },
          ]
        : [];
    });
  if (field.valueType === "sitelinks" && Array.isArray(value))
    return (value as ManagedSitelink[]).map((item) => ({
      ...item,
      linkText: item.linkText.trim(),
      description1: item.description1.trim(),
      description2: item.description2.trim(),
      finalUrls: item.finalUrls.map((url) => url.trim()).filter(Boolean),
      finalMobileUrls: item.finalMobileUrls.map((url) => url.trim()).filter(Boolean),
      startDate: item.startDate.trim(),
      endDate: item.endDate.trim(),
    }));
  return value;
}
function managementAccountLabel(accountName: string) {
  return (
    accountName
      .replace(/^Google\s*-\s*/i, "")
      .replace(/\s*\|\s*\d{3}-?\d{3}-?\d{4}\s*$/, "")
      .trim() || accountName
  );
}
function defaultManagementDateRange(startDate: string | null, endDate: string | null) {
  const valid = (value: string | null) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
  if (valid(startDate) && valid(endDate) && startDate! <= endDate!) return { startDate: startDate!, endDate: endDate! };

  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  const iso = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

  return { startDate: iso(start), endDate: iso(end) };
}
