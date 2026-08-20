export const REVIEW_ACTIONS = [
  "keep",
  "exclude",
  "reject",
  "kiv",
  "request_pm_feedback",
  "request_client_feedback",
  "add_agency_risk",
] as const;

export type ReviewAction = (typeof REVIEW_ACTIONS)[number];
export type TrafficQualityItemType = "search_term" | "placement" | "url" | "account" | "other";
export type DecisionActor = { id: string; email: string; role: string };

export type ReviewInput = {
  recommendationId: string;
  accountId: string;
  itemType?: TrafficQualityItemType;
  action: ReviewAction;
  comment?: string;
  actor: DecisionActor;
};

export type M03DraftInput = {
  accountId: string;
  accountName: string;
  recommendationIds: string[];
  idempotencyKey: string;
  actor: DecisionActor;
};

type Dependencies = {
  saveDecision(input: ReviewInput): Promise<{ id: string } & ReviewInput>;
  createM03Draft(input: M03DraftInput): Promise<{ changeSetId: string; duplicate: boolean }>;
};

const AGENCY_RISK_ROLES = new Set(["tl", "approver", "admin"]);

export function createTrafficQualityDecisionService(dependencies: Dependencies) {
  return {
    async review(input: ReviewInput) {
      if (!input.recommendationId.trim() || !input.accountId.trim()) throw new Error("Recommendation and account are required.");
      if (input.action === "add_agency_risk" && (input.itemType !== "placement" || !AGENCY_RISK_ROLES.has(input.actor.role))) {
        throw new Error("Only an authorised team lead or administrator can add a placement to the agency risk list.");
      }
      return dependencies.saveDecision(input);
    },
    async createChangeSet(input: Omit<M03DraftInput, "recommendationIds" | "idempotencyKey"> & { recommendationIds: string[] }) {
      const recommendationIds = [...new Set(input.recommendationIds.map((id) => id.trim()).filter(Boolean))].sort();
      if (!recommendationIds.length) throw new Error("Select at least one exclusion recommendation.");
      const idempotencyKey = `m01:${input.accountId}:${recommendationIds.join(",")}`;
      return dependencies.createM03Draft({ ...input, recommendationIds, idempotencyKey });
    },
  };
}
