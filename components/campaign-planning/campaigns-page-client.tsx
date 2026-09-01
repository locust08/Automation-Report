"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircleIcon, BanIcon, CalendarIcon, CheckCircle2Icon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, CloudCheckIcon, LoaderCircleIcon, PencilIcon, PlusIcon, RefreshCwIcon, RotateCcwIcon, ShieldCheckIcon, XIcon } from "lucide-react";

import { ReportShell } from "@/components/reporting/report-shell";
import { useWorkflowPolicies } from "@/components/workflow-settings/use-workflow-policies";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Stepper, StepperDescription, StepperIndicator, StepperItem, StepperNav, StepperSeparator, StepperTitle, StepperTrigger } from "@/components/ui/stepper";
import type { AuthRole } from "@/lib/auth/roles";
import { buildCampaignRows, filterCampaigns, paginateCampaigns, type CampaignPlatformFilter, type CampaignStatusFilter } from "@/lib/campaign-planning/campaign-list-view";
import { flattenCampaignDetail } from "@/lib/campaign-planning/campaign-detail-table";
import { CAMPAIGN_EDITING_SECTION_ORDER, EDIT_DRAFT_RESET_LABEL, closeCampaignDetail, selectCampaignDetail, toggleCampaignCreator, toggleCampaignEditor } from "@/lib/campaign-planning/campaign-workspace-view";
import { hydrateCampaignWizardFromRevision } from "@/lib/campaign-planning/campaign-wizard-payload";
import { evaluateCampaignProviderReadiness } from "@/lib/campaign-planning/campaign-provider-readiness";
import { CAMPAIGN_STATUS_PRESENTATIONS } from "@/lib/campaign-planning/campaign-status-presentation";
import { mapCampaignIssueToWizardField, validateCampaignSubmission, type CampaignApiValidationIssue, type CampaignWizardIssue } from "@/lib/campaign-planning/campaign-submission-validation";
import {
  createCampaignWizardForm,
  getCampaignWizardPrimaryAction,
  getCampaignWizardSteps,
  normalizeCampaignWizardProgress,
  restoreCampaignWizardForm,
  shouldAutosaveCampaignWizardStep,
  switchCampaignWizardPlatform,
  validateCampaignWizardStep,
  type CampaignEditDraft,
  type CampaignWizardDraft,
  type CampaignWizardFieldError,
  type CampaignWizardForm,
} from "@/lib/campaign-planning/campaign-wizard";
import type { CampaignPlanDraftInput } from "@/lib/campaign-planning/domain";
import type {
  CampaignPlanDetail,
  CampaignPlanStatus,
  CampaignPlanningListPayload,
  CampaignPlatform,
} from "@/lib/campaign-planning/types";
import { approvalRequired } from "@/lib/workflow-settings/policy";

type FormState = CampaignWizardForm;
type CampaignUpdateResult =
  | { success: true }
  | { success: false; error: string; issues: CampaignApiValidationIssue[] };
type CampaignEditSubmitError = { message: string; issue?: CampaignWizardIssue };

