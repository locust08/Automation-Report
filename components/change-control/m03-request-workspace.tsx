"use client";

import { M03RequestDetailView } from "@/components/change-control/m03-request-detail";
import { M03RequestEditor, type M03MetaManagementEditorContext } from "@/components/change-control/m03-request-editor";
import { M03RequestList } from "@/components/change-control/m03-request-list";
import { M03StatusSummary } from "@/components/change-control/m03-status-summary";
import { useM03WorkspaceController } from "@/components/change-control/m03-workspace-controller";
import { useWorkflowPolicies } from "@/components/workflow-settings/use-workflow-policies";
import { approvalRequired } from "@/lib/workflow-settings/policy";
import type { M03RequestPrefill, M03WorkspaceScope } from "@/lib/change-control/workspace";
import {
  resolveMetaManagementResourceForForm,
  validateMetaManagementRequestForm,
  type M03MetaManagementResource,
} from "@/lib/change-control/meta-management-builder";

export type M03MetaManagementWorkspaceContext = {
  accountIdentity: string;
  accountName: string;
  resources: readonly M03MetaManagementResource[];
  onRefreshOfficialData: () => readonly M03MetaManagementResource[] | null | Promise<readonly M03MetaManagementResource[] | null>;
};

export type M03RequestWorkspaceProps = {
  scope?: M03WorkspaceScope;
  prefill?: M03RequestPrefill | null;
  prefillReason?: string;
  showStatusSummary?: boolean;
  className?: string;
  exactRequestId?: string | null;
  metaManagement?: M03MetaManagementWorkspaceContext;
  showNewRequestAction?: boolean;
  focusEditorWhenOpen?: boolean;
};

export function M03RequestWorkspace({ scope = {}, prefill, prefillReason, showStatusSummary = true, className, exactRequestId, metaManagement, showNewRequestAction, focusEditorWhenOpen = false }: M03RequestWorkspaceProps) {
  const controller = useM03WorkspaceController({ scope, prefill, prefillReason, exactRequestId });
  const policies = useWorkflowPolicies();
  const m03ApprovalRequired = approvalRequired(policies, "m03_change_control_approval");
  const accountScoped = Boolean(scope.accountIdentity);
  const metaResolution = metaManagement
    ? resolveMetaManagementResourceForForm(controller.form, metaManagement.resources)
    : null;
  const metaIssues = metaManagement
    ? [
        ...(metaResolution?.issue ? [metaResolution.issue] : []),
        ...validateMetaManagementRequestForm(controller.form, { officialResource: metaResolution?.resource ?? null }),
      ].filter((issue, index, issues) => issues.indexOf(issue) === index)
    : [];
  const baselineConflict = Boolean(metaManagement && controller.error?.includes("Refresh official data"));
  const effectiveMetaManagement: M03MetaManagementEditorContext | undefined = metaManagement ? {
    accountIdentity: metaManagement.accountIdentity,
    accountName: metaManagement.accountName,
    resource: metaResolution?.resource ?? null,
    resourceIssue: metaResolution?.issue ?? null,
    onRefreshOfficialData: async () => {
      const resources = await metaManagement.onRefreshOfficialData();
      const resource = resources
        ? resolveMetaManagementResourceForForm(controller.form, resources).resource
        : null;
      if (resource) controller.clearError();
      return resource;
    },
  } : undefined;
  const detailIsListed = Boolean(controller.detail && controller.payload?.requests.some((request) => request.id === controller.detail?.request.id));
  const detailView = controller.detail ? <M03RequestDetailView detail={controller.detail} providerPreview={controller.providerPreview} providerPreviewError={controller.providerPreviewError} busy={controller.busy} approvalRequired={m03ApprovalRequired} editingBlocked={Boolean(controller.reconciliation)} onEdit={() => controller.openEditRequest(controller.detail!.request)} onAction={controller.action} /> : null;

  return <div className={className ?? "space-y-5"}>
    {controller.error ? <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{controller.error}</div> : null}
    {showStatusSummary && !(focusEditorWhenOpen && controller.formOpen) ? <M03StatusSummary payload={controller.payload} /> : null}
    {!(focusEditorWhenOpen && controller.formOpen) ? <M03RequestList
      payload={controller.payload}
      selectedRequestId={controller.detail?.request.id}
      platform={controller.platform}
      status={controller.status}
      page={controller.page}
      pageSize={controller.pageSize}
      navigationBlocked={Boolean(controller.reconciliation)}
      showNewRequestAction={showNewRequestAction}
      allowPlatformFilter={!scope.platform}
      allowCampaignFilter={accountScoped && !scope.campaignIdentity}
      campaignIdentity={controller.campaignIdentity}
      onPlatformChange={controller.setPlatform}
      onStatusChange={controller.setStatus}
      onCampaignIdentityChange={controller.setCampaignIdentity}
      onPageChange={controller.setPage}
      onPageSizeChange={controller.setPageSize}
      onRefresh={() => void controller.load()}
      onNewRequest={() => controller.openNewRequest()}
      onSelectRequest={(request) => void controller.selectRequest(request)}
      renderSelectedDetail={() => detailView}
    /> : null}
    {controller.detail && !detailIsListed && !(focusEditorWhenOpen && controller.formOpen) ? detailView : null}
    {controller.formOpen ? <M03RequestEditor form={controller.form} setForm={controller.setForm} editing={controller.editing} reconciliation={controller.reconciliation} scope={scope} busy={controller.busy} canSave={controller.canSave && metaIssues.length === 0 && !baselineConflict} sourceEvidenceError={controller.sourceEvidenceError} baselineConflict={baselineConflict} onClose={controller.closeEditor} onReloadLatest={() => void controller.reloadLatestVersion()} onSave={() => void controller.saveRequest()} metaManagement={effectiveMetaManagement} /> : null}
  </div>;
}

export type { M03RequestPrefill, M03WorkspaceScope } from "@/lib/change-control/workspace";
