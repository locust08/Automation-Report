import { Suspense } from "react";

import { OverallPageClient } from "@/components/reporting/overall-page-client";

export default function OverallPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#8f0018]" />}>
      <OverallPageClient />
    </Suspense>
  );
}
