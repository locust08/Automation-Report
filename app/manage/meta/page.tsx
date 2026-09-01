import { redirect } from "next/navigation";

import { translateLegacyManagementQuery } from "@/lib/ads-management/unified-management";

export default async function LegacyMetaManagementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(translateLegacyManagementQuery("meta", await searchParams));
}
