import { ReportLoadingScreen } from "@/components/reporting/report-loading-screen";

export function ReportRouteLoading() {
  return (
    <ReportLoadingScreen
      fullPage
      title="We're building your reporting view."
      message="Live data is being requested from the connected ad platforms and shaped into the same report layout you use throughout the system."
    />
  );
}
