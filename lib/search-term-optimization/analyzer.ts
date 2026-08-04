import { randomUUID } from "node:crypto";

import type { SearchTermReviewPayload, SearchTermReviewRow } from "@/lib/reporting/types";
import { calculateSearchTermSafety } from "@/lib/search-term-optimization/scoring";
import type {
  SearchTermAccountSettings,
  SearchTermAction,
  SearchTermMismatchCategory,
  SearchTermOptimizationRecord,
} from "@/lib/search-term-optimization/types";

interface AiDecision {
  id: string;
  classification: string;
  proposedAction: SearchTermAction;
  mismatchIsClear: boolean;
  mismatchCategory: SearchTermMismatchCategory;
  ambiguous: boolean;
  clientConfirmationRequired: boolean;
  absentFromLandingPage: boolean;
  reason: string;
}

export async function analyzeSearchTerms(input: {
  report: SearchTermReviewPayload;
  settings: SearchTermAccountSettings;
  runId: string;
}): Promise<{ rows: SearchTermOptimizationRecord[]; warnings: string[] }> {
  const warnings: string[] = [];
  const contexts = await loadLandingPageContexts(input.report.rows);
  const decisions = await classifyRows(input.report.rows, contexts).catch((error) => {
    warnings.push(
      `AI classification was unavailable: ${error instanceof Error ? error.message : String(error)}. All rows were kept for review.`
    );
    return new Map<string, AiDecision>();
  });
  const now = new Date().toISOString();

  return {
    warnings,
    rows: input.report.rows.map((row) => {
      const decision = decisions.get(row.id) ?? fallbackDecision(row);
      const pageContextLoaded = Boolean(row.destinationUrl && contexts.get(row.destinationUrl));
      const safety = calculateSearchTermSafety({
        proposedAction: decision.proposedAction,
        mismatchIsClear: decision.mismatchIsClear,
        mismatchCategory: decision.mismatchCategory,
        conversions: row.conversions,
        hasPositiveKeywordOverlap: row.hasPositiveKeywordOverlap,
        absentFromLandingPage: pageContextLoaded ? decision.absentFromLandingPage : null,
        qualifiedLeads: null,
        clicks: row.clicks,
        cost: row.cost,
        ambiguous: decision.ambiguous,
        clientConfirmationRequired: decision.clientConfirmationRequired,
        automationEnabled: input.settings.automationEnabled,
        landingPageContextLoaded: pageContextLoaded,
        dataFresh: true,
        alreadyNegative: row.alreadyNegative,
        hasUnresolvedDecision: false,
        searchTerm: row.searchTerm,
        matchType: "EXACT",
      });
      return {
        ...safety,
        id: row.id || randomUUID(),
        runId: input.runId,
        accountId: row.accountId,
        companyName: input.report.companyName,
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        adGroupId: row.adGroupId,
        adGroupName: row.adGroupName,
        destinationUrl: row.destinationUrl,
        searchTerm: row.searchTerm,
        triggeringKeyword: row.triggeringKeyword,
        triggeringMatchType: row.matchType,
        impressions: row.impressions,
        clicks: row.clicks,
        cost: row.cost,
        conversions: row.conversions,
        qualifiedLeads: null,
        classification: decision.classification,
        proposedAction: decision.proposedAction,
        mismatchIsClear: decision.mismatchIsClear,
        mismatchCategory: decision.mismatchCategory,
        reason: decision.reason,
        clientConfirmationRequired: decision.clientConfirmationRequired,
        executionStatus: safety.executionEligibility ? "pending" : "not_eligible",
        verificationStatus: "not_started",
        googleResourceName: null,
        reviewedAt: now,
        executedAt: null,
        verifiedAt: null,
        undoneAt: null,
      };
    }),
  };
}

async function loadLandingPageContexts(rows: SearchTermReviewRow[]): Promise<Map<string, string>> {
  const urls = Array.from(new Set(rows.map((row) => row.destinationUrl).filter(Boolean))) as string[];
  const contexts = new Map<string, string>();
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
        if (!response.ok) return;
        const html = await response.text();
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;|&amp;|&#39;|&quot;/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 18_000);
        if (text) contexts.set(url, text);
      } catch {
        // A missing context is an explicit hard blocker in the scoring engine.
      }
    })
  );
  return contexts;
}

async function classifyRows(
  rows: SearchTermReviewRow[],
  contexts: Map<string, string>
): Promise<Map<string, AiDecision>> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const decisions = new Map<string, AiDecision>();
  const batches = chunk(rows, 40);
  for (const batch of batches) {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_SEARCH_TERM_REVIEW_MODEL?.trim() || "gpt-5.4-mini",
        reasoning: { effort: "medium" },
        input: [
          {
            role: "system",
            content:
              "Review Google Ads search terms against their landing-page evidence. Use negative exact only for a clear mismatch with zero conversions; add exact only for a relevant converting term; use special review for a converting mismatch; otherwise no action. Return JSON only.",
          },
          {
            role: "user",
            content: JSON.stringify(
              batch.map((row) => ({
                id: row.id,
                searchTerm: row.searchTerm,
                conversions: row.conversions,
                campaign: row.campaignName,
                adGroup: row.adGroupName,
                destinationUrl: row.destinationUrl,
                landingPageEvidence: row.destinationUrl ? contexts.get(row.destinationUrl) ?? null : null,
              }))
            ),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "search_term_decisions",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["decisions"],
              properties: {
                decisions: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "classification", "proposedAction", "mismatchIsClear", "mismatchCategory", "ambiguous", "clientConfirmationRequired", "absentFromLandingPage", "reason"],
                    properties: {
                      id: { type: "string" },
                      classification: { type: "string" },
                      proposedAction: { type: "string", enum: ["negative exact", "add exact", "special review needed", "no action"] },
                      mismatchIsClear: { type: "boolean" },
                      mismatchCategory: { type: "string", enum: ["none", "competitor_brand", "wrong_product", "wrong_service", "portal_navigation", "stable_irrelevant_intent", "unsupported_location", "informational_research", "other"] },
                      ambiguous: { type: "boolean" },
                      clientConfirmationRequired: { type: "boolean" },
                      absentFromLandingPage: { type: "boolean" },
                      reason: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) throw new Error(extractOpenAiError(payload) || `OpenAI returned ${response.status}`);
    const text = extractOutputText(payload);
    const parsed = JSON.parse(text) as { decisions: AiDecision[] };
    parsed.decisions.forEach((decision) => decisions.set(decision.id, decision));
  }
  return decisions;
}

function fallbackDecision(row: SearchTermReviewRow): AiDecision {
  return {
    id: row.id,
    classification: "Unclear or human review required",
    proposedAction: "no action",
    mismatchIsClear: false,
    mismatchCategory: "none",
    ambiguous: true,
    clientConfirmationRequired: false,
    absentFromLandingPage: false,
    reason: "AI decision was unavailable; retained without automatic action.",
  };
}

function extractOutputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown[] }).content) ? (item as { content: unknown[] }).content : [];
    for (const block of content) {
      if (block && typeof block === "object" && typeof (block as { text?: unknown }).text === "string") {
        return (block as { text: string }).text;
      }
    }
  }
  throw new Error("OpenAI response did not contain structured output");
}

function extractOpenAiError(payload: Record<string, unknown>): string | null {
  const error = payload.error;
  return error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
    ? (error as { message: string }).message
    : null;
}

function chunk<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}
