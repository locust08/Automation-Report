"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  EyeIcon,
  LinkIcon,
  Loader2Icon,
  SendIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COUNTRIES = [
  { value: "MY", label: "🇲🇾 MY" },
  { value: "SG", label: "🇸🇬 SG" },
  { value: "AU", label: "🇦🇺 AU" },
  { value: "US", label: "🇺🇸 US" },
];

type ManualReportType = "monthly" | "advanced" | "biweekly";

interface ManualSendDetail {
  accountName: string;
  email: string | null;
  status: "sent" | "skipped" | "failed";
  notes: string | null;
}

interface ManualSendSummary {
  message: string;
  reportTypeLabel: string;
  totalCheckedAccounts: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  details: ManualSendDetail[];
}

const MANUAL_REPORT_OPTIONS: Array<{
  value: ManualReportType;
  label: string;
  description: string;
  icon: typeof CalendarDaysIcon;
}> = [
  {
    value: "monthly",
    label: "Monthly Report",
    description: "Send the standard monthly performance report.",
    icon: CalendarDaysIcon,
  },
  {
    value: "advanced",
    label: "Advanced Report",
    description: "Send a detailed advanced performance report.",
    icon: SlidersHorizontalIcon,
  },
  {
    value: "biweekly",
    label: "Bi-weekly Report",
    description: "Send the two-week performance report.",
    icon: CalendarDaysIcon,
  },
];

