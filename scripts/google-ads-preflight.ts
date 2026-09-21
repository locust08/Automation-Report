import { readFile } from "node:fs/promises";
import { googleAdsClient } from "../lib/google-ads/client";
import { getCredentials } from "../lib/reporting/env";
import { resolveGoogleManagerIdsFromNotion } from "../lib/reporting/notion";
import { GoogleAdsApiError, GoogleAdsRestClient } from "../lib/google-ads/rest-client";

// Read-only by default. A provided mutation fixture is ALWAYS sent validateOnly.
async function main() {
  const credentials = getCredentials();
  const client = googleAdsClient(credentials);
  const evidence: unknown[] = [];
  const tracedClient = new GoogleAdsRestClient({ clientId: credentials.googleClientId, clientSecret: credentials.googleClientSecret,
    refreshToken: credentials.googleRefreshToken, apiVersion: credentials.googleAdsApiVersion, project: client.project,
    onResponse: metadata => { if (metadata.requestId) evidence.push(metadata); } });
  const accessible = await tracedClient.listAccessibleCustomers();
  const requested = process.argv.slice(2).filter(arg => /^\d[\d-]+$/.test(arg)).map(id => id.replace(/-/g, ""));
  const routes = await resolveGoogleManagerIdsFromNotion({ googleAccountIds: requested, notionAccessToken: credentials.notionAccessToken,
    notionDatabaseId: credentials.notionDatabaseId, fallbackLoginCustomerId: credentials.googleLoginCustomerId });
  const checks: unknown[] = [];
  for (const id of accessible.resourceNames ?? []) {
    const cid = id.split("/").pop()!;
    const result = await tracedClient.search<{ customer?: { manager?: boolean } }>(cid, "SELECT customer.id, customer.manager FROM customer LIMIT 1");
    checks.push({ customerId: cid, accessMode: "direct", ok: true });
    if (result.results?.[0]?.customer?.manager) {
      const children = await tracedClient.search<{ customerClient?: { id?: string } }>(cid, "SELECT customer_client.id FROM customer_client WHERE customer_client.manager = FALSE AND customer_client.level = 1 LIMIT 1", { loginCustomerId: cid });
      const child = children.results?.[0]?.customerClient?.id;
      if (child) {
        await tracedClient.search(child, "SELECT customer.id FROM customer LIMIT 1", { loginCustomerId: cid });
        checks.push({ customerId: child, loginCustomerId: cid, accessMode: "manager", ok: true });
      } else checks.push({ loginCustomerId: cid, status: "no direct child available for representative read" });
    }
  }
  for (const customerId of requested) {
    const loginCustomerId = routes.loginCustomerIdByAccount[customerId] ?? null;
    await tracedClient.search(customerId, "SELECT customer.id FROM customer LIMIT 1", { loginCustomerId });
    checks.push({ customerId, loginCustomerId, ok: true });
    if (credentials.googleLoginCustomerId && loginCustomerId !== credentials.googleLoginCustomerId) {
      await tracedClient.search(customerId, "SELECT customer.id FROM customer LIMIT 1", { loginCustomerId: credentials.googleLoginCustomerId });
      checks.push({ customerId, loginCustomerId: credentials.googleLoginCustomerId, fallback: true, ok: true });
    }
  }
  const fixtureArg = process.argv.find(arg => arg.startsWith("--validate-fixture="));
  if (fixtureArg) {
    const fixtures = JSON.parse(await readFile(fixtureArg.slice("--validate-fixture=".length), "utf8")) as Array<{ customerId: string; loginCustomerId?: string | null; service: string; operations: unknown[] }>;
    for (const fixture of fixtures) {
      await tracedClient.mutate(fixture.customerId, fixture.service, fixture.operations, { loginCustomerId: fixture.loginCustomerId, validateOnly: true });
      checks.push({ service: fixture.service, customerId: fixture.customerId, validateOnly: true, ok: true });
    }
  }
  console.log(JSON.stringify({ apiVersion: client.apiVersion, project: client.project, checks, requests: evidence, administrativeInventoryRequired: true }, null, 2));
}
main().catch(error => {
  console.error(JSON.stringify(error instanceof GoogleAdsApiError ? { category: error.category, status: error.status, errorCode: error.errorCode, requestId: error.requestId, retryAt: error.retryAt, project: error.project, message: error.message } : { error: "Preflight failed; check configuration and target/fixture inputs." }));
  process.exitCode = 1;
});
