import { Suspense } from "react";

import { AuctionPageClient } from "@/components/reporting/auction-page-client";

export default function AuctionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#8f0018]" />}>
      <AuctionPageClient />
    </Suspense>
  );
}
