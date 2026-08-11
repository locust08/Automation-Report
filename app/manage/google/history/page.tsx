import { Suspense } from "react";
import { HistoryPageClient } from "@/components/ads-management/history-page-client";
export default function HistoryPage() { return <Suspense fallback={<div className="p-8">Loading history…</div>}><HistoryPageClient /></Suspense>; }
