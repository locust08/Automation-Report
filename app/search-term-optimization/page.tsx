import { Suspense } from "react";

import { SearchTermOptimizationPageClient } from "@/components/search-term-optimization/search-term-optimization-page-client";

export default function SearchTermOptimizationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f0f0f0] p-8">Loading optimization dashboard…</div>}>
      <SearchTermOptimizationPageClient />
    </Suspense>
  );
}
