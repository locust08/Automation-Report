import assert from "node:assert/strict";
import test from "node:test";
import * as unifiedManagement from "@/lib/ads-management/unified-management";

import {
  MANAGEMENT_VIEWS,
  buildCanonicalManagementQuery,
  getManagementMetricVocabulary,
  mergeManagementRecentAccounts,
  managementSelectionKey,
  resolveRefreshedManagementAccountName,
  resolveManagementDisplayName,
  resolveManagementAccount,
  translateLegacyManagementQuery,
} from "@/lib/ads-management/unified-management";

test("management refresh replaces stale view content with a loading skeleton", () => {
  const shouldShowManagementLoadingSkeleton = (
    unifiedManagement as typeof unifiedManagement & {
      shouldShowManagementLoadingSkeleton?: (input: {
        loading: boolean;
        hasExistingData: boolean;
      }) => boolean;
    }
  ).shouldShowManagementLoadingSkeleton;

  assert.equal(typeof shouldShowManagementLoadingSkeleton, "function");
  assert.equal(
    shouldShowManagementLoadingSkeleton?.({ loading: true, hasExistingData: true }),
    true,
  );
  assert.equal(
    shouldShowManagementLoadingSkeleton?.({ loading: false, hasExistingData: true }),
    false,
  );
});

test("provider refresh preserves a selected TikTok directory account name", () => {
  assert.equal(
    resolveRefreshedManagementAccountName({
      platform: "tiktok",
      accountId: "7512267932496560146",
      selectedName: "Tiktok - BELLAMY'S ORGANIC (Malaysia)",
      providerName: "Bellamy's Organic Malaysia",
    }),
    "Tiktok - BELLAMY'S ORGANIC (Malaysia)",
  );
});

test("canonical directory names are not replaced by generic provider fallbacks", () => {
  assert.equal(
    resolveManagementDisplayName({
      platform: "meta",
      accountId: "132472815649146",
      canonicalName: "Facebook - Veton Office System Sdn Bhd",
      providerName: "Account 132472815649146",
    }),
    "Facebook - Veton Office System Sdn Bhd",
  );
  assert.equal(
    resolveManagementDisplayName({
      platform: "meta",
      accountId: "132472815649146",
      canonicalName: "Meta account 132472815649146",
      providerName: "Veton Office",
    }),
    "Veton Office",
  );
});

test("directory platform is authoritative over conflicting account-name evidence", () => {
  assert.deepEqual(
    resolveManagementAccount({
      directoryPlatform: "tiktok",
      accountId: "7512267932496560146",
      accountName: "Google - Bellamy's Organic Malaysia",
    }),
    {
      platform: "tiktok",
      accountId: "7512267932496560146",
      accountName: "Google - Bellamy's Organic Malaysia",
    },
  );
});

test("account-name prefixes resolve the provider when directory metadata is absent", () => {
  assert.equal(
    resolveManagementAccount({ accountId: "132472815649146", accountName: "Facebook - Veton Office" })?.platform,
    "meta",
  );
  assert.equal(
    resolveManagementAccount({ accountId: "4759796142", accountName: "Google - Alfa Pinjaman" })?.platform,
    "google",
  );
  assert.equal(
    resolveManagementAccount({ accountId: "7512267932496560146", accountName: "TikTok - Bellamy's" })?.platform,
    "tiktok",
  );
});

test("explicit direct-entry prefixes resolve ambiguous provider IDs", () => {
  assert.deepEqual(resolveManagementAccount({ directInput: "meta:132472815649146" }), {
    platform: "meta",
    accountId: "132472815649146",
    accountName: "Meta account 132472815649146",
  });
  assert.deepEqual(resolveManagementAccount({ directInput: "google:4759796142" }), {
    platform: "google",
    accountId: "4759796142",
    accountName: "Google account 4759796142",
  });
  assert.deepEqual(resolveManagementAccount({ directInput: "tiktok:7512267932496560146" }), {
    platform: "tiktok",
    accountId: "7512267932496560146",
    accountName: "TikTok account 7512267932496560146",
  });
});

