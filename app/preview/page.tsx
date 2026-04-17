import { Suspense } from "react";

import { PreviewPageClient } from "@/components/reporting/preview-page-client";

export default function PreviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#8f0018]" />}>
      <PreviewPageClient />
    </Suspense>
  );
}
