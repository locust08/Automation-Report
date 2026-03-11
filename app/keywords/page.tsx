import { Suspense } from "react";

import { TopKeywordsPageClient } from "@/components/reporting/top-keywords-page-client";

export default function KeywordsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#8f0018]" />}>
      <TopKeywordsPageClient />
    </Suspense>
  );
}
