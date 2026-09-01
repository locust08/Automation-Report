import { redirect } from "next/navigation";
export default async function ChangeRequestPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/change-control?legacy=google&legacy_request_id=${encodeURIComponent((await params).id)}`);
}
