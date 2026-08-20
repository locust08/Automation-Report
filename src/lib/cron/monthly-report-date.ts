export interface MonthlyReportDateRange {
  startDate: string;
  endDate: string;
  reportMonthKey: string;
  reportMonthLabel: string;
}

export function resolveMonthlyReportDateRange(
  referenceDate = new Date(),
  reportType: "monthlyOverall" | "monthlyAdvanced" | "biweeklyOverall" = "monthlyOverall",
): MonthlyReportDateRange {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  if (reportType === "biweeklyOverall") {
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month, 14));
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      reportMonthKey: `${year}-${String(month + 1).padStart(2, "0")}-biweekly-01-14`,
      reportMonthLabel: `${new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(start)} 1–14, ${year}`,
    };
  }
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    reportMonthKey: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
    reportMonthLabel: new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(start),
  };
}
