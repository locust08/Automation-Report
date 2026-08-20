import test from "node:test";
import assert from "node:assert/strict";

import { GET } from "./route";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

test("GET returns safe account suggestions from Notion search", async () => {
  process.env.NOTION_TOKEN = "secret_test_token";
  process.env.NOTION_DATABASE_ID = "11111111111111111111111111111111";
  delete process.env.MONTHLY_REPORT_WORKER_URL;
  delete process.env.REPORT_AUTOMATION_WORKER_URL;
  delete process.env.WORKER_API_SECRET;

  let notionQueryCount = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/databases/")) {
      return new Response(
        JSON.stringify({
          data_sources: [{ id: "data-source-1" }],
        }),
        { status: 200 }
      );
    }

    if (url.includes("/data_sources/data-source-1/query")) {
      notionQueryCount += 1;
      return new Response(
        JSON.stringify({
          results: [
            {
              id: "page-1",
              properties: {
                "Account Name": {
                  type: "title",
                  title: [{ plain_text: "Acme Academy" }],
                },
                ID: {
                  type: "rich_text",
                  rich_text: [{ plain_text: "697-252-8848" }],
                },
                Country: {
                  type: "select",
                  select: { name: "Malaysia" },
                },
              },
            },
          ],
          has_more: false,
        }),
        { status: 200 }
      );
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const response = await GET(
      new Request("https://example.test/api/notion/accounts/search?q=acme")
    );
    const payload = (await response.json()) as unknown;

    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      accounts: [
        {
          accountName: "Acme Academy",
          adAccountId: "697-252-8848",
          country: "MY",
          notionPageId: "page-1",
        },
      ],
    });
    assert.equal(JSON.stringify(payload).includes("secret_test_token"), false);

    const cachedResponse = await GET(
      new Request("https://example.test/api/notion/accounts/search?q=academy")
    );
    assert.equal(cachedResponse.status, 200);
    assert.equal(notionQueryCount, 1);
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
    process.env = { ...ORIGINAL_ENV };
  }
});

test("GET uses the Cloudflare account directory for a TikTok account", async () => {
  process.env.MONTHLY_REPORT_WORKER_URL = "https://directory.example.test";
  process.env.WORKER_API_SECRET = "worker-secret";
  let notionCalled = false;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("https://directory.example.test/ad-accounts/search")) {
      return new Response(JSON.stringify({
        success: true,
        accounts: [{
          accountName: "Bellamy TikTok SG",
          adAccountId: "7485938233214353409",
          country: "SG",
          notionPageId: "tiktok-page",
          platform: "tiktok",
          accessPath: null,
        }],
      }), { status: 200 });
    }
    notionCalled = true;
    throw new Error(`Unexpected Notion request: ${url}`);
  }) as typeof fetch;

  try {
    const response = await GET(new Request("https://example.test/api/notion/accounts/search?q=bellamy"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      accounts: [{
        accountName: "Bellamy TikTok SG",
        adAccountId: "7485938233214353409",
        country: "SG",
        notionPageId: "tiktok-page",
        platform: "tiktok",
        accessPath: null,
      }],
    });
    assert.equal(notionCalled, false);
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
    process.env = { ...ORIGINAL_ENV };
  }
});
