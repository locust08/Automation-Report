import type { CampaignPlan } from "./domain";

export type CampaignPlanEdit = {
  campaign_name: string;
  objective: string;
  start_date: string;
  end_date: string;
  allocated_budget: number;
  destination: string;
};

export function applyCampaignPlanEdit(plan: CampaignPlan, edit: CampaignPlanEdit): CampaignPlan {
  const days = inclusiveDays(edit.start_date, edit.end_date);
  return {
    ...plan,
    ...edit,
    increment_amount: edit.allocated_budget - plan.allocated_budget,
    daily_budget: edit.allocated_budget / days,
    projected_total: edit.allocated_budget,
  } as CampaignPlan;
}

function inclusiveDays(start: string, end: string) {
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  return Math.max(1, Math.round((endTime - startTime) / 86_400_000) + 1);
}
