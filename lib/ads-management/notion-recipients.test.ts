import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { resolveAdsAccountRecipients } from "@/lib/ads-management/notion-recipients";

const ORIGINAL_NOTION_TOKEN = process.env.NOTION_TOKEN;
const ORIGINAL_EMAIL_MAP = process.env.ADS_CHANGE_PIC_EMAIL_MAP;

afterEach(() => {
  mock.restoreAll();
  if (ORIGINAL_NOTION_TOKEN === undefined) delete process.env.NOTION_TOKEN;
  else process.env.NOTION_TOKEN = ORIGINAL_NOTION_TOKEN;
  if (ORIGINAL_EMAIL_MAP === undefined) delete process.env.ADS_CHANGE_PIC_EMAIL_MAP;
  else process.env.ADS_CHANGE_PIC_EMAIL_MAP = ORIGINAL_EMAIL_MAP;
});

test("resolves assigned Notion guests by their confirmed user IDs", async () => {
  process.env.NOTION_TOKEN = "test-token";
  delete process.env.ADS_CHANGE_PIC_EMAIL_MAP;

  mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/databases/2cc4fcc4f7018009a090cb6208a601d3")) {
      return jsonResponse({ data_sources: [{ id: "accounts-data-source" }] });
    }
    if (url.endsWith("/data_sources/accounts-data-source/query")) {
      return jsonResponse({
        results: [{
          properties: {
            ID: { rich_text: [{ plain_text: "985-850-7935" }] },
            "Account Name": { title: [{ plain_text: "Google - Jet Trading Sdn Bhd" }] },
            "Ads Specialist": { select: { name: "Eason" } },
            "Project Manager": { select: { name: "Kin Xian" } },
          },
        }],
        has_more: false,
      });
    }
    if (url.includes("/users?")) return jsonResponse({ results: [], has_more: false });
    if (url.endsWith("/users/2cbd872b-594c-8142-9cbe-0002bd2d6059")) {
      return jsonResponse({ name: "Eason Leong LT", person: { email: "eason@locus-t.com.my" } });
    }
    if (url.endsWith("/users/3a3d872b-594c-8138-a85a-0002ea743955")) {
      return jsonResponse({ name: "Ng Kin Xian", person: { email: "kinxian@locus-t.com.my" } });
    }
    return jsonResponse({ message: `Unexpected Notion URL: ${url}` }, 404);
  });

  const recipients = await resolveAdsAccountRecipients("985-850-7935", "Google - Jet Trading Sdn Bhd");

  assert.deepEqual(recipients.names, ["Eason", "Kin Xian"]);
  assert.deepEqual(recipients.emails, ["eason@locus-t.com.my", "kinxian@locus-t.com.my"]);
});

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
