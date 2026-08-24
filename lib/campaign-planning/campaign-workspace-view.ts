export type CampaignWorkspaceView = {
  creatorOpen: boolean;
  selectedCampaignId: number | null;
  editingCampaignId: number | null;
};

export const CAMPAIGN_EDITING_SECTION_ORDER = ["detail", "editor"] as const;
export const EDIT_DRAFT_RESET_LABEL = "Reset unsaved changes";

export function openCampaignCreator(view: CampaignWorkspaceView): CampaignWorkspaceView {
  return { ...view, creatorOpen: true, selectedCampaignId: null, editingCampaignId: null };
}

export function toggleCampaignCreator(view: CampaignWorkspaceView): CampaignWorkspaceView {
  return view.creatorOpen
    ? { ...view, creatorOpen: false }
    : openCampaignCreator(view);
}

export function selectCampaignDetail(view: CampaignWorkspaceView, campaignId: number): CampaignWorkspaceView {
  return { ...view, creatorOpen: false, selectedCampaignId: campaignId, editingCampaignId: null };
}

export function closeCampaignDetail(view: CampaignWorkspaceView): CampaignWorkspaceView {
  return { ...view, selectedCampaignId: null, editingCampaignId: null };
}

export function openCampaignEditor(view: CampaignWorkspaceView, campaignId: number): CampaignWorkspaceView {
  return { ...view, creatorOpen: false, selectedCampaignId: campaignId, editingCampaignId: campaignId };
}

export function toggleCampaignEditor(view: CampaignWorkspaceView, campaignId: number): CampaignWorkspaceView {
  return view.editingCampaignId === campaignId
    ? { ...view, editingCampaignId: null }
    : openCampaignEditor(view, campaignId);
}
