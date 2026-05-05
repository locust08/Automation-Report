import { Suspense } from "react";

import { PreviewPageClient } from "@/components/reporting/preview-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";

export default function PreviewPage() {
  return (
    <Suspense fallback={<ReportRouteLoading kind="preview" />}>
      <PreviewPageClient />
    </Suspense>
  );
}