export function CampaignsPageClient({ initialRole }: { initialRole: AuthRole }) {
  const workflowPolicies = useWorkflowPolicies();
  const m04ApprovalRequired = approvalRequired(workflowPolicies, "m04_campaign_readiness_approval");
  const [data, setData] = useState<CampaignPlanningListPayload | null>(null);
  const [selected, setSelected] = useState<CampaignPlanDetail | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingCampaignId, setEditingCampaignId] = useState<number | null>(null);
  const [platformFilter, setPlatformFilter] = useState<CampaignPlatformFilter>("all");
  const [statusFilter, setStatusFilter] = useState<CampaignStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FormState>(() => createCampaignWizardForm());
  const [wizardStep, setWizardStep] = useState(0);
  const [highestReachedStep, setHighestReachedStep] = useState(0);
  const [wizardErrors, setWizardErrors] = useState<CampaignWizardFieldError[]>([]);
  const [wizardReady, setWizardReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveSequence = useRef(0);
  const [busy, setBusy] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createSubmitError, setCreateSubmitError] = useState<CampaignEditSubmitError | null>(null);
  const isAdmin = initialRole === "admin";

  const load = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/campaign-planning", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to connect to local Supabase.");
      setData(payload);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { void load().catch((reason) => setError(errorMessage(reason))); }, [load]);

  useEffect(() => {
    if (!showCreate || wizardReady) return;
    let cancelled = false;
    void fetch("/api/campaign-planning/wizard-draft", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { draft?: CampaignWizardDraft | null; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to restore the incomplete campaign setup.");
        if (cancelled) return;
        if (payload.draft) {
          const platform = payload.draft.platform;
          setForm(restoreCampaignWizardForm(platform, payload.draft.formData));
          const progress = normalizeCampaignWizardProgress(payload.draft.currentStep, payload.draft.highestReachedStep);
          setWizardStep(progress.currentStep);
          setHighestReachedStep(progress.highestReachedStep);
          setSaveStatus("saved");
        }
        setWizardReady(true);
      })
      .catch((reason) => {
        if (!cancelled) { setWizardReady(true); setSaveStatus("error"); setError(errorMessage(reason)); }
      });
    return () => { cancelled = true; };
  }, [showCreate, wizardReady]);

  const saveWizard = useCallback(async () => {
    const sequence = ++saveSequence.current;
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/campaign-planning/wizard-draft", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ platform: form.platform, current_step: wizardStep, highest_reached_step: highestReachedStep, form_data: form }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to save the incomplete campaign setup.");
      if (sequence === saveSequence.current) setSaveStatus("saved");
    } catch {
      if (sequence === saveSequence.current) setSaveStatus("error");
    }
  }, [form, highestReachedStep, wizardStep]);

  useEffect(() => {
    if (!showCreate || !wizardReady) return;
    if (!shouldAutosaveCampaignWizardStep(wizardStep)) { setSaveStatus("idle"); return; }
    setSaveStatus("idle");
    const timer = window.setTimeout(() => { void saveWizard(); }, 750);
    return () => window.clearTimeout(timer);
  }, [form, highestReachedStep, saveWizard, showCreate, wizardReady, wizardStep]);

  async function openPlan(id: number) {
    const nextView = selectCampaignDetail({ creatorOpen: showCreate, selectedCampaignId: selectedId, editingCampaignId }, id);
    setShowCreate(nextView.creatorOpen);
    setSelectedId(nextView.selectedCampaignId);
    setEditingCampaignId(nextView.editingCampaignId);
    setSelected(null);
    setDetailLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaign-planning/${id}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load the campaign draft.");
      setSelected(payload);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setDetailLoading(false);
    }
  }

  async function runReadinessAction(detail: CampaignPlanDetail, action: "validate_readiness" | "approve_readiness") {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/campaign-planning/${detail.plan.id}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, idempotency_key: `${action}:${detail.plan.id}:${detail.currentRevision.id}` }),
      });
      const payload = await response.json() as CampaignPlanDetail & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Campaign readiness action failed.");
      setSelected(payload); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Campaign readiness action failed."); }
    finally { setBusy(false); }
  }

  async function updatePlan(detail: CampaignPlanDetail, campaign: CampaignPlanDraftInput): Promise<CampaignUpdateResult> {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/campaign-planning/${detail.plan.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expected_lock_version: detail.plan.lockVersion, campaign }),
      });
      const payload = await response.json() as CampaignPlanDetail & { error?: string; issues?: CampaignApiValidationIssue[] };
      if (!response.ok) return { success: false, error: payload.error || "Unable to update the campaign draft.", issues: payload.issues ?? [] };
      setSelected(payload);
      await fetch(`/api/campaign-planning/${detail.plan.id}/edit-draft`, { method: "DELETE" }).catch(() => undefined);
      await load();
      return { success: true };
    } catch (cause) {
      return { success: false, error: errorMessage(cause), issues: [] };
    } finally { setBusy(false); }
  }

  async function createDraft() {
    setCreateSubmitError(null);
    for (let step = 0; step < 4; step += 1) {
      const errors = validateCampaignWizardStep(form, step);
      if (errors.length) {
        setWizardStep(step); setWizardErrors(errors);
        window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-wizard-field="${errors[0].field}"]`)?.focus());
        return;
      }
    }
    const account = data?.accounts.find((item) => String(item.id) === form.accountId);
    if (!account) return setCreateSubmitError({ message: "Select a local mock ad account." });
    const validated = validateCampaignSubmission(form, account);
    if (!validated.success) {
      const issue = validated.issues[0];
      setCreateSubmitError({ message: issue?.message ?? validated.error, issue });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/campaign-planning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validated.campaign),
      });
      const payload = await response.json() as CampaignPlanDetail & { error?: string; issues?: CampaignApiValidationIssue[] };
      if (!response.ok) {
        const apiIssue = payload.issues?.[0];
        const issue = apiIssue ? { ...apiIssue, field: mapCampaignIssueToWizardField(apiIssue.path).field } : undefined;
        setCreateSubmitError({ message: apiIssue?.message ?? payload.error ?? "Unable to create the draft.", issue });
        return;
      }
      setSelected(payload);
      setSelectedId(payload.plan.id);
      setShowCreate(false);
      setForm(createCampaignWizardForm(form.platform));
      setWizardStep(0); setHighestReachedStep(0); setWizardErrors([]); setWizardReady(false); setSaveStatus("idle");
      await fetch("/api/campaign-planning/wizard-draft", { method: "DELETE" }).catch(() => undefined);
      await load();
    } catch (reason) {
      setCreateSubmitError({ message: errorMessage(reason) });
    } finally {
      setBusy(false);
    }
  }

  function goToCreateSubmitError() {
    if (!createSubmitError?.issue) return;
    const { field, message, step } = createSubmitError.issue;
    setWizardStep(step);
    setWizardErrors([{ field, message }]);
    focusWizardError({ field, message });
  }

  function goToNextWizardStep() {
    const errors = validateCampaignWizardStep(form, wizardStep);
    setWizardErrors(errors);
    if (errors.length) {
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-wizard-field="${errors[0].field}"]`)?.focus());
      return;
    }
    const next = Math.min(4, wizardStep + 1);
    setWizardStep(next); setHighestReachedStep((current) => Math.max(current, next)); setWizardErrors([]);
  }

  function goToPreviousWizardStep() { setWizardStep((current) => Math.max(0, current - 1)); setWizardErrors([]); }

  async function discardWizard() {
    setBusy(true);
    try {
      const response = await fetch("/api/campaign-planning/wizard-draft", { method: "DELETE" });
      if (!response.ok) { const payload = await response.json(); throw new Error(payload.error || "Unable to discard this setup."); }
      setForm(createCampaignWizardForm()); setWizardStep(0); setHighestReachedStep(0); setWizardErrors([]); setSaveStatus("idle");
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }

  function changeWizardPlatform(platform: CampaignPlatform) {
    const next = switchCampaignWizardPlatform(form, platform);
    setForm(next.form); setWizardStep(next.currentStep); setHighestReachedStep(next.highestReachedStep); setWizardErrors([]);
  }

  function toggleCreateCampaign() {
    const nextView = toggleCampaignCreator({ creatorOpen: showCreate, selectedCampaignId: selectedId, editingCampaignId });
    setShowCreate(nextView.creatorOpen);
    setSelectedId(nextView.selectedCampaignId);
    setEditingCampaignId(nextView.editingCampaignId);
    if (nextView.creatorOpen) setSelected(null);
  }

  function toggleEditCampaign() {
    if (!selected) return;
    const nextView = toggleCampaignEditor({ creatorOpen: showCreate, selectedCampaignId: selectedId, editingCampaignId }, selected.plan.id);
    setShowCreate(nextView.creatorOpen);
    setSelectedId(nextView.selectedCampaignId);
    setEditingCampaignId(nextView.editingCampaignId);
  }

  function closePlan() {
    const nextView = closeCampaignDetail({ creatorOpen: showCreate, selectedCampaignId: selectedId, editingCampaignId });
    setShowCreate(nextView.creatorOpen);
    setSelectedId(nextView.selectedCampaignId);
    setEditingCampaignId(nextView.editingCampaignId);
    setSelected(null);
    setDetailLoading(false);
  }

  const accounts = data?.accounts.filter((item) => item.platform === form.platform) ?? [];
  const selectedAccount = accounts.find((item) => String(item.id) === form.accountId);
  const packages = data?.packages.filter((item) => !selectedAccount || (
    item.clientId === selectedAccount.clientId && item.currency === selectedAccount.currency
  )) ?? [];
  const filteredCampaigns = useMemo(() => filterCampaigns(data?.campaigns ?? [], platformFilter, statusFilter), [data, platformFilter, statusFilter]);
  const paginated = useMemo(() => paginateCampaigns(filteredCampaigns, page), [filteredCampaigns, page]);
  const campaignRows = useMemo(() => buildCampaignRows(paginated.items), [paginated.items]);

  useEffect(() => { setPage(1); }, [platformFilter, statusFilter]);
  useEffect(() => { if (page !== paginated.page) setPage(paginated.page); }, [page, paginated.page]);

  return (
    <ReportShell title="Campaign Planning" dateLabel="CRM08 Mock Workflow" initialRole={initialRole} reportReady={Boolean(data)}>
      <div className="space-y-5 py-6">
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

        {listLoading && !data ? <SummarySkeleton /> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Summary label="Total drafts" value={data?.summary.total ?? 0} />
          <Summary label="Draft" value={data?.summary.draft ?? 0} />
          <Summary label="Google" value={data?.summary.google ?? 0} />
          <Summary label="Meta" value={data?.summary.meta ?? 0} />
          <Summary label="TikTok" value={data?.summary.tiktok ?? 0} />
        </div>}

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
            <div><CardTitle className="text-xl">Campaign drafts</CardTitle><CardDescription className="mt-1">Validated shared revisions with one platform-specific detail row.</CardDescription></div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <FilterChoice ariaLabel="Filter by platform" value={platformFilter} options={PLATFORM_FILTER_OPTIONS} onChange={(value) => setPlatformFilter(value as CampaignPlatformFilter)} />
              <FilterChoice ariaLabel="Filter by status" value={statusFilter} options={STATUS_FILTER_OPTIONS} onChange={(value) => setStatusFilter(value as CampaignStatusFilter)} />
              <Button type="button" variant="outline" size="sm" disabled={busy || listLoading} onClick={() => void load()}><RefreshCwIcon className={listLoading ? "animate-spin" : ""} /> Refresh</Button>
              {isAdmin ? <Button type="button" size="sm" onClick={toggleCreateCampaign}>{showCreate ? <XIcon /> : <PlusIcon />}{showCreate ? "Close creator" : "New campaign"}</Button> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <CampaignStatusLegend />
            {listLoading && !data ? <CampaignListSkeleton /> : campaignRows.map((row) => (
              <div key={row.map((campaign) => campaign.id).join("-")} className="space-y-3">
                <div className="grid gap-3 lg:grid-cols-2">
                  {row.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} selected={selectedId === campaign.id} onClick={() => void openPlan(campaign.id)} />)}
                </div>
                {selectedId && editingCampaignId !== selectedId && row.some((campaign) => campaign.id === selectedId) ? (
                  detailLoading ? <CampaignDetailSkeleton /> : selected ? <CampaignDetail detail={selected} busy={busy} isAdmin={isAdmin} approvalRequired={m04ApprovalRequired} editing={false} onToggleEdit={toggleEditCampaign} onClose={closePlan} runReadinessAction={runReadinessAction} /> : null
                ) : null}
              </div>
            ))}
            {!listLoading && !filteredCampaigns.length ? <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No campaigns match these filters.</p> : null}
            {!listLoading && filteredCampaigns.length ? <Pagination page={paginated.page} pageCount={paginated.pageCount} total={paginated.total} setPage={setPage} /> : null}
          </CardContent>
        </Card>
        {data && selected && editingCampaignId === selected.plan.id ? CAMPAIGN_EDITING_SECTION_ORDER.map((section) => section === "detail"
          ? <CampaignDetail key="detail" detail={selected} busy={busy} isAdmin={isAdmin} approvalRequired={m04ApprovalRequired} editing onToggleEdit={toggleEditCampaign} onClose={closePlan} runReadinessAction={runReadinessAction} />
          : <CampaignEditWizard key="editor" detail={selected} accounts={data.accounts} packages={data.packages} busy={busy} onCancel={toggleEditCampaign} onSave={(campaign) => updatePlan(selected, campaign)} />
        ) : null}
        {data && showCreate ? <Card className="overflow-hidden border-red-200 shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-4 border-b bg-white">
            <div><CardTitle>Create campaign</CardTitle><CardDescription>Build a validated Google Ads, Meta Ads, or TikTok Ads draft.</CardDescription></div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Close campaign creator" onClick={toggleCreateCampaign}><XIcon /></Button>
          </CardHeader>
          <CardContent className="flex h-[min(820px,calc(100vh-8rem))] min-h-[560px] flex-col overflow-hidden p-0">
            {wizardReady ? <CreateForm form={form} setForm={setForm} accounts={accounts} packages={packages} busy={busy} submit={createDraft} currentStep={wizardStep} highestReachedStep={highestReachedStep} errors={wizardErrors} saveStatus={saveStatus} onStepClick={(step) => { if (step <= highestReachedStep) { setWizardStep(step); setWizardErrors([]); } }} onNext={goToNextWizardStep} onPrevious={goToPreviousWizardStep} onDiscard={() => void discardWizard()} onRetrySave={() => void saveWizard()} onPlatformChange={changeWizardPlatform} submitError={createSubmitError} onGoToSubmitError={goToCreateSubmitError} /> : <div className="flex flex-1 items-center justify-center"><LoaderCircleIcon className="size-6 animate-spin text-muted-foreground" /><span className="ml-2 text-sm text-muted-foreground">Restoring your setup…</span></div>}
          </CardContent>
        </Card> : null}
      </div>
    </ReportShell>
  );
}

