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

const REPORT_INNER_CONTAINER_CLASS = "w-full px-4 md:px-8";

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
      className="min-h-screen bg-[#f0f0f0] text-[#111]"
      data-report-capture-root="true"
    >
      <section className="relative overflow-visible bg-[url('/headerbackground.png')] bg-cover bg-center bg-no-repeat md:bg-[length:100%_100%]">
        <div className={`${REPORT_INNER_CONTAINER_CLASS} py-4 md:py-5`}>
          <div className="grid gap-3 text-white md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-x-6">
            <div className="min-w-0 space-y-3">
              <h1 className="break-words text-3xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-4xl md:text-6xl">
                {title}
              </h1>
              <nav className="flex flex-wrap items-center gap-2">
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
              <div className="flex w-full items-start md:w-auto md:justify-self-end">
                {headerDateControl}
              </div>
            ) : (
              <div className="w-full rounded-2xl bg-[#dfdfdf] px-4 py-3 text-center text-base font-semibold text-[#5f5f5f] sm:w-auto sm:px-6 sm:text-lg md:justify-self-end">
                {dateLabel}
              </div>
            )}
          </div>
          {headerBottomControl ? <div className="mt-3">{headerBottomControl}</div> : null}
        </div>
      </section>

      <section className="py-6 md:py-8">
        <div className={REPORT_INNER_CONTAINER_CLASS}>{children}</div>
      </section>

      <footer className="border-t-4 border-red-600 bg-[#f0f0f0]">
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
    </main>
  );
}

function withQuery(pathname: string, query: string): string {
  return query ? `${pathname}?${query}` : pathname;
}
