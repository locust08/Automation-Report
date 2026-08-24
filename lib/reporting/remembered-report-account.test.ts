import assert from "node:assert/strict";
import test from "node:test";

import {
  clearRememberedReportAccount,
  readRememberedReportAccount,
  writeRememberedReportAccount,
} from "./remembered-report-account";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

test("stores, reads, and clears the last selected report account", () => {
  const storage = new MemoryStorage();
  const account = {
    accountId: "1234567890",
    platform: "google" as const,
    displayName: "Demo Google Ads",
    country: "MY",
  };

  writeRememberedReportAccount(storage, account);
  assert.deepEqual(readRememberedReportAccount(storage), account);

  clearRememberedReportAccount(storage);
  assert.equal(readRememberedReportAccount(storage), null);
});

test("ignores malformed remembered account data", () => {
  const storage = new MemoryStorage();
  storage.setItem("ads-reporting-last-account", "{not-json");
  assert.equal(readRememberedReportAccount(storage), null);

  storage.setItem("ads-reporting-last-account", JSON.stringify({ accountId: "", platform: "google" }));
  assert.equal(readRememberedReportAccount(storage), null);
});
