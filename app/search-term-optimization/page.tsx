import { redirect } from "next/navigation";

export default async function SearchTermOptimizationRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  if (!params.has("googleAccountId") && params.has("accountId")) params.set("googleAccountId", params.get("accountId")!);
  params.set("tab", "search-terms");
  redirect(`/google-optimization?${params.toString()}`);
}
