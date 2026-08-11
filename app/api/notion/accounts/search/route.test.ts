import test from "node:test";
import assert from "node:assert/strict";

import { GET } from "./route";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

test("GET returns safe account suggestions from Notion search", async () => {
  process.env.NOTION_TOKEN = "secret_test_token";
  process.env.NOTION_DATABASE_ID = "11111111111111111111111111111111";

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
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
    process.env = { ...ORIGINAL_ENV };
  }
});
