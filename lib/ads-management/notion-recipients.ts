const NOTION_API_BASE_URL = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2026-03-11";
const DEFAULT_AD_ACCOUNTS_DATABASE_ID = "2cc4fcc4f7018009a090cb6208a601d3";

// DB | Ad Accounts stores PIC assignments as Select values rather than Person
// properties. Notion's user-list endpoint can omit workspace guests, so retain
// their confirmed user IDs and retrieve the current profile/email directly.
const NOTION_STAFF_USER_IDS = new Map([
  ["eason", "2cbd872b-594c-8142-9cbe-0002bd2d6059"],
  ["queenie", "3a4d872b-594c-810d-8b30-0002c7eda96d"],
  ["nina", "11dd872b-594c-814d-af78-00023a505afb"],
  ["wendy lee", "3a4d872b-594c-817a-a8e6-00023cdeb2e0"],
  ["daniel", "3a3d872b-594c-81d8-8f72-00023a8d4f47"],
  ["kin xian", "3a3d872b-594c-8138-a85a-0002ea743955"],
  ["haliza", "3a3d872b-594c-816d-a6f1-00029c9e6e0f"],
  ["jie yee", "2f6d872b-594c-81b7-91a2-000283259b71"],
  ["ky tham", "19dd872b-594c-81ac-85ac-00029fbc5af4"],
  ["alex", "3a3d872b-594c-81c7-8289-00025b5b8813"],
  ["zia wei", "2e0d872b-594c-8101-80ae-000293154fa0"],
]);

interface NotionProperty {
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  select?: { name?: string | null } | null;
}

interface NotionPage {
  properties?: Record<string, NotionProperty | undefined>;
}

interface NotionUser {
  name?: string | null;
  person?: { email?: string | null };
}

export interface AdsAccountRecipients {
  names: string[];
  emails: string[];
}

export async function resolveAdsAccountRecipients(accountId: string, accountName: string): Promise<AdsAccountRecipients> {
  const token = process.env.NOTION_TOKEN?.trim() || process.env.NOTION_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("Notion is not configured for change notifications.");
  const databaseId = (process.env.NOTION_AD_ACCOUNTS_DATABASE_ID?.trim() || DEFAULT_AD_ACCOUNTS_DATABASE_ID).replaceAll("-", "");
  const dataSource = await notion<{ data_sources?: Array<{ id?: string }> }>(`/databases/${databaseId}`, token);
  const dataSourceId = dataSource.data_sources?.[0]?.id;
  if (!dataSourceId) throw new Error("The Notion ad-account database has no queryable data source.");
  const pages = await queryAllPages(dataSourceId, token);
  const normalizedId = normalizeAccountId(accountId);
  const normalizedName = normalizeName(accountName);
  const matched = pages.find((page) => normalizeAccountId(propertyText(page, "ID")) === normalizedId)
    ?? pages.find((page) => normalizeName(propertyText(page, "Account Name")) === normalizedName);
  if (!matched) throw new Error(`No Notion PIC row matched ${accountName} (${accountId}).`);

  const names = [propertySelect(matched, "Ads Specialist"), propertySelect(matched, "Project Manager")].filter((value): value is string => Boolean(value));
  if (!names.length) throw new Error(`Notion has no Ads Specialist or Project Manager assigned to ${accountName}.`);
  const users = await listWorkspaceUsers(token);
  const configuredEmails = configuredPicEmails();
  const resolvedEmails = await Promise.all(names.map(async (name) => {
    return resolveStaffEmail(name, users)
      || await resolveConfirmedStaffEmail(name, token)
      || configuredEmails.get(normalizeName(name))
      || null;
  }));
  const emails = resolvedEmails.filter((value): value is string => Boolean(value));
  if (emails.length !== names.length) {
    const missing = names.filter((_, index) => !resolvedEmails[index]);
    throw new Error(`No staff email was found for: ${missing.join(", ")}. Add the missing address to ADS_CHANGE_PIC_EMAIL_MAP.`);
  }
  return { names: Array.from(new Set(names)), emails: Array.from(new Set(emails.map((email) => email.toLowerCase()))) };
}

async function queryAllPages(dataSourceId: string, token: string) {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const response = await notion<{ results?: NotionPage[]; has_more?: boolean; next_cursor?: string | null }>(`/data_sources/${dataSourceId}/query`, token, {
      method: "POST",
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    pages.push(...(response.results ?? []));
    cursor = response.has_more && response.next_cursor ? response.next_cursor : undefined;
  } while (cursor);
  return pages;
}

async function listWorkspaceUsers(token: string) {
  const users: NotionUser[] = [];
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ page_size: "100", ...(cursor ? { start_cursor: cursor } : {}) });
    const response = await notion<{ results?: NotionUser[]; has_more?: boolean; next_cursor?: string | null }>(`/users?${query}`, token);
    users.push(...(response.results ?? []));
    cursor = response.has_more && response.next_cursor ? response.next_cursor : undefined;
  } while (cursor);
  return users;
}

function resolveStaffEmail(picName: string, users: NotionUser[]) {
  const target = normalizeName(picName);
  const candidates = users.filter((user) => {
    const name = normalizeName(user.name ?? "");
    return name === target || name.includes(target) || target.includes(name);
  }).filter((user) => Boolean(user.person?.email));
  candidates.sort((left, right) => Number(!String(left.person?.email).endsWith("@locus-t.com.my")) - Number(!String(right.person?.email).endsWith("@locus-t.com.my")));
  return candidates[0]?.person?.email?.trim() || null;
}

async function resolveConfirmedStaffEmail(picName: string, token: string) {
  const userId = NOTION_STAFF_USER_IDS.get(normalizeName(picName));
  if (!userId) return null;
  try {
    const user = await notion<NotionUser>(`/users/${userId}`, token);
    return user.person?.email?.trim() || null;
  } catch {
    // Keep the optional environment map as the final fallback if a guest loses
    // access or the stored Notion user ID is replaced.
    return null;
  }
}

function propertyText(page: NotionPage, name: string) {
  const property = page.properties?.[name] ?? page.properties?.[`userDefined:${name}`];
  return [...(property?.title ?? []), ...(property?.rich_text ?? [])].map((item) => item.plain_text ?? "").join("").trim();
}

function propertySelect(page: NotionPage, name: string) {
  return page.properties?.[name]?.select?.name?.trim() || null;
}

function normalizeAccountId(value: string) { return value.replace(/\D/g, ""); }
function normalizeName(value: string) { return value.toLowerCase().replace(/\bgoogle\b/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }

function configuredPicEmails() {
  const result = new Map<string, string>();
  const raw = process.env.ADS_CHANGE_PIC_EMAIL_MAP?.trim();
  if (!raw) return result;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [name, email] of Object.entries(parsed)) {
      if (typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) result.set(normalizeName(name), email.trim());
    }
  } catch {
    throw new Error("ADS_CHANGE_PIC_EMAIL_MAP must be a JSON object mapping Notion PIC names to email addresses.");
  }
  return result;
}

async function notion<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${NOTION_API_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_API_VERSION, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const payload = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(`Notion PIC lookup failed (${response.status}): ${payload.message || "Unknown error"}`);
  return payload;
}
