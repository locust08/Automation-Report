export function getDefaultMetaImportAccountId(): string {
  return (process.env.META_IMPORT_DEFAULT_ACCOUNT_ID?.trim() || "340568485376201")
    .replace(/^act_/i, "")
    .replace(/\D/g, "");
}
