import { redirect } from "next/navigation";
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ accountId?: string }> }) {
  const accountId = (await searchParams).accountId?.trim();
  redirect(`/change-control?legacy=google${accountId ? `&legacy_account_id=${encodeURIComponent(accountId)}` : ""}`);
}
