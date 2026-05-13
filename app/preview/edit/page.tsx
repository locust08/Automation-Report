import { Suspense } from "react";

import { AdsEditDraftPageClient } from "@/components/reporting/ads-edit-draft-page-client";
import { ReportRouteLoading } from "@/components/reporting/report-route-loading";

export default function PreviewEditPage() {
  return (
    <Suspense fallback={<ReportRouteLoading kind="preview" />}>
      <AdsEditDraftPageClient />
    </Suspense>
  );
}
