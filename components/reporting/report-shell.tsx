"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3Icon,
  CalendarDaysIcon,
  GitCompareArrowsIcon,
  ClipboardListIcon,
  EyeIcon,
  HouseIcon,
  IdCardIcon,
  ListChecksIcon,
  LogOutIcon,
  MegaphoneIcon,
  SearchCheckIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  UploadCloudIcon,
  UsersRoundIcon,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useScreenshotMode } from "@/components/reporting/use-screenshot-mode";
import { isAdminRole, type AuthRole } from "@/lib/auth/roles";
import { buildReportContextQuery } from "@/lib/reporting/report-navigation";

interface ReportShellProps {
  title: string;
  dateLabel: string;
  headerDateControl?: React.ReactNode;
  headerControlLayout?: "default" | "wide";
  headerBottomControl?: React.ReactNode;
  activeQuery?: string;
  reportReady?: boolean;
  suppressExportHeader?: boolean;
  initialRole?: AuthRole;
  children: React.ReactNode;
}

const REPORT_PAGE_FRAME_CLASS =
  "mx-auto flex min-h-screen w-full max-w-[1440px] flex-1 flex-col px-3 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-6 lg:px-10 lg:pb-8 lg:pt-8";
const REPORT_INNER_CONTAINER_CLASS = "w-full px-3 sm:px-6 lg:px-8";

