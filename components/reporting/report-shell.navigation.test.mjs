import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./report-shell.tsx", import.meta.url), "utf8");
const labels = [...source.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]);

test("groups navigation into labeled dropdown sections", () => {
  assert.match(source, /DropdownMenuTrigger/);
  assert.ok(labels.includes("Reports"));
  assert.ok(labels.includes("Planning & Operations"));
  assert.ok(labels.includes("Google"));
  assert.ok(labels.includes("Admin"));
  assert.equal(source.includes("TooltipProvider"), false);
});

test("orders campaign planning before media planning", () => {
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

test("uses large visible labels for home, navigation, and logout", () => {
  assert.match(source, />Home</);
  assert.match(source, />Navigation</);
  assert.match(source, />Logout</);
  assert.match(source, /min-h-11/);
});

test("lays navigation sections out horizontally on larger screens", () => {
  assert.match(source, /w-\[min\(68rem,calc\(100vw-2rem\)\)\]/);
  assert.match(source, /md:grid-cols-2/);
  assert.match(source, /lg:grid-cols-4/);
  assert.match(source, /space-y-1\.5/);
});

test("left-aligns navigation and anchors the panel beneath its folder tab", () => {
  assert.match(source, /justify-start/);
  assert.match(source, /align="start"/);
  assert.match(source, /alignOffset=\{-96\}/);
  assert.match(source, /sideOffset=\{-1\}/);
  assert.match(source, /data-\[state=open\]:rounded-b-none/);
  assert.match(source, /data-\[state=open\]:border-b-0/);
});
