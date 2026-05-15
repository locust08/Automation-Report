export const REPORT_CONFIRMATION_CHECKBOX = {
  monthlyOverall: "Monthly Email",
  monthlyAdvanced: "Monthly Email",
  biweeklyOverall: "Bi-Weekly",
} as const;

export type ScheduledMonthlyReportType = keyof typeof REPORT_CONFIRMATION_CHECKBOX;

export function resolveReportTypeForScheduleDay(scheduleDay: number): ScheduledMonthlyReportType {
  if (scheduleDay === 7) {
    return "monthlyOverall";
  }
  if (scheduleDay === 10) {
    return "monthlyAdvanced";
  }
  if (scheduleDay === 15) {
    return "biweeklyOverall";
  }
  return "monthlyOverall";
}

export function normalizeScheduledReportType(
  value: string | null | undefined,
  scheduleDay: number
): ScheduledMonthlyReportType {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized === "monthlyoverall" || (normalized === "overall" && scheduleDay === 7)) {
    return "monthlyOverall";
  }
  if (normalized === "monthlyadvanced" || normalized === "advanced") {
    return "monthlyAdvanced";
  }
  if (normalized === "biweeklyoverall" || (normalized === "overall" && scheduleDay === 15)) {
    return "biweeklyOverall";
  }
  return resolveReportTypeForScheduleDay(scheduleDay);
}

export function getReportConfirmationCheckboxProperty(
  reportType: ScheduledMonthlyReportType
): string {
  return REPORT_CONFIRMATION_CHECKBOX[reportType];
}
