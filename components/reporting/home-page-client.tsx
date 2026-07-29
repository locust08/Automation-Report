"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  ClipboardListIcon,
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
import {
  extractAdAccountIdFromAccountSearchInput,
  formatAccountSuggestionLabel,
} from "@/components/reporting/home-account-search";

const COUNTRIES = [
  { value: "MY", label: "🇲🇾 MY" },
  { value: "SG", label: "🇸🇬 SG" },
  { value: "AU", label: "🇦🇺 AU" },
  { value: "US", label: "🇺🇸 US" },
];

const SUPPORTED_COUNTRIES = new Set(COUNTRIES.map((country) => country.value));
const ACCOUNT_SEARCH_DEBOUNCE_MS = 300;
const RECENT_ACCOUNTS_STORAGE_KEY = "ads-reporting-recent-accounts";
const RECENT_ACCOUNTS_LIMIT = 5;

type AccountSearchSuggestion = {
  accountName: string;
  adAccountId: string;
  country: string | null;
  notionPageId: string;
};

type AccountSearchState = "idle" | "loading" | "success" | "error";
type ManualReportType = "monthly" | "advanced" | "biweekly";
type ManualSendDeliveryMode = "test" | "live" | "dryRun";

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
  testMode: boolean;
  dryRun: boolean;
  deliveryMode: ManualSendDeliveryMode;
  actualRecipientBehavior: string;
  confirmationCheckboxProperty: string;
  checkedCount: number;
  resolvedAccountCount: number;
  notionRowsFetched: number;
  targetSource: string;
  warning: string | null;
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
  const [accountName, setAccountName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [country, setCountry] = useState(initialCountry);
  const [accountSuggestions, setAccountSuggestions] = useState<AccountSearchSuggestion[]>([]);
  const [accountSearchState, setAccountSearchState] = useState<AccountSearchState>("idle");
  const [accountSearchError, setAccountSearchError] = useState<string | null>(null);
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const [highlightedAccountIndex, setHighlightedAccountIndex] = useState(-1);
  const [selectedAccountSuggestion, setSelectedAccountSuggestion] =
    useState<AccountSearchSuggestion | null>(null);
  const [recentAccounts, setRecentAccounts] = useState<AccountSearchSuggestion[]>([]);
  const accountSearchRequestId = useRef(0);
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
  const mediaPlanHref = "/dashboard/media-plan";
  const isShowingRecentAccounts = accountName.trim().length < 2;
  const visibleAccountSuggestions = isShowingRecentAccounts
    ? recentAccounts
    : accountSuggestions;

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(RECENT_ACCOUNTS_STORAGE_KEY);
      const storedAccounts = storedValue ? (JSON.parse(storedValue) as unknown) : [];
      if (Array.isArray(storedAccounts)) {
        setRecentAccounts(
          storedAccounts
            .filter(
              (account): account is AccountSearchSuggestion =>
                Boolean(
                  account &&
                    typeof account === "object" &&
                    "accountName" in account &&
                    typeof account.accountName === "string" &&
                    "adAccountId" in account &&
                    typeof account.adAccountId === "string" &&
                    "notionPageId" in account &&
                    typeof account.notionPageId === "string"
                )
            )
            .slice(0, RECENT_ACCOUNTS_LIMIT)
        );
      }
    } catch {
      window.localStorage.removeItem(RECENT_ACCOUNTS_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const query = accountName.trim();
    accountSearchRequestId.current += 1;
    const requestId = accountSearchRequestId.current;

    if (query.length < 2) {
      setAccountSuggestions([]);
      setAccountSearchState("idle");
      setAccountSearchError(null);
      setIsAccountDropdownOpen(false);
      setHighlightedAccountIndex(-1);
      return;
    }

    if (selectedAccountSuggestion && query === formatAccountSuggestionLabel(selectedAccountSuggestion)) {
      setAccountSuggestions([]);
      setAccountSearchState("idle");
      setAccountSearchError(null);
      setIsAccountDropdownOpen(false);
      setHighlightedAccountIndex(-1);
      return;
    }

    setAccountSearchState("loading");
    setAccountSearchError(null);
    setIsAccountDropdownOpen(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/notion/accounts/search?q=${encodeURIComponent(query)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );
        const payload = (await response.json().catch(() => null)) as
          | { accounts?: AccountSearchSuggestion[]; error?: string; message?: string }
          | null;

        if (controller.signal.aborted || requestId !== accountSearchRequestId.current) {
          return;
        }

        if (!response.ok || !payload) {
          throw new Error(payload?.error ?? payload?.message ?? "Unable to search Notion accounts.");
        }

        const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
        setAccountSuggestions(accounts);
        setAccountSearchState("success");
        setHighlightedAccountIndex(accounts.length > 0 ? 0 : -1);
      } catch (error) {
        if (controller.signal.aborted || requestId !== accountSearchRequestId.current) {
          return;
        }

        setAccountSuggestions([]);
        setAccountSearchState("error");
        setHighlightedAccountIndex(-1);
        setAccountSearchError(error instanceof Error ? error.message : "Unable to search Notion accounts.");
      }
    }, ACCOUNT_SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [accountName, selectedAccountSuggestion]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(overallHref);
  }

  function handleAccountNameChange(value: string) {
    setAccountName(value);
    setAccountId(extractAdAccountIdFromAccountSearchInput(value));
    setSelectedAccountSuggestion(null);
  }

  function selectAccountSuggestion(suggestion: AccountSearchSuggestion) {
    setSelectedAccountSuggestion(suggestion);
    setAccountName(formatAccountSuggestionLabel(suggestion));
    setAccountId(suggestion.adAccountId);
    if (suggestion.country && SUPPORTED_COUNTRIES.has(suggestion.country)) {
      setCountry(suggestion.country);
    }
    setRecentAccounts((current) => {
      const next = [
        suggestion,
        ...current.filter((account) => account.notionPageId !== suggestion.notionPageId),
      ].slice(0, RECENT_ACCOUNTS_LIMIT);
      try {
        window.localStorage.setItem(RECENT_ACCOUNTS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Keep recent accounts available for this session when storage is unavailable.
      }
      return next;
    });
    setIsAccountDropdownOpen(false);
    setHighlightedAccountIndex(-1);
  }

  function handleAccountNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsAccountDropdownOpen(false);
      setHighlightedAccountIndex(-1);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (visibleAccountSuggestions.length === 0) {
        return;
      }

      event.preventDefault();
      setIsAccountDropdownOpen(true);
      setHighlightedAccountIndex((current) => {
        if (event.key === "ArrowDown") {
          return current < visibleAccountSuggestions.length - 1 ? current + 1 : 0;
        }
        return current > 0 ? current - 1 : visibleAccountSuggestions.length - 1;
      });
      return;
    }

    if (event.key === "Enter" && isAccountDropdownOpen && highlightedAccountIndex >= 0) {
      const suggestion = visibleAccountSuggestions[highlightedAccountIndex];
      if (suggestion) {
        event.preventDefault();
        selectAccountSuggestion(suggestion);
      }
    }
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
        testMode: Boolean(payload.testMode),
        dryRun: Boolean(payload.dryRun),
        deliveryMode: payload.deliveryMode,
        actualRecipientBehavior: payload.actualRecipientBehavior,
        confirmationCheckboxProperty: payload.confirmationCheckboxProperty,
        checkedCount: payload.checkedCount,
        resolvedAccountCount: payload.resolvedAccountCount,
        notionRowsFetched: payload.notionRowsFetched,
        targetSource: payload.targetSource,
        warning: payload.warning ?? null,
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
          <label
            className="relative block space-y-2"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setIsAccountDropdownOpen(false);
                setHighlightedAccountIndex(-1);
              }
            }}
          >
            <span className="text-sm text-white/80">Account Name / Ad Account ID *</span>
            <Input
              value={accountName}
              onChange={(event) => handleAccountNameChange(event.target.value)}
              onFocus={() => {
                if (accountName.trim().length >= 2 || recentAccounts.length > 0) {
                  setIsAccountDropdownOpen(true);
                  setHighlightedAccountIndex(0);
                }
              }}
              onKeyDown={handleAccountNameKeyDown}
              placeholder="Search account name or ID from Notion"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={isAccountDropdownOpen}
              className="h-11 border-white/30 bg-white/10 text-white placeholder:text-white/60"
            />

            {isAccountDropdownOpen &&
            (accountName.trim().length >= 2 || recentAccounts.length > 0) ? (
              <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-white/20 bg-black/85 shadow-2xl backdrop-blur-md">
                {isShowingRecentAccounts && recentAccounts.length > 0 ? (
                  <div className="border-b border-white/10 px-3 py-2 text-xs font-medium uppercase tracking-wide text-white/60">
                    Recent accounts
                  </div>
                ) : null}

                {!isShowingRecentAccounts && accountSearchState === "loading" ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-sm text-white/75">
                    <Loader2Icon className="size-4 animate-spin" />
                    Searching Notion accounts...
                  </div>
                ) : null}

                {!isShowingRecentAccounts && accountSearchState === "error" ? (
                  <div className="px-3 py-3 text-sm text-red-100">
                    {accountSearchError ?? "Unable to search Notion accounts."}
                  </div>
                ) : null}

                {!isShowingRecentAccounts &&
                accountSearchState === "success" &&
                accountSuggestions.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-white/70">No matching account found.</div>
                ) : null}

                {visibleAccountSuggestions.length > 0 ? (
                  <ul className="max-h-72 overflow-auto py-1">
                    {visibleAccountSuggestions.map((suggestion, index) => (
                      <li key={suggestion.notionPageId}>
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectAccountSuggestion(suggestion)}
                          className={`grid w-full gap-1 px-3 py-2 text-left text-sm transition ${
                            index === highlightedAccountIndex
                              ? "bg-red-600 text-white"
                              : "text-white hover:bg-white/10"
                          }`}
                        >
                          <span className="font-semibold">{formatAccountSuggestionLabel(suggestion)}</span>
                          <span className="text-xs text-white/70">
                            {suggestion.country ? suggestion.country : "No country set"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
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

          <div className="space-y-3">
            <Button
              type="submit"
              className="h-auto min-h-16 w-full whitespace-normal bg-red-600 px-6 py-4 text-center text-base font-semibold leading-snug shadow-lg shadow-red-950/25 hover:bg-red-700"
            >
              View Monthly Performance
              <ArrowRightIcon data-icon="inline-end" />
            </Button>

            <div className="grid gap-3 sm:grid-cols-3">
              <Button
                asChild
                variant="outline"
                className="h-auto min-h-12 w-full whitespace-normal border-white/30 bg-white/10 px-4 py-3 text-center leading-snug text-white shadow-none hover:bg-white/20 hover:text-white"
              >
                <a href={previewHref}>
                  Campaign Preview
                  <EyeIcon data-icon="inline-end" />
                </a>
              </Button>

              <Button
                asChild
                variant="outline"
                className="h-auto min-h-12 w-full whitespace-normal border-white/30 bg-white/10 px-4 py-3 text-center leading-snug text-white shadow-none hover:bg-white/20 hover:text-white"
              >
                <a href={advancedHref}>
                  Open Advanced Report
                  <SlidersHorizontalIcon data-icon="inline-end" />
                </a>
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsSendModalOpen(true);
                  setSendError(null);
                }}
                disabled={isSending}
                className="h-auto min-h-12 w-full whitespace-normal border-white/30 bg-white/10 px-4 py-3 text-center leading-snug text-white shadow-none hover:bg-white/20 hover:text-white"
              >
                Send Report
                <SendIcon data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </form>

        <a
          href={mediaPlanHref}
          className="mt-5 grid gap-2 rounded-2xl border border-white/25 bg-white/10 p-4 text-white transition hover:bg-white/15"
        >
          <span className="flex items-center gap-2 text-base font-semibold">
            <ClipboardListIcon className="size-5" />
            Create Media Plan
          </span>
          <span className="text-sm leading-relaxed text-white/78">
            Generate Google Search campaign plan and create paused campaign after approval.
          </span>
        </a>

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
                  <p className="mt-2 text-sm leading-relaxed text-white/70">
                    {sendSummary.actualRecipientBehavior}
                  </p>
                  {sendSummary.failedCount > 0 && sendSummary.warning ? (
                    <div className="mt-3 rounded-md border border-red-300/25 bg-red-950/35 p-3 text-sm text-red-100">
                      {sendSummary.warning}
                    </div>
                  ) : null}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <SummaryStat label="Report" value={sendSummary.reportTypeLabel} />
                    <SummaryStat label="Mode" value={formatDeliveryMode(sendSummary.deliveryMode)} />
                    <SummaryStat label="Checked" value={String(sendSummary.totalCheckedAccounts)} />
                    <SummaryStat label="Sent" value={String(sendSummary.sentCount)} />
                    <SummaryStat label="Skipped" value={String(sendSummary.skippedCount)} />
                    <SummaryStat label="Failed" value={String(sendSummary.failedCount)} />
                    <SummaryStat label="Source" value={formatTargetSource(sendSummary.targetSource)} />
                    <SummaryStat label="Notion Rows" value={String(sendSummary.notionRowsFetched)} />
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

function formatDeliveryMode(value: ManualSendDeliveryMode): string {
  if (value === "dryRun") {
    return "Dry run";
  }
  if (value === "test") {
    return "Test delivery";
  }
  return "Live delivery";
}

function formatTargetSource(value: string): string {
  if (value === "notion") {
    return "Notion";
  }
  if (value === "configured") {
    return "Configured";
  }
  if (value === "override") {
    return "Override";
  }
  return "Unknown";
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[11px] uppercase text-white/55">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold">{value}</div>
    </div>
  );
}
