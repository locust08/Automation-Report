import { Suspense } from "react";
import { GoogleManagementPageClient } from "@/components/ads-management/google-management-page-client";
export default function GoogleManagementPage() { return <Suspense fallback={<div className="p-8">Loading Google Ads management…</div>}><GoogleManagementPageClient /></Suspense>; }
