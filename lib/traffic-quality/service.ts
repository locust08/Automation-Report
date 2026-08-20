import { createTrafficQualityDecisionService } from "@/lib/traffic-quality/decision-service";
import { createTrafficQualityM03Draft, saveTrafficQualityDecision } from "@/lib/traffic-quality/supabase-repository";

export const trafficQualityDecisionService = createTrafficQualityDecisionService({
  saveDecision: saveTrafficQualityDecision,
  createM03Draft: createTrafficQualityM03Draft,
});
