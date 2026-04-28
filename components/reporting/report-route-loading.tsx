import type { ReportLoadingKind } from "@/components/reporting/report-loading-config";
import { ReportLoadingScreen } from "@/components/reporting/report-loading-screen";

export function ReportRouteLoading({
  kind = "fallback",
}: {
  kind?: ReportLoadingKind;
}) {
  return <ReportLoadingScreen kind={kind} fullPage />;
}
