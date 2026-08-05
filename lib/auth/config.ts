export function getAuthTableUrl() {
  const explicit = process.env.SUPABASE_ADS_REPORTING_AUTH_URL?.trim();
  if (explicit) return explicit;
  const baseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  return baseUrl ? `${baseUrl}/rest/v1/ad_automation_report_users` : null;
}

export function getSupabaseBaseUrl() {
  const configured = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  return configured?.trim().replace(/\/$/, "") || null;
}

export function getSupabasePublicKey() {
  return (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim() || null;
}

export function getSupabaseServerKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const secretKey = (process.env.SUPABASE_SECRET_KEY || serviceRoleKey || process.env.SUPABASE_SECRET)?.trim();
  return { secretKey: secretKey || null, serviceRoleKey: serviceRoleKey || null };
}
