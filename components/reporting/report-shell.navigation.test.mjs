import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./report-shell.tsx", import.meta.url), "utf8");
const labels = [...source.matchAll(/label="([^"]+)"/g)].map((match) => match[1]);

test("orders campaign planning before media planning with the expanded tooltip", () => {
  const campaignPlanning = labels.indexOf("Campaign Planning & Launch");
  const mediaPlanning = labels.indexOf("Create Media Plan");

  assert.notEqual(campaignPlanning, -1);
  assert.equal(campaignPlanning, mediaPlanning - 1);
});

test("orders change control before user management", () => {
  const changeControl = labels.indexOf("Change Control");
  const userManagement = labels.indexOf("User Management");

  assert.notEqual(changeControl, -1);
  assert.equal(changeControl, userManagement - 1);
});
