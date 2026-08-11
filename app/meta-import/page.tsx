import { MetaImportPageClient } from "@/components/meta-import/meta-import-page-client";
import { getDefaultMetaImportAccountId } from "@/lib/meta-import/config";

export default async function MetaImportPage() {
  return <MetaImportPageClient defaultAccountId={getDefaultMetaImportAccountId()} />;
}
