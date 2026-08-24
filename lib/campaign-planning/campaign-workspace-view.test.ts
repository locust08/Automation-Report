import assert from "node:assert/strict";
import test from "node:test";

import {
  CAMPAIGN_EDITING_SECTION_ORDER,
  closeCampaignDetail,
  EDIT_DRAFT_RESET_LABEL,
  openCampaignEditor,
  openCampaignCreator,
  selectCampaignDetail,
  toggleCampaignEditor,
  toggleCampaignCreator,
} from "./campaign-workspace-view";

test("closing campaign details clears both launched and draft selections", () => {
  assert.deepEqual(closeCampaignDetail({ creatorOpen: false, selectedCampaignId: 17, editingCampaignId: 17 }), {
    creatorOpen: false,
    selectedCampaignId: null,
    editingCampaignId: null,
  });
});

test("editing presents campaign details before the wizard with a clear reset label", () => {
  assert.deepEqual(CAMPAIGN_EDITING_SECTION_ORDER, ["detail", "editor"]);
  assert.equal(EDIT_DRAFT_RESET_LABEL, "Reset unsaved changes");
});

test("opening the campaign creator clears the expanded campaign and editor", () => {
  assert.deepEqual(openCampaignCreator({ creatorOpen: false, selectedCampaignId: 42, editingCampaignId: 42 }), {
    creatorOpen: true,
    selectedCampaignId: null,
    editingCampaignId: null,
  });
});

test("pressing New campaign again closes the creator without selecting a campaign", () => {
  assert.deepEqual(toggleCampaignCreator({ creatorOpen: true, selectedCampaignId: null, editingCampaignId: null }), {
    creatorOpen: false,
    selectedCampaignId: null,
    editingCampaignId: null,
  });
});

test("selecting a campaign closes the creator and any open editor", () => {
  assert.deepEqual(selectCampaignDetail({ creatorOpen: true, selectedCampaignId: null, editingCampaignId: 9 }, 17), {
    creatorOpen: false,
    selectedCampaignId: 17,
    editingCampaignId: null,
  });
});

test("opening the campaign editor keeps details selected and closes the creator", () => {
  assert.deepEqual(openCampaignEditor({ creatorOpen: true, selectedCampaignId: 17, editingCampaignId: null }, 17), {
    creatorOpen: false,
    selectedCampaignId: 17,
    editingCampaignId: 17,
  });
});

test("pressing Edit details again closes only the inline editor", () => {
  assert.deepEqual(toggleCampaignEditor({ creatorOpen: false, selectedCampaignId: 17, editingCampaignId: 17 }, 17), {
    creatorOpen: false,
    selectedCampaignId: 17,
    editingCampaignId: null,
  });
});
