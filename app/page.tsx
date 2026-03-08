import { Suspense } from "react";

import { HomePageClient } from "@/components/reporting/home-page-client";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#8f0018]" />}>
      <HomePageClient />
    </Suspense>
  );
}
