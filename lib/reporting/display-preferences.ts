export const REPORT_DISPLAY_DEFAULTS = { overall: true, campaign: true, advanced: true };
export type ReportDisplayPreferences = typeof REPORT_DISPLAY_DEFAULTS;
export type ReportDisplayPage = keyof ReportDisplayPreferences;
export function reportDisplayPage(pathname: string): ReportDisplayPage | null {
  if (pathname === "/overall") return "overall";
  if (pathname.startsWith("/campaign/")) return "campaign";
  if (pathname === "/advanced") return "advanced";
  return null;
}