test("only unambiguous provider formats resolve without a prefix", () => {
  assert.equal(resolveManagementAccount({ directInput: "act_132472815649146" })?.platform, "meta");
  assert.deepEqual(resolveManagementAccount({ directInput: "475-979-6142" }), {
    platform: "google",
    accountId: "4759796142",
    accountName: "Google account 4759796142",
  });
  assert.equal(resolveManagementAccount({ directInput: "132472815649146" }), null);
  assert.equal(resolveManagementAccount({ directInput: "4759796142" }), null);
});

test("canonical route resolution recognizes unambiguous accountId formats without platform", () => {
  assert.equal(resolveManagementAccount({ accountId: "act_132472815649146" })?.platform, "meta");
  assert.equal(resolveManagementAccount({ accountId: "475-979-6142" })?.platform, "google");
  assert.equal(resolveManagementAccount({ accountId: "132472815649146" }), null);
});

test("canonical management query preserves account, date, and view state", () => {
  assert.equal(
    buildCanonicalManagementQuery({
      platform: "meta",
      accountId: "act_132472815649146",
      accountName: "Facebook - Veton Office",
      startDate: "2026-01-01",
      endDate: "2026-06-30",
      view: "ad_groups",
    }),
    "platform=meta&accountId=132472815649146&accountName=Facebook+-+Veton+Office&startDate=2026-01-01&endDate=2026-06-30&view=ad_groups",
  );
});

test("legacy management queries translate provider-specific IDs and view names", () => {
  assert.equal(
    translateLegacyManagementQuery("meta", {
      metaAccountId: "act_132472815649146",
      accountName: "Facebook - Veton Office",
      startDate: "2026-01-01",
      endDate: "2026-06-30",
      view: "ad_sets",
    }),
    "/manage?platform=meta&accountId=132472815649146&accountName=Facebook+-+Veton+Office&startDate=2026-01-01&endDate=2026-06-30&view=ad_groups",
  );
  assert.equal(
    translateLegacyManagementQuery("tiktok", {
      tiktokAccountId: "7512267932496560146",
      view: "change_requests",
    }),
    "/manage?platform=tiktok&accountId=7512267932496560146&accountName=TikTok+account+7512267932496560146&view=change_requests",
  );
});

test("providers use accurate management metric labels", () => {
  assert.deepEqual(MANAGEMENT_VIEWS, ["campaigns", "ad_groups", "ads", "recommendations", "change_requests"]);
  assert.equal(getManagementMetricVocabulary("meta").results, "Results");
  assert.equal(getManagementMetricVocabulary("meta").costPerResult, "Cost / result");
  assert.equal(getManagementMetricVocabulary("google").results, "Conversions");
  assert.equal(getManagementMetricVocabulary("google").costPerResult, "Cost / conversion");
  assert.equal(getManagementMetricVocabulary("meta").activity, "Clicks");
  assert.equal(getManagementMetricVocabulary("google").activity, "Clicks");
  assert.equal(getManagementMetricVocabulary("tiktok").activity, "Engagements");
});

test("selection keys isolate late responses across provider or account switches", () => {
  assert.equal(
    managementSelectionKey({ platform: "meta", accountId: "123", accountName: "One" }),
    "meta:123",
  );
  assert.notEqual(
    managementSelectionKey({ platform: "meta", accountId: "123", accountName: "One" }),
    managementSelectionKey({ platform: "google", accountId: "123", accountName: "One" }),
  );
});

test("legacy recent-account caches merge into one deduplicated cross-platform list", () => {
  assert.deepEqual(
    mergeManagementRecentAccounts([
      { accountName: "Facebook - Veton Office", adAccountId: "act_132472815649146", platform: null },
      { accountName: "Google - Alfa Pinjaman", adAccountId: "4759796142", platform: "google" },
      { accountName: "Facebook - Veton Office", adAccountId: "132472815649146", platform: "meta" },
      { accountName: "Unknown account", adAccountId: "123456789012345", platform: null },
    ]),
    [
      { platform: "meta", accountId: "132472815649146", accountName: "Facebook - Veton Office" },
      { platform: "google", accountId: "4759796142", accountName: "Google - Alfa Pinjaman" },
    ],
  );
});