export function HomePageClient() {
  const router = useRouter();

  const searchParams = useSearchParams();
  const initialCountry = useMemo(() => searchParams.get("country") ?? "MY", [searchParams]);
  const [accountId, setAccountId] = useState("");
  const [country, setCountry] = useState(initialCountry);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState<ManualReportType>("monthly");
  const [isSending, setIsSending] = useState(false);
  const [sendSummary, setSendSummary] = useState<ManualSendSummary | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const reportQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (accountId.trim()) {
      params.set("accountId", accountId.trim());
    }
    params.set("country", country);
    return params.toString();
  }, [accountId, country]);

  const overallHref = `/overall${reportQueryString ? `?${reportQueryString}` : ""}`;
  const previewHref = `/preview${reportQueryString ? `?${reportQueryString}` : ""}`;
  const advancedHref = `/advanced${reportQueryString ? `?${reportQueryString}` : ""}`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(overallHref);
  }

  async function handleManualSend() {
    setIsSending(true);
    setSendError(null);
    setSendSummary(null);

    try {
      const response = await fetch("/api/reports/manual-send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportType: selectedReportType,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (ManualSendSummary & { error?: string })
        | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? `Manual send failed with HTTP ${response.status}.`);
      }

      setSendSummary({
        message: payload.message,
        reportTypeLabel: payload.reportTypeLabel,
        totalCheckedAccounts: payload.totalCheckedAccounts,
        sentCount: payload.sentCount,
        skippedCount: payload.skippedCount,
        failedCount: payload.failedCount,
        details: Array.isArray(payload.details) ? payload.details : [],
      });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Manual send failed.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[url('/background.png')] bg-cover bg-center bg-no-repeat px-4 py-8">
      <div className="w-full max-w-4xl rounded-3xl border border-white/25 bg-black/40 p-6 text-white backdrop-blur-sm sm:p-8">
        <h1 className="text-3xl font-semibold sm:text-4xl md:text-5xl">
          Ads Reporting Dashboard
        </h1>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-white/80">Ad Account ID (required to load report data)</span>
            <Input
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              placeholder="e.g. 697-252-8848 or 283341217383189"
              className="h-11 border-white/30 bg-white/10 text-white placeholder:text-white/60"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-white/80">Country</span>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="h-11 w-full border-white/30 bg-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Button
              type="submit"
              className="h-auto min-h-12 w-full whitespace-normal bg-red-600 px-4 py-3 text-center leading-snug hover:bg-red-700"
            >
              Open Overall Performance
              <ArrowRightIcon data-icon="inline-end" />
            </Button>

            <Button
              asChild
              variant="outline"
              className="h-auto min-h-12 w-full whitespace-normal border-white/30 bg-white/10 px-4 py-3 text-center leading-snug text-white shadow-none hover:bg-white/20 hover:text-white"
            >
              <a href={previewHref}>
                Open Preview Page
                <EyeIcon data-icon="inline-end" />
              </a>
            </Button>

            <Button
              asChild
              variant="outline"
              className="h-auto min-h-12 w-full whitespace-normal border-white/30 bg-transparent px-4 py-3 text-center leading-snug text-white shadow-none hover:bg-white/10 hover:text-white"
            >
              <a href={advancedHref}>
                Open Advanced Report
                <SlidersHorizontalIcon data-icon="inline-end" />
              </a>
            </Button>

            <Button
              type="button"
              onClick={() => {
                setIsSendModalOpen(true);
                setSendError(null);
              }}
              disabled={isSending}
              className="h-auto min-h-12 w-full whitespace-normal bg-red-600 px-4 py-3 text-center leading-snug hover:bg-red-700"
            >
              Send Report
              <SendIcon data-icon="inline-end" />
            </Button>
          </div>
        </form>

        <a
          href={advancedHref}
          className="mt-5 inline-flex items-center gap-2 text-xs text-white/80 underline-offset-4 hover:underline"
        >
          <LinkIcon className="size-4" />
          Open advanced report without prefilled ID
        </a>
      </div>

      {isSendModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/25 bg-black/70 p-5 text-white shadow-2xl backdrop-blur-md sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10">
                  <SendIcon className="size-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold">Send Report Manually</h2>
                  <p className="mt-1 text-sm text-white/70">Only checked accounts in Notion will be sent.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSendModalOpen(false)}
                disabled={isSending}
                className="rounded-md p-1 text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                aria-label="Close send report modal"
              >
                <XIcon className="size-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-2">
              {MANUAL_REPORT_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = selectedReportType === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSelectedReportType(option.value)}
                    disabled={isSending}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition disabled:opacity-60 ${
                      isSelected
                        ? "border-white/35 bg-white/15"
                        : "border-white/15 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <span
                      className={`grid size-5 shrink-0 place-items-center rounded-full border ${
                        isSelected ? "border-red-500 bg-red-600" : "border-white/35"
                      }`}
                    >
                      {isSelected ? <span className="size-2 rounded-full bg-white" /> : null}
                    </span>
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-red-600/80">
                      <Icon className="size-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{option.label}</span>
                      <span className="mt-0.5 block text-sm text-white/70">{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {sendError ? (
              <div className="mt-4 rounded-lg border border-red-300/30 bg-red-950/45 p-3 text-sm text-red-100">
                {sendError}
              </div>
            ) : null}

            {sendSummary ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-lg border border-white/15 bg-white/5 p-4">
                  <p className="text-sm font-semibold">{sendSummary.message}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <SummaryStat label="Report" value={sendSummary.reportTypeLabel} />
                    <SummaryStat label="Checked" value={String(sendSummary.totalCheckedAccounts)} />
                    <SummaryStat label="Sent" value={String(sendSummary.sentCount)} />
                    <SummaryStat label="Skipped" value={String(sendSummary.skippedCount)} />
                    <SummaryStat label="Failed" value={String(sendSummary.failedCount)} />
                  </div>
                </div>

                {sendSummary.details.length > 0 ? (
                  <div className="overflow-hidden rounded-lg border border-white/15">
                    <div className="max-h-60 overflow-auto">
                      <table className="w-full min-w-[520px] border-collapse text-left text-xs">
                        <thead className="sticky top-0 bg-red-950/90 text-white">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Account</th>
                            <th className="px-3 py-2 font-semibold">Email</th>
                            <th className="px-3 py-2 font-semibold">Status</th>
                            <th className="px-3 py-2 font-semibold">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          {sendSummary.details.map((detail, index) => (
                            <tr key={`${detail.accountName}-${index}`} className="bg-white/[0.03]">
                              <td className="px-3 py-2 font-medium">{detail.accountName}</td>
                              <td className="px-3 py-2 text-white/75">{detail.email || "-"}</td>
                              <td className="px-3 py-2 capitalize">{detail.status}</td>
                              <td className="px-3 py-2 text-white/75">{detail.notes || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-3 border-t border-white/15 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSendModalOpen(false)}
                disabled={isSending}
                className="border-white/25 bg-white/10 text-white shadow-none hover:bg-white/20 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleManualSend}
                disabled={isSending}
                className="bg-red-600 hover:bg-red-700"
              >
                {isSending ? (
                  <>
                    <Loader2Icon className="animate-spin" />
                    Sending
                  </>
                ) : (
                  <>
                    Send Now
                    <SendIcon data-icon="inline-end" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[11px] uppercase text-white/55">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold">{value}</div>
    </div>
  );
}