function CreateForm({ form, setForm, accounts, packages, busy, submit, currentStep, highestReachedStep, errors, saveStatus, onStepClick, onNext, onPrevious, onDiscard, onRetrySave, onPlatformChange, mode = "create", identityLocked = false, submitError, onGoToSubmitError }: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  accounts: CampaignPlanningListPayload["accounts"];
  packages: CampaignPlanningListPayload["packages"];
  busy: boolean;
  submit: () => void;
  currentStep: number; highestReachedStep: number; errors: CampaignWizardFieldError[];
  saveStatus: "idle" | "saving" | "saved" | "error";
  onStepClick: (step: number) => void; onNext: () => void; onPrevious: () => void; onDiscard: () => void; onRetrySave: () => void;
  onPlatformChange: (platform: CampaignPlatform) => void;
  mode?: "create" | "edit";
  identityLocked?: boolean;
  submitError?: CampaignEditSubmitError | null;
  onGoToSubmitError?: () => void;
}) {
  const set = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const account = accounts.find((item) => String(item.id) === form.accountId);
  const steps = getCampaignWizardSteps(form.platform);
  const primaryAction = getCampaignWizardPrimaryAction(currentStep);
  const errorFor = (field: keyof FormState) => errors.find((item) => item.field === field)?.message;
  const field = (name: keyof FormState, label: string, children: React.ReactNode, className = "") => <Field label={label} field={name} error={errorFor(name)} className={className}>{children}</Field>;
  return (
    <form onSubmit={(event) => event.preventDefault()} className="flex min-h-0 flex-1 flex-col bg-slate-50 [&_input:not([readonly]):not(:disabled)]:bg-white [&_textarea:not([readonly]):not(:disabled)]:bg-white [&_[data-slot=select-trigger]:not(:disabled)]:bg-white">
      <div className="border-b bg-white px-5 pb-5">
        <Stepper key={form.platform} steps={steps.map((step) => ({ id: step.id, title: step.label, description: step.description }))} value={steps[currentStep].id} className="pt-2">
          <StepperNav>
            {steps.map((step, index) => <StepperItem key={step.id} stepId={step.id} completed={index < currentStep} disabled={index > highestReachedStep} className="relative flex-1">
              <StepperTrigger type="button" onClick={(event) => { event.preventDefault(); onStepClick(index); }} className="flex min-w-0 flex-col gap-2">
                <StepperIndicator>{index < currentStep ? <CheckIcon className="size-4" /> : index + 1}</StepperIndicator>
                <span className="min-w-0 text-center"><StepperTitle className="truncate">{step.label}</StepperTitle><StepperDescription className="hidden lg:block">{step.description}</StepperDescription></span>
              </StepperTrigger>
              {index < steps.length - 1 ? <StepperSeparator className="absolute inset-x-0 top-4 right-[calc(-50%+18px)] left-[calc(50%+18px)]" /> : null}
            </StepperItem>)}
          </StepperNav>
        </Stepper>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-5xl space-y-5">
          <div><p className="text-xl font-semibold">{steps[currentStep].label}</p><p className="text-sm text-muted-foreground">{steps[currentStep].description}</p></div>
          {errors.length ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><div className="flex items-center gap-2 font-medium"><AlertCircleIcon className="size-4" />Complete this step to continue</div><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((item) => <li key={`${item.field}-${item.message}`}>{item.message}</li>)}</ul></div> : null}
          {currentStep === 0 ? <div className="grid gap-4 md:grid-cols-2">
            {field("platform", "Platform", identityLocked ? <Input value={PLATFORM_OPTIONS.find((item) => item.value === form.platform)?.label ?? form.platform} readOnly className="bg-slate-100" /> : <Choice value={form.platform} options={PLATFORM_OPTIONS} onChange={(value) => onPlatformChange(value as CampaignPlatform)} />)}
            {field("accountId", "Local mock account", identityLocked ? <Input value={account?.accountName ?? ""} readOnly className="bg-slate-100" /> : <Choice value={form.accountId} placeholder="Select account" options={accounts.map((item) => ({ value: String(item.id), label: item.accountName }))} onChange={(value) => setForm((current) => ({ ...current, accountId: value, packageId: "" }))} />)}
            {field("packageId", "Budget package", identityLocked ? <Input value={packages.find((item) => String(item.id) === form.packageId)?.name ?? ""} readOnly className="bg-slate-100" /> : <Choice value={form.packageId} placeholder="Select package" options={packages.map((item) => ({ value: String(item.id), label: `${item.name} · ${money(item.remainingAmount, item.currency)} available` }))} onChange={(value) => set("packageId", value)} />)}
            <Field label="Client"><Input value={account?.clientName ?? ""} readOnly className="bg-slate-100" placeholder="Selected from account" /></Field>
          </div> : null}
          {currentStep === 1 ? <div className="space-y-6">
            <OptionCards label="Choose your objective" value={form.objective} options={objectiveOptions(form.platform)} onChange={(value) => setForm((current) => objectiveForm(current, value))} />
            {form.platform === "google" ? <OptionCards label="Select a campaign type" value={form.campaignType} options={[{ value: "performance_max", label: "Performance Max" }, { value: "search", label: "Search" }, { value: "demand_gen", label: "Demand Gen" }]} onChange={(value) => setForm((current) => googleTypeForm(current, value))} /> : null}
            <div className="grid gap-4 md:grid-cols-2">
              {field("campaignName", "Campaign name", <Input required value={form.campaignName} onChange={(event) => set("campaignName", event.target.value)} />)}
              {form.platform === "meta" ? field("specialAdCategories", "Special ad category declaration", <Choice value={form.specialAdCategories} placeholder="Select declaration" options={[{ value: "none", label: "None" }, ...["credit", "employment", "housing", "social_issues"].map(option)]} onChange={(value) => set("specialAdCategories", value)} />) : null}
              {form.platform === "tiktok" ? field("specialIndustries", "Special industry declaration", <Choice value={form.specialIndustries} placeholder="Select declaration" options={[{ value: "none", label: "None" }, { value: "housing", label: "Housing" }, { value: "employment", label: "Employment" }, { value: "credit", label: "Credit" }]} onChange={(value) => set("specialIndustries", value)} />) : null}
            </div>
          </div> : null}
          {currentStep === 2 ? <div className="grid gap-4 md:grid-cols-2">
            {field("destination", "Destination URL", <Input required type="url" value={form.destination} onChange={(event) => set("destination", event.target.value)} />)}
            {field("allocatedBudget", `Allocated budget${account ? ` (${account.currency})` : ""}`, <Input required type="number" min="1" step="0.01" value={form.allocatedBudget} onChange={(event) => set("allocatedBudget", event.target.value)} />)}
            {field("startDate", "Start date", <DatePickerField value={form.startDate} onChange={(value) => set("startDate", value)} />)}
            {field("endDate", "End date", <DatePickerField value={form.endDate} onChange={(value) => set("endDate", value)} />)}
            <Field label="Tracking template"><Input value={form.trackingTemplate} onChange={(event) => set("trackingTemplate", event.target.value)} /></Field>
            {form.platform === "google" ? <GoogleFields section="settings" form={form} set={set} errors={errors} /> : null}
            {form.platform === "meta" ? <MetaFields section="settings" form={form} set={set} errors={errors} /> : null}
            {form.platform === "tiktok" ? <TikTokFields section="settings" form={form} set={set} errors={errors} /> : null}
          </div> : null}
          {currentStep === 3 ? <div className="grid gap-4 md:grid-cols-2">
            {form.platform === "google" ? <GoogleFields section="creative" form={form} set={set} errors={errors} /> : null}
            {form.platform === "meta" ? <MetaFields section="creative" form={form} set={set} errors={errors} /> : null}
            {form.platform === "tiktok" ? <TikTokFields section="creative" form={form} set={set} errors={errors} /> : null}
          </div> : null}
          {currentStep === 4 ? <CampaignWizardReview form={form} account={account} packageName={packages.find((item) => String(item.id) === form.packageId)?.name} mode={mode} /> : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t bg-white p-4">
        <div className="flex min-h-9 flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" size="sm" className="h-9 items-center leading-none" disabled={busy} onClick={onDiscard}><RotateCcwIcon className="shrink-0" /> <span className="leading-none">{mode === "edit" ? EDIT_DRAFT_RESET_LABEL : "Discard setup"}</span></Button>
          <SaveStatus status={currentStep === 4 ? "ready" : saveStatus} retry={onRetrySave} readyLabel={mode === "edit" ? "Ready to save revision" : "Ready to create"} />
        </div>
        <div className="ml-auto flex max-w-full flex-col items-end gap-2"><div className="flex gap-2"><Button type="button" variant="outline" disabled={busy || currentStep === 0} onClick={onPrevious}><ChevronLeftIcon /> Back</Button>{primaryAction.kind === "next" ? <Button type={primaryAction.buttonType} disabled={busy} onClick={onNext}>Next <ChevronRightIcon /></Button> : <Button type={primaryAction.buttonType} disabled={busy} onClick={submit}>{busy ? <LoaderCircleIcon className="animate-spin" /> : <CheckIcon />} {mode === "edit" ? "Save new revision" : "Create local draft"}</Button>}</div>{currentStep === 4 && submitError ? <div role="alert" className="flex max-w-xl flex-wrap items-center justify-end gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-right text-xs text-red-800"><span>{submitError.message}</span>{submitError.issue && onGoToSubmitError ? <Button type="button" variant="ghost" size="xs" className="h-6 px-2 text-red-800 hover:bg-red-100" onClick={onGoToSubmitError}>Go to field</Button> : null}</div> : null}</div>
      </div>
    </form>
  );
}

function SaveStatus({ status, retry, readyLabel }: { status: "idle" | "saving" | "saved" | "error" | "ready"; retry: () => void; readyLabel?: string }) {
  if (status === "ready") return <span className="text-xs font-medium text-foreground">{readyLabel ?? "Ready to submit"}</span>;
  if (status === "saving") return <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><LoaderCircleIcon className="size-3.5 animate-spin" /> Saving…</span>;
  if (status === "saved") return <span className="flex items-center gap-1.5 text-xs text-emerald-700"><CloudCheckIcon className="size-3.5" /> Saved</span>;
  if (status === "error") return <button type="button" onClick={retry} className="flex items-center gap-1.5 text-xs text-red-700 hover:underline"><AlertCircleIcon className="size-3.5" /> Couldn’t save · Retry</button>;
  return <span className="text-xs text-muted-foreground">Changes save automatically</span>;
}

