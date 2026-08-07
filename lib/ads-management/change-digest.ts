import { Resend } from "resend";
import { resolveAdsAccountRecipients } from "@/lib/ads-management/notion-recipients";
import { listPendingChangeNotifications, markChangeNotificationsFailed, markChangeNotificationsSent } from "@/lib/ads-management/supabase";

const DEFAULT_FROM = "LOCUS-T Ads Changes <reports@locus-t.com.my>";

export async function sendDailyAdsChangeDigest() {
  const pending = await listPendingChangeNotifications();
  const groups = new Map<string, typeof pending>();
  for (const notification of pending) {
    const accountId = notification.ads_change_sets.account_id;
    groups.set(accountId, [...(groups.get(accountId) ?? []), notification]);
  }
  const results: Array<Record<string, unknown>> = [];
  for (const [accountId, notifications] of groups) {
    const ids = notifications.map((item) => item.id);
    const account = notifications[0].ads_change_sets;
    try {
      const recipients = await resolveAdsAccountRecipients(accountId, account.account_name);
      const actualRecipients = resolveRecipients(recipients.emails);
      const resend = new Resend(requiredEnv("RESEND_API_KEY"));
      const response = await resend.emails.send({
        from: process.env.ADS_CHANGE_DIGEST_FROM?.trim() || process.env.RESEND_FROM_MONTHLY_REPORT?.trim() || DEFAULT_FROM,
        to: actualRecipients,
        subject: `${process.env.ADS_CHANGE_DIGEST_TEST_RECIPIENT ? "[TEST] " : ""}Google Ads changes — ${account.account_name}`,
        html: digestHtml(account.account_name, notifications),
        text: digestText(account.account_name, notifications),
      });
      if (response.error) throw new Error(response.error.message || "Resend rejected the digest.");
      await markChangeNotificationsSent(ids, recipients.names, actualRecipients);
      results.push({ accountId, status: "sent", recipients: actualRecipients, changeCount: notifications.length, emailId: response.data?.id ?? null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown digest error.";
      await markChangeNotificationsFailed(ids, message);
      results.push({ accountId, status: "failed", error: message });
    }
  }
  return { pending: pending.length, accountDigests: groups.size, results };
}

function resolveRecipients(notionEmails: string[]) {
  const testRecipient = process.env.ADS_CHANGE_DIGEST_TEST_RECIPIENT?.trim();
  return testRecipient ? [testRecipient] : notionEmails;
}

function digestText(accountName: string, notifications: Awaited<ReturnType<typeof listPendingChangeNotifications>>) {
  return [`Daily Google Ads change summary for ${accountName}`, "", ...notifications.flatMap((item) => [`Changed by: ${item.ads_change_sets.created_by_name}`, item.message, ""])].join("\n");
}

function digestHtml(accountName: string, notifications: Awaited<ReturnType<typeof listPendingChangeNotifications>>) {
  const items = notifications.map((item) => `<li style="margin-bottom:16px"><strong>Changed by ${escapeHtml(item.ads_change_sets.created_by_name)}</strong><br>${escapeHtml(item.message)}</li>`).join("");
  return `<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.5"><h1 style="font-size:22px">Daily Google Ads change summary</h1><p><strong>${escapeHtml(accountName)}</strong></p><ul>${items}</ul><p style="color:#64748b;font-size:12px">This email was generated from verified changes recorded in the internal dashboard.</p></div>`;
}

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character); }
function requiredEnv(name: string) { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is not configured.`); return value; }
