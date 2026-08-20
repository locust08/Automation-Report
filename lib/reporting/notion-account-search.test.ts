import test from "node:test";
import assert from "node:assert/strict";

import {
  buildNotionAccountSearchResponse,
  type NotionQueryPage,
} from "./notion";

function page(
  id: string,
  properties: NonNullable<NotionQueryPage["properties"]>
): NotionQueryPage {
  return { id, properties };
}

function text(value: string) {
  return { type: "rich_text", rich_text: [{ plain_text: value }] };
}

function title(value: string) {
  return { type: "title", title: [{ plain_text: value }] };
}

function select(value: string) {
  return { type: "select", select: { name: value } };
}

test("account search returns empty results for fewer than 2 characters", () => {
  const response = buildNotionAccountSearchResponse("a", [
    page("page-1", {
      "Account Name": title("Acme Sdn Bhd"),
      ID: text("697-252-8848"),
    }),
  ]);

  assert.deepEqual(response, { accounts: [] });
});

test("account search matches names case-insensitively and limits results to 10", () => {
  const pages = Array.from({ length: 12 }, (_, index) =>
    page(`page-${index + 1}`, {
      "Account Name": title(`Alpha Client ${index + 1}`),
      ID: text(`111-222-${String(3000 + index).padStart(4, "0")}`),
    })
  );

  const response = buildNotionAccountSearchResponse("alpha", pages);

  assert.equal(response.accounts.length, 10);
  assert.equal(response.accounts[0].accountName, "Alpha Client 1");
  assert.equal(response.accounts[9].accountName, "Alpha Client 10");
});

test("account search maps account and country aliases", () => {
  const response = buildNotionAccountSearchResponse("beta", [
    page("page-beta", {
      "Client Name": title("Beta Academy"),
      "Google Ads Account ID": text("697-252-8848"),
      Market: select("Malaysia"),
    }),
  ]);

  assert.deepEqual(response, {
    accounts: [
      {
        accountName: "Beta Academy",
        adAccountId: "697-252-8848",
        country: "MY",
        notionPageId: "page-beta",
      },
    ],
  });
});

test("account search matches by ad account ID as well as account name", () => {
  const response = buildNotionAccountSearchResponse("596-791", [
    page("page-id-search", {
      "Account Name": title("Google - Toi Toi Services Sdn Bhd"),
      ID: text("596-791-2936"),
    }),
  ]);

  assert.deepEqual(response.accounts, [
    {
      accountName: "Google - Toi Toi Services Sdn Bhd",
      adAccountId: "596-791-2936",
      country: null,
      notionPageId: "page-id-search",
    },
  ]);
});

test("account search leaves unsupported countries null and excludes raw properties", () => {
  const response = buildNotionAccountSearchResponse("gamma", [
    page("page-gamma", {
      Client: title("Gamma School"),
      "Meta Ads ID": text("act_123456789"),
      Country: select("Thailand"),
      Secret: text("notion-token-like-value"),
    }),
  ]);

  assert.deepEqual(response.accounts[0], {
    accountName: "Gamma School",
    adAccountId: "act_123456789",
    country: null,
    notionPageId: "page-gamma",
  });
  assert.equal("properties" in response.accounts[0], false);
  assert.equal(JSON.stringify(response).includes("notion-token-like-value"), false);
});

test("account search preserves TikTok platform and advertiser ID", () => {
  const response = buildNotionAccountSearchResponse("bellamy", [
    page("page-tiktok", {
      "Account Name": title("TikTok - Bellamy Malaysia"),
      ID: text("7512267932496560146"),
      Platform: select("TikTok"),
      Country: select("Malaysia"),
    }),
  ]);

  assert.deepEqual(response.accounts, [
    {
      accountName: "TikTok - Bellamy Malaysia",
      adAccountId: "7512267932496560146",
      country: "MY",
      notionPageId: "page-tiktok",
      platform: "tiktok",
    },
  ]);
});