function OptionCards({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  const descriptions: Record<string, string> = { sales: "Drive purchases and revenue.", leads: "Collect leads and encourage action.", website_traffic: "Bring qualified visitors to your site.", traffic: "Send more people to your destination.", web_conversions: "Optimize for valuable website actions.", lead_generation: "Capture leads from TikTok audiences.", performance_max: "Reach customers across Google inventory.", search: "Drive action with text ads on Google Search.", demand_gen: "Build demand across visual Google surfaces." };
  return <section className="rounded-xl border bg-white"><div className="border-b px-4 py-3 font-medium">{label}</div><div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">{options.map((item) => <button type="button" key={item.value} aria-pressed={value === item.value} onClick={() => onChange(item.value)} className={`min-h-32 rounded-lg border-2 p-4 text-left transition hover:border-red-300 ${value === item.value ? "border-red-500 bg-red-50/60 ring-2 ring-red-100" : "border-border bg-white"}`}><span className="font-medium">{item.label}</span><span className="mt-2 block text-sm text-muted-foreground">{descriptions[item.value] ?? "Configure this campaign option."}</span></button>)}</div></section>;
}

function CampaignWizardReview({ form, account, packageName, mode = "create" }: { form: FormState; account?: CampaignPlanningListPayload["accounts"][number]; packageName?: string; mode?: "create" | "edit" }) {
  const validation = account ? validateCampaignSubmission(form, account) : null;
  const readiness = validation?.success ? evaluateCampaignProviderReadiness(validation.campaign) : null;
  const rows = [["Platform", humanize(form.platform)], ["Account", account?.accountName || "—"], ["Budget package", packageName || "—"], ["Campaign", form.campaignName], ["Objective", humanize(form.objective)], ["Flight", `${form.startDate} → ${form.endDate}`], ["Allocated budget", form.allocatedBudget], ["Destination", form.destination], [form.platform === "google" ? "Campaign type" : "Optimization goal", humanize(form.platform === "google" ? form.campaignType : form.optimizationGoal)], [form.platform === "meta" ? "Ad format" : form.platform === "tiktok" ? "Video" : "Ad group", form.platform === "meta" ? humanize(form.creativeFormat) : form.platform === "tiktok" ? form.assetIds : form.groupName]];
  return <div className="space-y-4"><div className="overflow-hidden rounded-xl border bg-white"><div className="border-b px-5 py-4"><p className="font-medium">Review campaign setup</p><p className="text-sm text-muted-foreground">Nothing is sent to an ad provider. {mode === "edit" ? "Saving creates a new immutable revision." : "This creates a validated local draft."}</p></div><dl className="grid sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="border-b p-4 sm:odd:border-r"><dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl></div><div className="grid gap-3 md:grid-cols-2"><ReviewCheck title="Supabase validation" passed={validation?.success === true} detail={validation?.success ? "Structurally valid and ready to save as an immutable revision." : validation?.error ?? "Select an account to validate."} /><ReviewCheck title="Future provider integration" passed={readiness?.providerReady === true} attention detail={readiness?.providerReady ? "All resource references are resolved. Provider execution remains locked." : `${readiness?.unresolvedResources.length ?? 0} provider resource reference(s) remain unresolved. This does not block Supabase saving.`} /></div></div>;
}

function ReviewCheck({ title, passed, attention = false, detail }: { title: string; passed: boolean; attention?: boolean; detail: string }) { return <div className={`rounded-xl border p-4 ${passed ? "border-emerald-200 bg-emerald-50" : attention ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}><div className="flex items-center gap-2 font-medium">{passed ? <CheckCircle2Icon className="size-4 text-emerald-700" /> : <AlertCircleIcon className={`size-4 ${attention ? "text-amber-700" : "text-red-700"}`} />}{title}</div><p className="mt-2 text-sm text-muted-foreground">{detail}</p></div>; }

function GoogleFields({ form, set, section, errors }: { form: FormState; set: (key: keyof FormState, value: string) => void; section: "settings" | "creative"; errors: CampaignWizardFieldError[] }) {
  const bidOptions = form.campaignType === "search"
    ? ["maximize_clicks", "maximize_conversions", "target_cpa", "maximize_conversion_value", "target_roas"]
    : ["maximize_conversions", "target_cpa", "maximize_conversion_value", "target_roas"];
  if (section === "creative") return <>
    <Field label={form.campaignType === "performance_max" ? "Asset group name" : "Ad group name"} field="groupName" error={wizardError(errors, "groupName")}><Input required value={form.groupName} onChange={(event) => set("groupName", event.target.value)} /></Field>
    <CreativeFields form={form} set={set} google errors={errors} />
    {form.campaignType === "search" ? <Field label="Keywords and match types" field="keywords" error={wizardError(errors, "keywords")} className="md:col-span-2"><KeywordList keywords={form.keywords} matchTypes={form.keywordMatchTypes} onChange={(keywords, matchTypes) => { set("keywords", keywords); set("keywordMatchTypes", matchTypes); }} /></Field> : null}
  </>;
  return <>
    <Field label="Bidding strategy"><Choice value={form.biddingStrategy} options={bidOptions.map(option)} onChange={(value) => set("biddingStrategy", value)} /></Field>
    {form.biddingStrategy === "target_cpa" ? <Field label="Target CPA"><Input required type="number" min="0.01" step="0.01" value={form.targetCpa} onChange={(event) => set("targetCpa", event.target.value)} /></Field> : null}
    {form.biddingStrategy === "target_roas" ? <Field label="Target ROAS"><Input required type="number" min="0.01" step="0.01" value={form.targetRoas} onChange={(event) => set("targetRoas", event.target.value)} /></Field> : null}
    {form.campaignType === "search" ? <Field label="Search partners"><Choice value={form.searchPartners} options={[{ value: "false", label: "Off" }, { value: "true", label: "On" }]} onChange={(value) => set("searchPartners", value)} /></Field> : null}
    <Field label="Locations"><RepeatableList value={form.locations} onChange={(value) => set("locations", value)} addLabel="Add location" placeholder="Location reference" /></Field>
    <Field label="Languages"><RepeatableList value={form.languages} onChange={(value) => set("languages", value)} addLabel="Add language" placeholder="Language reference" /></Field>
    <Field label="Conversion action ID"><Input required value={form.conversionActionId} onChange={(event) => set("conversionActionId", event.target.value)} /></Field>
    <Field label="Conversion category"><Choice value={form.conversionCategory} options={["purchase", "submit_lead_form", "page_view"].map(option)} onChange={(value) => set("conversionCategory", value)} /></Field>
    <Field label="EU political advertising declaration" field="euPoliticalAds" error={wizardError(errors, "euPoliticalAds")}><Choice value={form.euPoliticalAds} placeholder="Select declaration" options={[{ value: "does_not_contain", label: "Does not contain EU political advertising" }, { value: "contains", label: "Contains EU political advertising" }]} onChange={(value) => set("euPoliticalAds", value)} /></Field>
    <AdvancedPanel className="md:col-span-2"><Field label="Performance Max brand guidelines"><Choice value={form.googleBrandGuidelines} options={[{ value: "disabled", label: "Disabled · assets belong to asset group" }, { value: "enabled", label: "Enabled · brand assets belong to campaign" }]} onChange={(value) => set("googleBrandGuidelines", value)} /></Field>{form.campaignType === "search" ? <div className="grid gap-4 md:grid-cols-2"><Field label="Display path 1"><Input maxLength={15} value={form.urlPath1} onChange={(event) => set("urlPath1", event.target.value)} /></Field><Field label="Display path 2"><Input maxLength={15} value={form.urlPath2} onChange={(event) => set("urlPath2", event.target.value)} /></Field></div> : null}</AdvancedPanel>
  </>;
}

function MetaFields({ form, set, section, errors }: { form: FormState; set: (key: keyof FormState, value: string) => void; section: "settings" | "creative"; errors: CampaignWizardFieldError[] }) {
  if (section === "creative") return <><Field label="Creative name" field="creativeName" error={wizardError(errors, "creativeName")}><Input required value={form.creativeName} onChange={(event) => set("creativeName", event.target.value)} /></Field><Field label="Ad name" field="adName" error={wizardError(errors, "adName")}><Input required value={form.adName} onChange={(event) => set("adName", event.target.value)} /></Field><Field label="Facebook Page reference" field="pageId" error={wizardError(errors, "pageId")}><Input required value={form.pageId} onChange={(event) => set("pageId", event.target.value)} /></Field><Field label="Instagram actor reference (optional)"><Input value={form.instagramActorId} onChange={(event) => set("instagramActorId", event.target.value)} /></Field><CreativeFields form={form} set={set} errors={errors} /></>;
  return <>
    <Field label="Buying type"><Input value="Auction" readOnly className="bg-slate-100" /></Field>
    <Field label="Conversion location"><Input value="Website" readOnly className="bg-slate-100" /></Field>
    <Field label="Optimization goal"><Choice value={form.optimizationGoal} options={metaGoalOptions(form.objective)} onChange={(value) => set("optimizationGoal", value)} /></Field>
    <Field label="Billing event"><Choice value={form.billingEvent} options={[{ value: "impressions", label: "Impressions" }]} onChange={(value) => set("billingEvent", value)} /></Field>
    <Field label="Pixel ID"><Input required value={form.pixelId} onChange={(event) => set("pixelId", event.target.value)} /></Field>
    <Field label="Conversion event"><Choice value={form.conversionEvent} options={metaEventOptions(form.objective)} onChange={(value) => set("conversionEvent", value)} /></Field>
    <Field label="Ad set name" field="groupName" error={wizardError(errors, "groupName")}><Input required value={form.groupName} onChange={(event) => set("groupName", event.target.value)} /></Field>
    <PlacementFields form={form} set={set} meta errors={errors} />
    <AudienceFields form={form} set={set} meta errors={errors} />
    <AdvancedPanel className="md:col-span-2"><div className="grid gap-4 md:grid-cols-2"><Field label="Budget scope"><Choice value={form.budgetScope} options={[{ value: "campaign", label: "Campaign" }, { value: "ad_group", label: "Ad set" }]} onChange={(value) => set("budgetScope", value)} /></Field><Field label="Budget mode"><Choice value={form.budgetMode} options={[{ value: "daily", label: "Daily" }, { value: "lifetime", label: "Lifetime" }]} onChange={(value) => set("budgetMode", value)} /></Field><Field label="Bid strategy"><Choice value={form.deliveryBidStrategy} options={["lowest_cost", "cost_cap", "bid_cap"].map(option)} onChange={(value) => set("deliveryBidStrategy", value)} /></Field>{form.deliveryBidStrategy !== "lowest_cost" ? <Field label="Bid amount"><Input type="number" min="0.01" step="0.01" value={form.bidAmount} onChange={(event) => set("bidAmount", event.target.value)} /></Field> : null}<Field label="Attribution window"><Choice value={form.attributionWindow} options={[{ value: "7d_click_1d_view", label: "7-day click / 1-day view" }, { value: "1d_click_1d_view", label: "1-day click / 1-day view" }]} onChange={(value) => set("attributionWindow", value)} /></Field></div></AdvancedPanel>
  </>;
}

function TikTokFields({ form, set, section, errors }: { form: FormState; set: (key: keyof FormState, value: string) => void; section: "settings" | "creative"; errors: CampaignWizardFieldError[] }) {
  if (section === "creative") return <>
    <Field label="Ad name" field="adName" error={wizardError(errors, "adName")}><Input required value={form.adName} onChange={(event) => set("adName", event.target.value)} /></Field>
    <Field label="Regular identity display name" field="identityName"><Input required value={form.identityName} onChange={(event) => set("identityName", event.target.value)} /></Field>
    <Field label="Video ID" field="assetIds"><Input required value={split(form.assetIds)[0] ?? ""} onChange={(event) => set("assetIds", event.target.value)} /></Field>
    <Field label="Ad copy" field="primaryText" className="md:col-span-2"><FixedTextarea required value={form.primaryText} onChange={(event) => set("primaryText", event.target.value)} /></Field>
    <Field label="Call to action" field="callToAction"><Choice value={form.callToAction} options={CTA_OPTIONS} onChange={(value) => set("callToAction", value)} /></Field>
  </>;
  return <>
    <Field label="Campaign type"><Input value="Auction" readOnly className="bg-slate-100" /></Field>
    <Field label="Budget mode"><Choice value={form.budgetMode} options={[{ value: "daily", label: "Daily" }, { value: "lifetime", label: "Lifetime" }]} onChange={(value) => set("budgetMode", value)} /></Field>
    <Field label="Optimization goal"><Choice value={form.optimizationGoal} options={tikTokGoalOptions(form.objective)} onChange={(value) => { set("optimizationGoal", value); set("billingEvent", tikTokBillingForGoal(value)); }} /></Field>
    <Field label="Pixel ID"><Input required value={form.pixelId} onChange={(event) => set("pixelId", event.target.value)} /></Field>
    <Field label="Conversion event"><Choice value={form.conversionEvent} options={tikTokEventOptions(form.objective)} onChange={(value) => set("conversionEvent", value)} /></Field>
    <Field label="Ad group name" field="groupName" error={wizardError(errors, "groupName")}><Input required value={form.groupName} onChange={(event) => set("groupName", event.target.value)} /></Field>
    <Field label="Billing event" field="billingEvent" error={wizardError(errors, "billingEvent")}><Input value={form.billingEvent.toUpperCase()} readOnly className="bg-slate-100" /></Field>
    <PlacementFields form={form} set={set} errors={errors} />
    <AudienceFields form={form} set={set} errors={errors} />
    <AdvancedPanel className="md:col-span-2"><div className="grid gap-4 md:grid-cols-2"><Field label="Promotion type"><Choice value={form.promotionType} options={[{ value: "website", label: "Website" }]} onChange={(value) => set("promotionType", value)} /></Field><Field label="Placement type"><Choice value={form.placementType} options={[{ value: "automatic", label: "Automatic" }, { value: "normal", label: "TikTok only" }]} onChange={(value) => set("placementType", value)} /></Field><Field label="Bid type"><Choice value={form.deliveryBidStrategy} options={[{ value: "lowest_cost", label: "Lowest cost" }, { value: "cost_cap", label: "Cost cap" }]} onChange={(value) => set("deliveryBidStrategy", value)} /></Field>{form.deliveryBidStrategy === "cost_cap" ? <Field label="Bid amount"><Input type="number" min="0.01" step="0.01" value={form.bidAmount} onChange={(event) => set("bidAmount", event.target.value)} /></Field> : null}<Field label="Pacing"><Choice value={form.pacing} options={[{ value: "smooth", label: "Smooth" }]} onChange={(value) => set("pacing", value)} /></Field><Field label="Click attribution"><Choice value={form.clickAttributionWindow} options={[{ value: "1d", label: "1 day" }, { value: "7d", label: "7 days" }]} onChange={(value) => set("clickAttributionWindow", value)} /></Field><Field label="View attribution"><Choice value={form.viewAttributionWindow} options={[{ value: "off", label: "Off" }, { value: "1d", label: "1 day" }]} onChange={(value) => set("viewAttributionWindow", value)} /></Field></div></AdvancedPanel>
  </>;
}

function PlacementFields({ form, set, meta = false, errors }: { form: FormState; set: (key: keyof FormState, value: string) => void; meta?: boolean; errors: CampaignWizardFieldError[] }) {
  return <>
    <Field label="Placement mode"><Choice value={form.placementMode} options={[{ value: "automatic", label: "Automatic" }, { value: "manual", label: "Manual" }]} onChange={(value) => set("placementMode", value)} /></Field>
    {form.placementMode === "manual" ? <Field label="Manual placements (comma separated)" field="manualPlacements" error={wizardError(errors, "manualPlacements")}><Input required value={form.manualPlacements} onChange={(event) => set("manualPlacements", event.target.value)} placeholder={meta ? "facebook_feed, instagram_feed" : "tiktok"} /></Field> : null}
  </>;
}

function AudienceFields({ form, set, meta = false, errors }: { form: FormState; set: (key: keyof FormState, value: string) => void; meta?: boolean; errors: CampaignWizardFieldError[] }) {
  return <>
    <Field label="Countries" field="countries" error={wizardError(errors, "countries")}><Input required value={form.countries} onChange={(event) => set("countries", event.target.value)} /></Field>
    {meta ? <><Field label="Minimum age"><Input required type="number" min="18" max="65" value={form.ageMin} onChange={(event) => set("ageMin", event.target.value)} /></Field><Field label="Maximum age"><Input required type="number" min="18" max="65" value={form.ageMax} onChange={(event) => set("ageMax", event.target.value)} /></Field></> : <Field label="Age groups"><MultiToggle value={form.ageGroups} options={["18-24", "25-34", "35-44", "45-54", "55+"]} onChange={(value) => set("ageGroups", value)} /></Field>}
    <Field label="Genders"><Input required value={form.genders} onChange={(event) => set("genders", event.target.value)} /></Field>
    <Field label="Interests"><Input value={form.interests} onChange={(event) => set("interests", event.target.value)} /></Field>
    {!meta ? <><Field label="Languages"><Input required value={form.languages} onChange={(event) => set("languages", event.target.value)} /></Field><Field label="Operating systems"><Input required value={form.operatingSystems} onChange={(event) => set("operatingSystems", event.target.value)} /></Field></> : null}
  </>;
}

function CreativeFields({ form, set, google = false, errors }: { form: FormState; set: (key: keyof FormState, value: string) => void; google?: boolean; errors: CampaignWizardFieldError[] }) {
  const formats = google
    ? [{ value: form.campaignType === "search" ? "responsive_search_ad" : form.campaignType === "performance_max" ? "performance_max_asset_group" : "demand_gen_asset", label: humanize(form.campaignType) }]
    : ["image", "video", "carousel", "existing_post"].map(option);
  return <>
    <Field label="Creative format"><Choice value={form.creativeFormat} options={formats} onChange={(value) => set("creativeFormat", value)} /></Field>
    {google && form.campaignType === "demand_gen" ? <Field label="Demand Gen ad format"><Choice value={form.demandGenFormat} options={[{ value: "multi_asset", label: "Multi-asset" }, { value: "carousel", label: "Carousel" }, { value: "video_responsive", label: "Video responsive" }]} onChange={(value) => set("demandGenFormat", value)} /></Field> : null}
    {google && form.campaignType !== "search" ? <Field label={form.campaignType === "performance_max" ? "Landscape image references" : "Image references"} field="assetIds" error={wizardError(errors, "assetIds")}><RepeatableList value={form.assetIds} onChange={(value) => set("assetIds", value)} addLabel="Add image" placeholder="Local or provider image reference" /></Field> : null}
    {!google ? <Field label={form.creativeFormat === "existing_post" ? "Existing post reference" : form.creativeFormat === "video" ? "Video reference" : "Asset references"} field="assetIds" error={wizardError(errors, "assetIds")}><RepeatableList value={form.assetIds} onChange={(value) => set("assetIds", value)} addLabel="Add asset" placeholder="Local or provider reference" /></Field> : null}
    {google && form.campaignType === "performance_max" ? <><Field label="Square image references" field="squareAssetIds" error={wizardError(errors, "squareAssetIds")}><RepeatableList value={form.squareAssetIds} onChange={(value) => set("squareAssetIds", value)} addLabel="Add square image" placeholder="Square image reference" /></Field><Field label="Logo references" field="logoAssetIds" error={wizardError(errors, "logoAssetIds")}><RepeatableList value={form.logoAssetIds} onChange={(value) => set("logoAssetIds", value)} addLabel="Add logo" placeholder="Logo reference" /></Field><Field label="Portrait image references (optional)"><RepeatableList value={form.portraitAssetIds} onChange={(value) => set("portraitAssetIds", value)} addLabel="Add portrait image" placeholder="Portrait image reference" allowEmpty /></Field></> : null}
    {google && form.campaignType !== "search" ? <Field label="Video references (optional)" field="videoAssetIds" error={wizardError(errors, "videoAssetIds")}><RepeatableList value={form.videoAssetIds} onChange={(value) => set("videoAssetIds", value)} addLabel="Add video" placeholder="Video reference" allowEmpty /></Field> : null}
    {form.creativeFormat !== "existing_post" ? <><Field label={google ? "Headlines" : form.creativeFormat === "carousel" ? "Card headlines" : "Headline"} field="headline" error={wizardError(errors, "headline")} className="md:col-span-2">{google || form.creativeFormat === "carousel" ? <RepeatableList value={form.headline} onChange={(value) => set("headline", value)} addLabel="Add headline" placeholder="Headline" maxLength={google && form.campaignType === "demand_gen" ? 40 : google ? 30 : 255} /> : <Input required maxLength={255} value={form.headline} onChange={(event) => set("headline", event.target.value)} />}</Field>{!google && form.creativeFormat === "carousel" ? <Field label="Card destinations" field="carouselDestinations" error={wizardError(errors, "carouselDestinations")} className="md:col-span-2"><RepeatableList value={form.carouselDestinations} onChange={(value) => set("carouselDestinations", value)} addLabel="Add destination" placeholder="https://example.com/card" /></Field> : null}{google && form.campaignType === "performance_max" ? <Field label="Long headlines" field="longHeadlines" error={wizardError(errors, "longHeadlines")} className="md:col-span-2"><RepeatableList value={form.longHeadlines} onChange={(value) => set("longHeadlines", value)} addLabel="Add long headline" placeholder="Long headline" maxLength={90} /></Field> : null}<Field label={google ? "Descriptions" : "Primary text"} field={google ? "descriptions" : "primaryText"} error={wizardError(errors, google ? "descriptions" : "primaryText")} className="md:col-span-2">{google ? <RepeatableList value={form.descriptions} onChange={(value) => set("descriptions", value)} addLabel="Add description" placeholder="Description" maxLength={90} /> : <FixedTextarea required value={form.primaryText} maxLength={2200} onChange={(event) => set("primaryText", event.target.value)} />}</Field></> : null}
    {google && form.campaignType !== "search" ? <Field label="Business name"><Input required value={form.businessName} onChange={(event) => set("businessName", event.target.value)} /></Field> : null}
    {!google && form.creativeFormat !== "existing_post" ? <Field label="Call to action"><Choice value={form.callToAction} options={CTA_OPTIONS} onChange={(value) => set("callToAction", value)} /></Field> : null}
  </>;
}

function AdvancedPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <Collapsible className={`rounded-xl border bg-white ${className}`}><CollapsibleTrigger asChild><Button type="button" variant="ghost" className="w-full justify-between px-4">Advanced provider settings <ChevronRightIcon className="size-4" /></Button></CollapsibleTrigger><CollapsibleContent className="space-y-4 border-t p-4">{children}</CollapsibleContent></Collapsible>; }

function RepeatableList({ value, onChange, addLabel, placeholder, maxLength, allowEmpty = false }: { value: string; onChange: (value: string) => void; addLabel: string; placeholder: string; maxLength?: number; allowEmpty?: boolean }) {
  const parsed = split(value);
  const [pendingRows, setPendingRows] = useState(0);
  const visibleItems = [...(parsed.length ? parsed : allowEmpty ? [] : [""]), ...Array.from({ length: pendingRows }, () => "")];
  const commit = (values: string[]) => { setPendingRows(0); onChange(values.filter((item) => item.trim()).join(", ")); };
  const update = (index: number, next: string) => { const values = [...visibleItems]; values[index] = next; commit(values); };
  return <div className="space-y-2">{visibleItems.map((item, index) => <div key={`${index}-${visibleItems.length}`} className="flex items-start gap-2"><div className="min-w-0 flex-1"><Input value={item} maxLength={maxLength} placeholder={placeholder} onChange={(event) => update(index, event.target.value)} />{maxLength ? <p className="mt-1 text-right text-[11px] text-muted-foreground">{item.length}/{maxLength}</p> : null}</div><Button type="button" variant="outline" size="icon" aria-label={`Remove ${placeholder}`} disabled={!allowEmpty && visibleItems.length === 1} onClick={() => commit(visibleItems.filter((_, itemIndex) => itemIndex !== index))}><XIcon /></Button></div>)}<Button type="button" variant="outline" size="sm" onClick={() => setPendingRows((count) => count + 1)}><PlusIcon /> {addLabel}</Button></div>;
}

function KeywordList({ keywords, matchTypes, onChange }: { keywords: string; matchTypes: string; onChange: (keywords: string, matchTypes: string) => void }) {
  const keywordItems = split(keywords);
  const typeItems = split(matchTypes);
  const [pendingRows, setPendingRows] = useState(0);
  const rows = [...(keywordItems.length ? keywordItems : [""]).map((keyword, index) => ({ keyword, matchType: typeItems[index] ?? "phrase" })), ...Array.from({ length: pendingRows }, () => ({ keyword: "", matchType: "phrase" }))];
  const commit = (next: Array<{ keyword: string; matchType: string }>) => { setPendingRows(0); const completed = next.filter((item) => item.keyword.trim()); onChange(completed.map((item) => item.keyword).join(", "), completed.map((item) => item.matchType).join(", ")); };
  return <div className="space-y-2">{rows.map((row, index) => <div key={`${index}-${rows.length}`} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]"><Input value={row.keyword} placeholder="Keyword" onChange={(event) => { const next = [...rows]; next[index] = { ...row, keyword: event.target.value }; commit(next); }} /><Choice value={row.matchType} options={[{ value: "exact", label: "Exact" }, { value: "phrase", label: "Phrase" }, { value: "broad", label: "Broad" }]} onChange={(value) => { const next = [...rows]; next[index] = { ...row, matchType: value }; commit(next); }} /><Button type="button" variant="outline" size="icon" aria-label="Remove keyword" disabled={rows.length === 1} onClick={() => commit(rows.filter((_, rowIndex) => rowIndex !== index))}><XIcon /></Button></div>)}<Button type="button" variant="outline" size="sm" onClick={() => setPendingRows((count) => count + 1)}><PlusIcon /> Add keyword</Button></div>;
}

function MultiToggle({ value, options, onChange }: { value: string; options: string[]; onChange: (value: string) => void }) { const selected = new Set(split(value)); return <div className="flex flex-wrap gap-2">{options.map((option) => <Button key={option} type="button" size="sm" variant={selected.has(option) ? "default" : "outline"} onClick={() => { const next = new Set(selected); if (next.has(option)) next.delete(option); else next.add(option); onChange(options.filter((item) => next.has(item)).join(", ")); }}>{option}</Button>)}</div>; }

function CampaignDetail({ detail, busy, isAdmin, approvalRequired, editing, onToggleEdit, onClose, runReadinessAction }: { detail: CampaignPlanDetail; busy: boolean; isAdmin: boolean; approvalRequired: boolean; editing: boolean; onToggleEdit: () => void; onClose: () => void; runReadinessAction: (detail: CampaignPlanDetail, action: "validate_readiness" | "approve_readiness") => void }) {
  return <Card className="border-red-200 bg-white shadow-sm"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{detail.plan.campaignName}</CardTitle><CardDescription>{detail.plan.platform.toUpperCase()} · Revision {detail.currentRevision.revisionNo} · immutable revision</CardDescription></div><div className="flex items-center gap-2">{isAdmin && detail.plan.status === "draft" ? <Button type="button" variant="outline" size="sm" onClick={onToggleEdit}>{editing ? <XIcon /> : <PencilIcon />}{editing ? "Cancel edit" : "Edit details"}</Button> : null}<CampaignStatusBadge status={detail.plan.status} /><Button type="button" variant="ghost" size="icon-sm" aria-label="Close campaign details" onClick={onClose}><XIcon /></Button></div></div></CardHeader><CardContent className="space-y-5">
    <CampaignDetailTable detail={detail} />
    <CampaignReadiness detail={detail} busy={busy} isAdmin={isAdmin} approvalRequired={approvalRequired} onAction={(action) => runReadinessAction(detail, action)} />
  </CardContent></Card>;
}

function CampaignReadiness({ detail, busy, isAdmin, approvalRequired, onAction }: { detail: CampaignPlanDetail; busy: boolean; isAdmin: boolean; approvalRequired: boolean; onAction: (action: "validate_readiness" | "approve_readiness") => void }) {
  const ready = detail.readiness?.result === "passed"
    && detail.readiness.revisionId === detail.currentRevision.id
    && detail.readiness.revisionHash === detail.currentRevision.payloadHash;
  const approvalRecorded = detail.plan.status === "approved" && detail.approval && detail.build;
  const approved = approvalRecorded && detail.providerReadiness.providerReady;
  const canCheck = detail.plan.status === "draft" || detail.plan.status === "awaiting_approval";
  return <section className="overflow-hidden rounded-xl border bg-white">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4">
      <div><div className="flex items-center gap-2 font-semibold"><ShieldCheckIcon className="size-5 text-red-600" /> Campaign readiness</div><p className="mt-1 text-sm text-muted-foreground">Validate the exact immutable revision before any future provider integration.</p></div>
      {approved ? <Badge className="bg-emerald-600">Ready for provider integration</Badge> : approvalRecorded ? <Badge variant="outline" className="border-amber-300 text-amber-800">Provider resolution pending</Badge> : detail.readiness ? <Badge variant="outline">{humanize(detail.readiness.result)}</Badge> : <Badge variant="outline">Not checked</Badge>}
    </div>
    <div className="space-y-4 p-4">
      {detail.readiness ? <div className="grid gap-2 md:grid-cols-2">{detail.readiness.checks.map((check) => <div key={check.key} className={`rounded-lg border p-3 ${check.status === "passed" ? "border-emerald-200 bg-emerald-50" : check.status === "failed" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}><div className="flex items-start gap-2">{check.status === "passed" ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-700" /> : <AlertCircleIcon className={`mt-0.5 size-4 shrink-0 ${check.status === "failed" ? "text-red-700" : "text-amber-700"}`} />}<div><p className="text-sm font-medium">{check.label}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{check.detail}</p></div></div></div>)}</div> : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No readiness snapshot exists for this revision yet.</div>}
      {approved ? <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4"><p className="font-medium text-emerald-950">Ready for provider integration</p><p className="mt-1 text-sm text-emerald-900">Approval #{detail.approval?.id} created pending Gate 1 build #{detail.build?.id}. No provider request was made.</p></div> : approvalRecorded ? <div className="rounded-lg border border-amber-300 bg-amber-50 p-4"><p className="font-medium text-amber-950">Approved revision still needs provider resources</p><p className="mt-1 text-sm text-amber-900">This historical approval is preserved, but it is not provider-ready until every required reference and provider-dependent check is resolved.</p></div> : <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy || !isAdmin || !canCheck} onClick={() => onAction("validate_readiness")}>{busy ? <LoaderCircleIcon className="animate-spin" /> : <RefreshCwIcon />} {approvalRequired ? "Run readiness checks" : "Run checks and approve"}</Button>{approvalRequired ? <Button type="button" disabled={busy || !isAdmin || !canCheck || !ready} onClick={() => onAction("approve_readiness")}><CheckIcon /> Approve exact revision</Button> : null}{!canCheck ? <p className="basis-full text-xs text-muted-foreground">Readiness approval is available only before a campaign leaves draft workflow.</p> : null}</div>}
      <div className="grid gap-2 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">{["Provider creation", "Activation", "Provider readback", "M05 handoff"].map((label) => <Button key={label} type="button" variant="outline" disabled className="justify-start"><BanIcon /> {label}</Button>)}</div>
      <p className="text-xs text-muted-foreground">Provider execution is locked. These controls will be enabled only in a separately reviewed integration phase.</p>
    </div>
  </section>;
}

function CampaignEditWizard({ detail, accounts, packages, busy, onCancel, onSave }: { detail: CampaignPlanDetail; accounts: CampaignPlanningListPayload["accounts"]; packages: CampaignPlanningListPayload["packages"]; busy: boolean; onCancel: () => void; onSave: (campaign: CampaignPlanDraftInput) => Promise<CampaignUpdateResult> }) {
  const initialForm = useMemo(() => hydrateCampaignWizardFromRevision(detail), [detail]);
  const [form, setFormState] = useState<FormState>(initialForm);
  const [currentStep, setCurrentStep] = useState(0);
  const [highestReachedStep, setHighestReachedStep] = useState(0);
  const [errors, setErrors] = useState<CampaignWizardFieldError[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitError, setSubmitError] = useState<CampaignEditSubmitError | null>(null);
  const [ready, setReady] = useState(false);
  const [stale, setStale] = useState(false);
  const latest = useRef({ form: initialForm, currentStep: 0, highestReachedStep: 0 });
  const dirty = useRef(false);
  const suppressUnmountSave = useRef(false);

  useEffect(() => { latest.current = { form, currentStep, highestReachedStep }; }, [form, currentStep, highestReachedStep]);

  const setForm: React.Dispatch<React.SetStateAction<FormState>> = useCallback((update) => {
    dirty.current = true;
    setSubmitError(null);
    setFormState(update);
  }, []);

  const saveDraft = useCallback(async (options?: { keepalive?: boolean; currentStep?: number; highestReachedStep?: number }) => {
    const snapshot = latest.current;
    setSaveStatus("saving");
    try {
      const response = await fetch(`/api/campaign-planning/${detail.plan.id}/edit-draft`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        keepalive: options?.keepalive,
        body: JSON.stringify({
          base_revision_id: detail.currentRevision.id,
          base_lock_version: detail.plan.lockVersion,
          platform: detail.plan.platform,
          current_step: options?.currentStep ?? snapshot.currentStep,
          highest_reached_step: options?.highestReachedStep ?? snapshot.highestReachedStep,
          form_data: snapshot.form,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; stale?: boolean };
      if (!response.ok) {
        if (payload.stale) setStale(true);
        throw new Error(payload.error || "Unable to save the incomplete campaign edit.");
      }
      dirty.current = false;
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, [detail.currentRevision.id, detail.plan.id, detail.plan.lockVersion, detail.plan.platform]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/campaign-planning/${detail.plan.id}/edit-draft`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { draft?: CampaignEditDraft | null; stale?: boolean; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to restore the incomplete campaign edit.");
        if (cancelled) return;
        if (payload.stale) setStale(true);
        else if (payload.draft) {
          const restored = restoreCampaignWizardForm(detail.plan.platform, payload.draft.formData);
          const progress = normalizeCampaignWizardProgress(payload.draft.currentStep, payload.draft.highestReachedStep);
          setFormState(restored); setCurrentStep(progress.currentStep); setHighestReachedStep(progress.highestReachedStep); setSaveStatus("saved");
        }
        setReady(true);
      })
      .catch(() => { if (!cancelled) { setReady(true); setSaveStatus("error"); } });
    return () => { cancelled = true; };
  }, [detail.plan.id, detail.plan.platform]);

  useEffect(() => {
    if (!ready || !dirty.current || stale || !shouldAutosaveCampaignWizardStep(currentStep)) return;
    setSaveStatus("idle");
    const timer = window.setTimeout(() => { void saveDraft(); }, 5_000);
    return () => window.clearTimeout(timer);
  }, [form, highestReachedStep, currentStep, ready, saveDraft, stale]);

  useEffect(() => {
    const flush = () => { if (!suppressUnmountSave.current && dirty.current && !stale && shouldAutosaveCampaignWizardStep(latest.current.currentStep)) void saveDraft({ keepalive: true }); };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [saveDraft, stale]);

  async function restartFromLatest() {
    suppressUnmountSave.current = true;
    await fetch(`/api/campaign-planning/${detail.plan.id}/edit-draft`, { method: "DELETE" }).catch(() => undefined);
    suppressUnmountSave.current = false;
    dirty.current = false;
    setFormState(initialForm); setCurrentStep(0); setHighestReachedStep(0); setErrors([]); setSaveStatus("idle"); setSubmitError(null); setStale(false); setReady(true);
  }

  function goNext() {
    const nextErrors = validateCampaignWizardStep(form, currentStep);
    setErrors(nextErrors);
    if (nextErrors.length) return focusWizardError(nextErrors[0]);
    const next = Math.min(4, currentStep + 1);
    const highest = Math.max(highestReachedStep, next);
    setCurrentStep(next); setHighestReachedStep(highest); setErrors([]); dirty.current = true;
    latest.current = { form, currentStep: next, highestReachedStep: highest };
    if (shouldAutosaveCampaignWizardStep(next)) void saveDraft({ currentStep: next, highestReachedStep: highest });
  }

  function goPrevious() {
    const previous = Math.max(0, currentStep - 1);
    setCurrentStep(previous); setErrors([]); dirty.current = true;
    latest.current = { form, currentStep: previous, highestReachedStep };
    void saveDraft({ currentStep: previous });
  }

  function goToStep(step: number) {
    if (step > highestReachedStep) return;
    setCurrentStep(step); setErrors([]); dirty.current = true;
    latest.current = { form, currentStep: step, highestReachedStep };
    if (shouldAutosaveCampaignWizardStep(step)) void saveDraft({ currentStep: step });
  }

  async function submitEdit() {
    setSubmitError(null);
    for (let step = 0; step < 4; step += 1) {
      const stepErrors = validateCampaignWizardStep(form, step);
      if (stepErrors.length) {
        const first = stepErrors[0];
        setSubmitError({ message: first.message, issue: { ...first, step, path: [], severity: "error" } });
        return;
      }
    }
    const account = accounts.find((item) => item.id === detail.plan.accountId);
    if (!account) { setSubmitError({ message: "The campaign account is no longer available." }); return; }
    const validated = validateCampaignSubmission(form, account);
    if (!validated.success) {
      const issue = validated.issues[0];
      setSubmitError({ message: issue?.message ?? validated.error, issue });
      return;
    }
    const result = await onSave(validated.campaign);
    if (result.success) {
      suppressUnmountSave.current = true;
      dirty.current = false;
      onCancel();
      return;
    }
    const apiIssue = result.issues[0];
    const issue = apiIssue ? { ...apiIssue, ...mapCampaignIssueToWizardField(apiIssue.path) } : undefined;
    setSubmitError({ message: apiIssue?.message ?? result.error, issue });
  }

  function goToSubmitError() {
    if (!submitError?.issue) return;
    const { field, message, step } = submitError.issue;
    setCurrentStep(step);
    setErrors([{ field, message }]);
    focusWizardError({ field, message });
  }

  return <Card className="overflow-hidden border-red-200 shadow-sm">
    <CardHeader className="flex flex-row items-start justify-between gap-4 border-b bg-white">
      <div><CardTitle>Edit campaign</CardTitle><CardDescription>Update {detail.plan.campaignName} using the full platform setup, then save a new immutable revision.</CardDescription></div>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Close campaign editor" onClick={onCancel}><XIcon /></Button>
    </CardHeader>
    <CardContent className="flex h-[min(820px,calc(100vh-8rem))] min-h-[560px] flex-col overflow-hidden p-0">
      {!ready ? <div className="flex flex-1 items-center justify-center"><LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" /><span className="ml-2 text-sm text-muted-foreground">Restoring your edit…</span></div> : stale ? <div className="m-5 rounded-xl border border-amber-300 bg-amber-50 p-5"><div className="flex items-start gap-3"><AlertCircleIcon className="mt-0.5 size-5 text-amber-700" /><div><p className="font-medium text-amber-950">This campaign changed after the edit was saved.</p><p className="mt-1 text-sm text-amber-900">Restart from the latest immutable revision before continuing.</p><Button type="button" className="mt-4" onClick={() => void restartFromLatest()}><RotateCcwIcon /> Restart from latest</Button></div></div></div> : <CreateForm form={form} setForm={setForm} accounts={accounts.filter((item) => item.id === detail.plan.accountId)} packages={packages.filter((item) => item.id === detail.plan.packageId)} busy={busy} submit={() => void submitEdit()} currentStep={currentStep} highestReachedStep={highestReachedStep} errors={errors} saveStatus={saveStatus} onStepClick={goToStep} onNext={goNext} onPrevious={goPrevious} onDiscard={() => void restartFromLatest()} onRetrySave={() => void saveDraft()} onPlatformChange={() => undefined} mode="edit" identityLocked submitError={submitError} onGoToSubmitError={goToSubmitError} />}
    </CardContent>
  </Card>;
}

function CampaignCard({ campaign, selected, onClick }: { campaign: CampaignPlanningListPayload["campaigns"][number]; selected: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`rounded-xl border bg-white p-4 text-left transition hover:border-red-300 hover:shadow-sm ${selected ? "border-red-400 ring-2 ring-red-100" : ""}`}>
    <div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{campaign.campaignName}</p><p className="mt-1 text-sm text-muted-foreground">{campaign.clientName} · {campaign.accountName}</p></div><CampaignStatusBadge status={campaign.status} /></div>
    <div className="mt-4 flex items-center justify-between text-sm"><span className="uppercase tracking-wide text-muted-foreground">{campaign.platform}</span><span>{money(campaign.allocatedBudget, campaign.currency)}</span></div>
  </button>;
}

function CampaignStatusBadge({ status }: { status: CampaignPlanStatus }) {
  const presentation = CAMPAIGN_STATUS_PRESENTATIONS[status];
  return <Badge variant="outline" className={presentation.badgeClassName}>{presentation.label}</Badge>;
}

function CampaignStatusLegend() {
  const visibleStatuses: CampaignPlanStatus[] = ["draft", "launched"];

  return <div aria-label="Campaign status legend" className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border bg-muted/20 px-4 py-3.5 text-sm text-muted-foreground">
    <span className="font-semibold text-foreground">Status legend</span>
    {visibleStatuses.map((status) => {
      const presentation = CAMPAIGN_STATUS_PRESENTATIONS[status];
      return <span key={status} className="inline-flex items-center gap-2 whitespace-nowrap"><span aria-hidden="true" className={`shrink-0 rounded-full ${presentation.dotClassName}`} />{presentation.label}</span>;
    })}
  </div>;
}

function FilterChoice({ ariaLabel, value, options, onChange }: { ariaLabel: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={ariaLabel} size="sm" className="min-w-36 bg-white"><SelectValue /></SelectTrigger><SelectContent position="popper" align="end">{options.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>;
}

function Pagination({ page, pageCount, total, setPage }: { page: number; pageCount: number; total: number; setPage: (page: number) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm text-muted-foreground"><span>{total} campaign{total === 1 ? "" : "s"} · up to 10 per page</span><div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeftIcon /> Previous</Button><span className="min-w-24 text-center">Page {page} of {pageCount}</span><Button type="button" variant="outline" size="sm" disabled={page === pageCount} onClick={() => setPage(page + 1)}>Next <ChevronRightIcon /></Button></div></div>;
}

function CampaignDetailTable({ detail }: { detail: CampaignPlanDetail }) {
  const columns = [
    { key: "campaign", label: "Campaign", value: detail.plan.campaignName, width: 300 },
    { key: "status", label: "Status", value: humanize(detail.plan.status) },
    { key: "objective", label: "Objective", value: humanize(detail.plan.objective) },
    { key: "flight", label: "Flight", value: `${detail.plan.startDate} → ${detail.plan.endDate}`, width: 230 },
    { key: "budget", label: "Budget", value: money(detail.plan.allocatedBudget, detail.plan.currency) },
    { key: "destination", label: "Destination", value: detail.plan.destination, width: 280 },
    { key: "revision", label: "Revision", value: String(detail.currentRevision.revisionNo) },
    { key: "daily_budget", label: "Daily Budget", value: money(detail.currentRevision.dailyBudget, detail.plan.currency) },
    { key: "projected_total", label: "Projected Total", value: money(detail.currentRevision.projectedTotal, detail.plan.currency) },
    { key: "author", label: "Author", value: detail.currentRevision.authorName, width: 220 },
    { key: "payload_hash", label: "Payload Hash", value: detail.currentRevision.payloadHash, width: 360 },
    ...flattenCampaignDetail(detail.platformDetail.values).map((column) => ({ ...column, key: `provider.${column.key}` })),
  ];
  return <div className="overflow-hidden rounded-xl border bg-white"><div className="flex items-center justify-between border-b bg-white px-4 py-3"><p className="font-medium">Campaign data</p><p className="text-xs text-muted-foreground">Scroll horizontally to view all columns</p></div><div className="overflow-x-auto overscroll-x-contain"><table className="border-collapse bg-white text-left text-sm" style={{ minWidth: Math.max(1800, columns.reduce((total, column) => total + ("width" in column && column.width ? column.width : 180), 0)) }}><thead><tr className="border-b bg-white">{columns.map((column, index) => <th key={column.key} scope="col" className={`whitespace-nowrap border-r px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground ${index === 0 ? "sticky left-0 z-10 bg-white" : ""}`} style={{ width: "width" in column ? column.width : 180, minWidth: "width" in column ? column.width : 180 }}>{column.label}</th>)}</tr></thead><tbody><tr>{columns.map((column, index) => <td key={column.key} title={column.value} className={`max-w-80 border-r px-4 py-4 align-top font-medium ${index === 0 ? "sticky left-0 z-10 bg-white" : ""}`}><span className="line-clamp-3 break-words">{column.value}</span></td>)}</tr></tbody></table></div></div>;
}

function SummarySkeleton() { return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Card key={index} size="sm"><CardContent className="space-y-3"><Skeleton className="h-3 w-20" /><Skeleton className="h-8 w-12" /></CardContent></Card>)}</div>; }
function CampaignListSkeleton() { return <div className="grid gap-3 lg:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <div key={index} className="space-y-4 rounded-xl border p-4"><div className="flex justify-between gap-4"><div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div><Skeleton className="h-6 w-20" /></div><div className="flex justify-between"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-24" /></div></div>)}</div>; }
function CampaignDetailSkeleton() { return <Card className="border-red-200"><CardHeader className="space-y-3"><Skeleton className="h-5 w-2/5" /><Skeleton className="h-4 w-1/4" /></CardHeader><CardContent className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-14" />)}</div><div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div></CardContent></Card>; }

function objectiveForm(current: FormState, objective: string): FormState {
  if (current.platform === "meta") return { ...current, objective, optimizationGoal: objective === "traffic" ? "landing_page_views" : "offsite_conversions", conversionEvent: objective === "traffic" ? "view_content" : objective === "sales" ? "purchase" : "lead" };
  if (current.platform === "tiktok") { const optimizationGoal = objective === "traffic" ? "click" : objective === "web_conversions" ? "complete_payment" : "lead"; return { ...current, objective, optimizationGoal, billingEvent: tikTokBillingForGoal(optimizationGoal), conversionEvent: objective === "traffic" ? "page_view" : objective === "web_conversions" ? "purchase" : "submit_form" }; }
  return { ...current, objective };
}

function googleTypeForm(current: FormState, campaignType: string): FormState {
  return { ...current, campaignType, creativeFormat: campaignType === "search" ? "responsive_search_ad" : campaignType === "performance_max" ? "performance_max_asset_group" : "demand_gen_asset", biddingStrategy: current.biddingStrategy === "maximize_clicks" && campaignType !== "search" ? "maximize_conversions" : current.biddingStrategy };
}

function objectiveOptions(platform: CampaignPlatform) { return (platform === "google" ? ["sales", "leads", "website_traffic"] : platform === "meta" ? ["traffic", "leads", "sales"] : ["traffic", "web_conversions", "lead_generation"]).map(option); }
function metaGoalOptions(objective: string) { return (objective === "traffic" ? ["landing_page_views", "link_clicks"] : ["offsite_conversions"]).map(option); }
function metaEventOptions(objective: string) { return [objective === "traffic" ? "view_content" : objective === "sales" ? "purchase" : "lead"].map(option); }
function tikTokGoalOptions(objective: string) { return (objective === "traffic" ? ["click", "landing_page_view"] : objective === "web_conversions" ? ["complete_payment"] : ["lead"]).map(option); }
function tikTokEventOptions(objective: string) { return [objective === "traffic" ? "page_view" : objective === "web_conversions" ? "purchase" : "submit_form"].map(option); }
function tikTokBillingForGoal(goal: string) { return goal === "click" ? "cpc" : "ocpm"; }
const PLATFORM_OPTIONS = [{ value: "google", label: "Google Ads" }, { value: "meta", label: "Meta Ads" }, { value: "tiktok", label: "TikTok Ads" }];
const PLATFORM_FILTER_OPTIONS = [{ value: "all", label: "All platforms" }, ...PLATFORM_OPTIONS];
const STATUS_FILTER_OPTIONS = ["all", "draft", "awaiting_approval", "approved", "launch_in_progress", "launched", "cancelled"].map((value) => ({ value, label: value === "all" ? "All statuses" : humanize(value) }));
const CTA_OPTIONS = ["learn_more", "shop_now", "sign_up", "apply_now"].map(option);

function Choice({ value, options, onChange, placeholder = "Select" }: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; placeholder?: string }) { return <Select value={value || undefined} onValueChange={onChange}><SelectTrigger className="w-full bg-white"><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent position="popper" align="start">{options.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>; }
function DatePickerField({ value, onChange }: { value: string; onChange: (value: string) => void }) { const date = value ? new Date(`${value}T00:00:00`) : undefined; return <Popover><PopoverTrigger asChild><Button type="button" variant="outline" className="w-full justify-start bg-white font-normal"><CalendarIcon />{date ? date.toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" }) : "Pick a date"}</Button></PopoverTrigger><PopoverContent align="start" className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={(selected) => { if (selected) onChange(`${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}`); }} /></PopoverContent></Popover>; }
function FixedTextarea(props: React.ComponentProps<typeof Textarea>) { return <Textarea {...props} className={`h-28 resize-none overflow-y-auto ${props.className ?? ""}`} />; }
function wizardError(errors: CampaignWizardFieldError[], field: keyof FormState) { return errors.find((item) => item.field === field)?.message; }
function focusWizardError(error: CampaignWizardFieldError) { window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-wizard-field="${error.field}"]`)?.focus()); }
function Field({ label, children, className = "", field, error }: { label: string; children: React.ReactNode; className?: string; field?: keyof FormState; error?: string }) { return <div tabIndex={field ? -1 : undefined} data-wizard-field={field} className={`space-y-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${className}`}><Label>{label}</Label>{children}{error ? <p className="text-xs text-red-700">{error}</p> : null}</div>; }
function Summary({ label, value }: { label: string; value: number }) { return <Card size="sm"><CardContent><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>; }
function split(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function option(value: string) { return { value, label: humanize(value) }; }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function money(value: number, currency: string) { return new Intl.NumberFormat("en-MY", { style: "currency", currency }).format(value); }
function errorMessage(reason: unknown) { return reason instanceof Error ? reason.message : "Unable to complete the local Stage 2 request."; }
