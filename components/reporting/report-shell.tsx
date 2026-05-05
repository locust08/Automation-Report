"use client";

import Link from "next/link";
import {
  BarChart3Icon,
  CalendarDaysIcon,
  EyeIcon,
  HouseIcon,
  IdCardIcon,
  LightbulbIcon,
  SearchIcon,
} from "lucide-react";

import { useScreenshotMode } from "@/components/reporting/use-screenshot-mode";

interface ReportShellProps {
  title: string;
  dateLabel: string;
  headerDateControl?: React.ReactNode;
  headerBottomControl?: React.ReactNode;
  activeQuery?: string;
  children: React.ReactNode;
}

const REPORT_PAGE_FRAME_CLASS =
  "mx-auto flex min-h-screen w-full max-w-[1440px] flex-1 flex-col px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-6 lg:px-10 lg:pb-8 lg:pt-8";
const REPORT_INNER_CONTAINER_CLASS = "w-full px-4 sm:px-6 lg:px-8";

export function ReportShell({
  title,
  dateLabel,
  headerDateControl,
  headerBottomControl,
  activeQuery = "",
  children,
}: ReportShellProps) {
  const { screenshotMode } = useScreenshotMode();
  const hrefs = {
    home: withQuery("/", activeQuery),
    overall: withQuery("/overall", activeQuery),
    preview: withQuery("/preview", activeQuery),
    keywords: withQuery("/keywords", activeQuery),
    insights: withQuery("/insights", activeQuery),
  };

  return (
    <main
      className="flex min-h-screen flex-col bg-[#f0f0f0] text-[#111]"
      data-report-capture-root="true"
    >
      <div className={`${REPORT_PAGE_FRAME_CLASS} ${screenshotMode ? "!min-h-0 !flex-none" : ""}`}>
        {screenshotMode ? (
          <ExportReportHeader title={title} dateLabel={dateLabel} activeQuery={activeQuery} />
        ) : null}

        <section
          className={`${screenshotMode ? "hidden " : ""}relative overflow-visible rounded-[2rem] bg-[url('/headerbackground.png')] bg-cover bg-center bg-no-repeat shadow-sm md:bg-[length:100%_100%]`}
          data-report-export-header-panel="true"
        >
          <div
            className={`${REPORT_INNER_CONTAINER_CLASS} py-5 sm:py-6`}
            data-report-export-header-inner="true"
          >
            <div
              className="grid gap-4 text-white md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-x-8"
              data-report-export-header-grid="true"
            >
              <div className="min-w-0 space-y-3">
                <h1
                  className="break-words text-3xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-4xl md:text-6xl"
                  data-report-export-title="true"
                >
                  {title}
                </h1>
                <nav className="flex flex-wrap items-center gap-2" data-report-export-exclude="true">
                  <Link
                    href={hrefs.home}
                    title="Home"
                    aria-label="Open Home page"
                    className="inline-flex size-10 items-center justify-center rounded-md bg-white/10 hover:bg-white/20"
                  >
                    <HouseIcon className="size-5" />
                  </Link>
                  <Link
                    href={hrefs.overall}
                    title="Overall"
                    aria-label="Open Overall page"
                    className="inline-flex size-10 items-center justify-center rounded-md bg-white/10 hover:bg-white/20"
                  >
                    <BarChart3Icon className="size-5" />
                  </Link>
                  <Link
                    href={hrefs.preview}
                    title="Preview"
                    aria-label="Open Preview page"
                    className="inline-flex size-10 items-center justify-center rounded-md bg-white/10 hover:bg-white/20"
                  >
                    <EyeIcon className="size-5" />
                  </Link>
                  <Link
                    href={hrefs.keywords}
                    title="Top 10 Keywords"
                    aria-label="Open Top 10 Keywords page"
                    className="inline-flex size-10 items-center justify-center rounded-md bg-white/10 hover:bg-white/20"
                  >
                    <SearchIcon className="size-5" />
                  </Link>
                  <Link
                    href={hrefs.insights}
                    title="Insights"
                    aria-label="Open Insights page"
                    className="inline-flex size-10 items-center justify-center rounded-md bg-white/10 hover:bg-white/20"
                  >
                    <LightbulbIcon className="size-5" />
                  </Link>
                </nav>
              </div>
              {headerDateControl ? (
                <div
                  className="flex w-full items-start md:w-auto md:max-w-[420px] md:justify-self-end"
                  data-report-export-date-control="true"
                >
                  {headerDateControl}
                </div>
              ) : (
                <div
                  className="w-full rounded-2xl bg-[#dfdfdf] px-4 py-3 text-center text-base font-semibold text-[#5f5f5f] sm:w-auto sm:px-6 sm:text-lg md:justify-self-end"
                  data-report-export-date-control="true"
                >
                  {dateLabel}
                </div>
              )}
            </div>
            {headerBottomControl ? (
              <div className="mt-4" data-report-export-exclude="true">
                {headerBottomControl}
              </div>
            ) : null}
          </div>
        </section>

        <section className={screenshotMode ? "py-5 sm:py-6 lg:py-8" : "flex-1 py-5 sm:py-6 lg:py-8"}>
          <div className={REPORT_INNER_CONTAINER_CLASS}>{children}</div>
        </section>

        <footer className={`${screenshotMode ? "" : "mt-auto "}border-t-4 border-red-600 bg-[#f0f0f0]`}>
          <div
            className={`${REPORT_INNER_CONTAINER_CLASS} flex flex-col items-center gap-3 py-5 text-center text-base text-[#777] sm:flex-row sm:justify-between sm:text-left`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Company logo"
              width={148}
              height={32}
              className="h-8 w-auto object-contain"
              loading="eager"
              decoding="sync"
            />
            <span>LOCUS-T SDN BHD</span>
          </div>
        </footer>

        <section
          className={`${REPORT_INNER_CONTAINER_CLASS} hidden pb-8 pt-2`}
          data-report-export-only="true"
        >
          <div className="flex min-h-[220px] items-center justify-center rounded-[2rem] bg-gradient-to-br from-white via-[#fff2f2] to-[#e10600] px-6 py-14 text-center shadow-sm">
            <p className="text-[clamp(3rem,8vw,7rem)] font-extrabold leading-none tracking-normal text-[#b00014]">
              Thrive Together
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function ExportReportHeader({
  title,
  dateLabel,
  activeQuery,
}: {
  title: string;
  dateLabel: string;
  activeQuery: string;
}) {
  const accountItems = getExportAccountItems(activeQuery);

  return (
    <section className="overflow-hidden rounded-[1.5rem] bg-[url('/headerbackground.png')] bg-cover bg-center bg-no-repeat shadow-sm">
      <div className={`${REPORT_INNER_CONTAINER_CLASS} py-4 sm:py-5`}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,360px)] md:items-start">
          <div className="min-w-0">
            <h1 className="max-w-4xl break-words text-[clamp(2rem,5.4vw,4rem)] font-semibold leading-[1.04] tracking-normal text-white [overflow-wrap:anywhere]">
              {title}
            </h1>
          </div>

          <div className="grid gap-2 md:justify-self-end md:w-full">
            <div className="inline-flex min-h-11 w-full items-center gap-2 rounded-2xl bg-white/88 px-4 text-sm font-semibold text-[#5f5f5f] shadow-sm">
              <CalendarDaysIcon className="size-4 shrink-0 text-[#7a7a7a]" />
              <span className="min-w-0 break-words leading-tight">{dateLabel}</span>
            </div>
            {accountItems.length > 0 ? (
              <div className="rounded-2xl bg-white/88 p-2 shadow-sm">
                <div className="grid gap-1.5">
                  {accountItems.map((item) => (
                    <div
                      key={`${item.platform}:${item.accountId}`}
                      className="grid min-h-10 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-xl bg-white/70 px-3 text-[#1f2d3d]"
                    >
                      <IdCardIcon className="size-4 text-[#637083]" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase leading-none text-[#6b7280]">
                          {item.platform}
                        </p>
                        <p className="truncate text-sm font-semibold">{item.accountId}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function withQuery(pathname: string, query: string): string {
  return query ? `${pathname}?${query}` : pathname;
}

function getExportAccountItems(query: string): Array<{ platform: string; accountId: string }> {
  const params = new URLSearchParams(query);
  const items: Array<{ platform: string; accountId: string }> = [];

  splitAccountList(params.get("metaAccountId")).forEach((accountId) => {
    items.push({ platform: "Meta Ads", accountId });
  });

  splitAccountList(params.get("googleAccountId")).forEach((accountId) => {
    items.push({ platform: "Google Ads", accountId });
  });

  splitAccountList(params.get("accountId")).forEach((accountId) => {
    items.push({ platform: inferPlatformLabel(accountId), accountId });
  });

  return dedupeExportAccountItems(items).slice(0, 4);
}

function splitAccountList(value: string | null): string[] {
  return (value ?? "")
    .split(/[\s,;|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferPlatformLabel(accountId: string): string {
  const digitsOnly = accountId.replace(/\D/g, "");
  if (/^\d{3}-\d{3}-\d{4}$/.test(accountId) || digitsOnly.length === 10) {
    return "Google Ads";
  }

  return "Meta Ads";
}

function dedupeExportAccountItems(
  items: Array<{ platform: string; accountId: string }>
): Array<{ platform: string; accountId: string }> {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.platform}:${item.accountId.replace(/\D/g, "") || item.accountId.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
