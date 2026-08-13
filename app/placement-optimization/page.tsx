import { redirect } from "next/navigation";

export default async function PlacementOptimizationRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  if (!params.has("googleAccountId") && params.has("accountId")) params.set("googleAccountId", params.get("accountId")!);
  params.set("tab", "placements");
  redirect(`/google-optimization?${params.toString()}`);
}
