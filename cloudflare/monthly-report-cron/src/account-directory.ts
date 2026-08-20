export interface AdAccountDirectorySearchRow {
  notion_page_id: string;
  account_name: string;
  platform: string | null;
  country: string | null;
  ad_account_id: string;
  access_path: string | null;
}

export interface AdAccountDirectorySuggestion {
  accountName: string;
  adAccountId: string;
  accessPath: string | null;
  country: string | null;
  notionPageId: string;
  platform: "google" | "meta" | "tiktok" | null;
}

export function createAdAccountDirectorySearch(query: string): {
  sql: string;
  bindings: [string, string, string, string];
} {
  const normalizedText = normalizeDirectorySearchText(query);
  const normalizedId = query.replace(/\D/g, "");
  const nameLike = `%${escapeSqlLike(normalizedText)}%`;
  const idLike = normalizedId ? `%${escapeSqlLike(normalizedId)}%` : "__no_account_id_match__";

  return {
    sql: `WITH directory AS (
      SELECT notion_page_id, account_name, account_name_normalized, platform, country, access_path,
        CASE
          WHEN lower(COALESCE(platform, '')) LIKE '%tiktok%' THEN tiktok_account_id
          WHEN lower(COALESCE(platform, '')) LIKE '%meta%' THEN meta_account_id
          WHEN lower(COALESCE(platform, '')) LIKE '%google%' THEN google_account_id
          ELSE COALESCE(google_account_id, meta_account_id, tiktok_account_id)
        END AS ad_account_id
      FROM ad_accounts
      WHERE active = 1
    )
    SELECT notion_page_id, account_name, platform, country, ad_account_id, access_path
    FROM directory
    WHERE ad_account_id IS NOT NULL
      AND (account_name_normalized LIKE ? ESCAPE '\\' OR ad_account_id LIKE ? ESCAPE '\\')
    ORDER BY CASE
        WHEN replace(replace(lower(ad_account_id), 'act_', ''), '-', '') = ? THEN 0
        WHEN account_name_normalized = ? THEN 1
        ELSE 2
      END,
      account_name COLLATE NOCASE
    LIMIT 20`,
    bindings: [nameLike, idLike, normalizedId, normalizedText],
  };
}

export function mapAdAccountDirectorySearchRows(rows: unknown[]): AdAccountDirectorySuggestion[] {
  return rows.flatMap((value) => {
    const row = value && typeof value === "object" ? value as Partial<AdAccountDirectorySearchRow> : {};
    const accountName = String(row.account_name ?? "").trim();
    const adAccountId = String(row.ad_account_id ?? "").trim();
    const notionPageId = String(row.notion_page_id ?? "").trim();
    if (!accountName || !adAccountId || !notionPageId) return [];
    return [{
      accountName,
      adAccountId,
      accessPath: String(row.access_path ?? "").trim() || null,
      country: normalizeCountry(row.country),
      notionPageId,
      platform: normalizePlatform(row.platform),
    }];
  });
}

function normalizeDirectorySearchText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeSqlLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function normalizePlatform(value: unknown): AdAccountDirectorySuggestion["platform"] {
  const platform = String(value ?? "").toLowerCase();
  if (platform.includes("tiktok")) return "tiktok";
  if (platform.includes("meta")) return "meta";
  if (platform.includes("google")) return "google";
  return null;
}

function normalizeCountry(value: unknown): string | null {
  const country = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : null;
}

