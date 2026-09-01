export const ALLOWED_EMAIL_DOMAINS = ["locus-t.com.my", "digitalbee.ai"] as const;

export function isAllowedOrganizationEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const atIndex = normalized.indexOf("@");
  if (atIndex <= 0 || atIndex === normalized.length - 1) return false;
  if (atIndex !== normalized.lastIndexOf("@")) return false;
  return ALLOWED_EMAIL_DOMAINS.includes(
    normalized.slice(atIndex + 1) as (typeof ALLOWED_EMAIL_DOMAINS)[number],
  );
}
