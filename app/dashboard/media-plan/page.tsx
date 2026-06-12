import { Suspense } from "react";

import { MediaPlanPageClient } from "@/components/media-plan/MediaPlanPageClient";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";

export default function MediaPlanPage() {
  return (
    <Suspense fallback={<ReportRouteLoading kind="fallback" />}>
      <MediaPlanPageClient />
    </Suspense>
  );
}
