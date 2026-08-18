export const ALLOWED_EMAIL_DOMAINS = ["locus-t.com.my", "digitalbee.ai"] as const;
export const ALLOWED_EMAIL_ADDRESSES = ["locust.crm08@gmail.com"] as const;

export function isAllowedOrganizationEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (ALLOWED_EMAIL_ADDRESSES.includes(normalized as (typeof ALLOWED_EMAIL_ADDRESSES)[number])) {
    return true;
  }
  const atIndex = normalized.indexOf("@");
  if (atIndex <= 0 || atIndex === normalized.length - 1) return false;
  if (atIndex !== normalized.lastIndexOf("@")) return false;
  return ALLOWED_EMAIL_DOMAINS.includes(
    normalized.slice(atIndex + 1) as (typeof ALLOWED_EMAIL_DOMAINS)[number],
  );
}
