import { ChangeRequestPageClient } from "@/components/ads-management/change-request-page-client";
export default async function ChangeRequestPage({ params }: { params: Promise<{ id: string }> }) { return <ChangeRequestPageClient id={(await params).id} />; }