export function ReportShell({
  title,
  dateLabel,
  headerDateControl,
  headerControlLayout = "default",
  headerBottomControl,
  activeQuery = "",
  reportReady = false,
  suppressExportHeader = false,
  initialRole,
  children,
}: ReportShellProps) {
  const { screenshotMode } = useScreenshotMode();
  const pathname = usePathname();
  const [currentRole, setCurrentRole] = useState<string | null>(initialRole ?? null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ user?: { role?: string } }> : null)
      .then((payload) => setCurrentRole(payload?.user?.role ?? null))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const isAdmin = isAdminRole(currentRole);
  const reportContextQuery = buildReportContextQuery(activeQuery);
  const hrefs = {
    home: "/",
    overall: withQuery("/overall", reportContextQuery),
    preview: withQuery("/preview", reportContextQuery),
    advanced: withQuery("/advanced", reportContextQuery),
    mediaPlan: withQuery("/dashboard/media-plan", reportContextQuery),
    metaImport: "/meta-import",
    billing: "/billing",
    googleOptimization: "/google-optimization",
    googleManagement: "/manage/google",
    userManagement: "/user-management",
    optimizationScheduling: "/optimization-scheduling",
    campaigns: "/campaigns",
    changeControl: "/change-control",
    settings: "/settings",
  };

  return (
    <main
      className="flex min-h-screen flex-col overflow-x-clip bg-[#f0f0f0] text-[#111]"
      data-report-capture-root="true"
      data-report-ready={reportReady ? "true" : undefined}
    >
      <div className={`${REPORT_PAGE_FRAME_CLASS} ${screenshotMode ? "!min-h-0 !flex-none" : ""}`}>
        {screenshotMode && !suppressExportHeader ? (
          <ReportExportHeader title={title} dateLabel={dateLabel} activeQuery={activeQuery} />
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
              className={
                headerControlLayout === "wide"
                  ? "grid gap-5 text-white lg:grid-cols-[minmax(430px,0.8fr)_minmax(0,1.2fr)] lg:items-start lg:gap-x-8"
                  : "grid gap-4 text-white md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-x-8"
              }
              data-report-export-header-grid="true"
            >
              <div className="min-w-0 space-y-3">
                <h1
                  className={`${headerControlLayout === "wide" ? "lg:text-4xl lg:[overflow-wrap:normal]" : "md:text-6xl"} break-words text-3xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-4xl`}
                  data-report-export-title="true"
                >
                  {title}
                </h1>
                <TooltipProvider delayDuration={200}>
                  <nav
                    className="flex flex-wrap items-center gap-2"
                    data-report-export-exclude="true"
                    aria-label="Report navigation"
                  >
                    <ReportNavLink href={hrefs.home} label="Home" active={pathname === "/"}>
                      <HouseIcon className="size-5" />
                    </ReportNavLink>
                    <ReportNavLink
                      href={hrefs.overall}
                      label="Monthly Performance"
                      active={pathname === "/overall"}
                    >
                      <BarChart3Icon className="size-5" />
                    </ReportNavLink>
                    <ReportNavLink
                      href={hrefs.preview}
                      label="Campaign Preview"
                      active={pathname === "/preview"}
                    >
                      <EyeIcon className="size-5" />
                    </ReportNavLink>
                    <ReportNavLink
                      href={hrefs.advanced}
                      label="Advanced Report"
                      active={pathname === "/advanced"}
                    >
                      <SparklesIcon className="size-5" />
                    </ReportNavLink>
                    <ReportNavLink
                      href={hrefs.campaigns}
                      label="Campaign Planning & Launch"
                      active={pathname === "/campaigns"}
                    >
                      <MegaphoneIcon className="size-5" />
                    </ReportNavLink>
                    <ReportNavLink
                      href={hrefs.mediaPlan}
                      label="Create Media Plan"
                      active={pathname === "/dashboard/media-plan"}
                    >
                      <ClipboardListIcon className="size-5" />
                    </ReportNavLink>
                    <ReportNavLink
                      href={hrefs.metaImport}
                      label="Import Meta CSV"
                      active={pathname === "/meta-import"}
                    >
                      <UploadCloudIcon className="size-5" />
                    </ReportNavLink>
                    <ReportNavLink
                      href={hrefs.billing}
                      label="Billing Operations"
                      active={pathname === "/billing"}
                    >
                      <ListChecksIcon className="size-5" />
                    </ReportNavLink>
                    <ReportNavLink
                      href={hrefs.googleManagement}
                      label="Google Ads Management"
                      active={pathname.startsWith("/manage/google")}
                    >
                      <SlidersHorizontalIcon className="size-5" />
                    </ReportNavLink>
                    {isAdmin ? <>
                      <ReportNavLink
                        href={hrefs.googleOptimization}
                        label="Google Optimization"
                        active={pathname === "/google-optimization" || pathname === "/search-term-optimization" || pathname === "/placement-optimization"}
                      >
                        <SearchCheckIcon className="size-5" />
                      </ReportNavLink>
                      <ReportNavLink
                        href={hrefs.optimizationScheduling}
                        label="Optimization Scheduling"
                        active={pathname === "/optimization-scheduling"}
                      >
                        <CalendarDaysIcon className="size-5" />
                      </ReportNavLink>
                      <ReportNavLink
                        href={hrefs.changeControl}
                        label="Change Control"
                        active={pathname === "/change-control"}
                      >
                        <GitCompareArrowsIcon className="size-5" />
                      </ReportNavLink>
                      <ReportNavLink
                        href={hrefs.userManagement}
                        label="User Management"
                        active={pathname === "/user-management"}
                      >
                        <UsersRoundIcon className="size-5" />
                      </ReportNavLink>
                      <ReportNavLink
                        href={hrefs.settings}
                        label="Workflow Settings"
                        active={pathname === "/settings"}
                      >
                        <SettingsIcon className="size-5" />
                      </ReportNavLink>
                    </> : null}
                    <ReportLogoutButton />
                  </nav>
                </TooltipProvider>
              </div>
              {headerDateControl ? (
                <div
                  className={
                    headerControlLayout === "wide"
                      ? "flex w-full items-start lg:w-full lg:max-w-[920px] lg:justify-self-end"
                      : "flex w-full items-start md:w-auto md:max-w-[420px] md:justify-self-end"
                  }
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

        <ReportFooter screenshotMode={screenshotMode} />

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

function ReportNavLink({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={href}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={`inline-flex size-10 items-center justify-center rounded-md outline-none transition focus-visible:ring-2 focus-visible:ring-white/90 focus-visible:ring-offset-2 focus-visible:ring-offset-red-900 ${
            active
              ? "bg-white text-[#9f0712] shadow-md hover:bg-white"
              : "bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          {children}
        </Link>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={8}
        className="border border-white/15 bg-[#211114] px-3 py-2 text-sm font-medium text-white shadow-xl"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function ReportLogoutButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            aria-label="Logout"
            className="inline-flex size-10 items-center justify-center rounded-md bg-white/10 text-white outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/90 focus-visible:ring-offset-2 focus-visible:ring-offset-red-900"
          >
            <LogOutIcon className="size-5" />
          </button>
        </form>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={8}
        className="border border-white/15 bg-[#211114] px-3 py-2 text-sm font-medium text-white shadow-xl"
      >
        Logout
      </TooltipContent>
    </Tooltip>
  );
}

export function ReportExportHeader({
  title,
  dateLabel,
  activeQuery,
  exportMarker = true,
}: {
  title: string;
  dateLabel: string;
  activeQuery: string;
  exportMarker?: boolean;
}) {
  const accountItems = getExportAccountItems(activeQuery);

  return (
    <section
      className="overflow-hidden rounded-[1.5rem] bg-[url('/headerbackground.png')] bg-cover bg-center bg-no-repeat shadow-sm"
      data-report-export-header-section={exportMarker ? "true" : undefined}
    >
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

export function ReportFooter({
  screenshotMode,
  exportMarker = true,
}: {
  screenshotMode: boolean;
  exportMarker?: boolean;
}) {
  return (
    <footer
      className={`${screenshotMode ? "" : "mt-auto "}border-t-4 border-red-600 bg-[#f0f0f0]`}
      data-report-export-footer={exportMarker ? "true" : undefined}
    >
      <div
        className={`${REPORT_INNER_CONTAINER_CLASS} flex flex-col items-center gap-3 py-5 text-center text-base text-[#777] sm:flex-row sm:justify-between sm:text-left`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/locus-t-logo-25.png"
          alt="LOCUS-T logo"
          width={220}
          height={40}
          className="h-10 w-auto max-w-[260px] object-contain"
          loading="eager"
          decoding="sync"
        />
        <span>LOCUS-T SDN BHD</span>
      </div>
    </footer>
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
  splitAccountList(params.get("tiktokAccountId")).forEach((accountId) => {
    items.push({ platform: "TikTok Ads", accountId });
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
