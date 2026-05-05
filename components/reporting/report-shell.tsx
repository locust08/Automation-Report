"use client";

import Link from "next/link";
import {
  BarChart3Icon,
  EyeIcon,
  HouseIcon,
  LightbulbIcon,
  SearchIcon,
} from "lucide-react";

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
      <div className={REPORT_PAGE_FRAME_CLASS}>
        <section
          className="relative overflow-visible rounded-[2rem] bg-[url('/headerbackground.png')] bg-cover bg-center bg-no-repeat shadow-sm md:bg-[length:100%_100%]"
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
                  data-report-export-exclude="true"
                >
                  {headerDateControl}
                </div>
              ) : (
                <div
                  className="w-full rounded-2xl bg-[#dfdfdf] px-4 py-3 text-center text-base font-semibold text-[#5f5f5f] sm:w-auto sm:px-6 sm:text-lg md:justify-self-end"
                  data-report-export-exclude="true"
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

        <section className="flex-1 py-5 sm:py-6 lg:py-8">
          <div className={REPORT_INNER_CONTAINER_CLASS}>{children}</div>
        </section>

        <footer className="mt-auto border-t-4 border-red-600 bg-[#f0f0f0]">
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
      </div>
    </main>
  );
}

function withQuery(pathname: string, query: string): string {
  return query ? `${pathname}?${query}` : pathname;
}
