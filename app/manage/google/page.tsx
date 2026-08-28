import { redirect } from "next/navigation";

import { translateLegacyManagementQuery } from "@/lib/ads-management/unified-management";

export default async function LegacyGoogleManagementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(translateLegacyManagementQuery("google", await searchParams));
}
