import Image from "next/image";
import Link from "next/link";
import { BarChart3Icon, LayoutGridIcon, LineChartIcon } from "lucide-react";

interface ReportShellProps {
  title: string;
  dateLabel: string;
  headerDateControl?: React.ReactNode;
  headerBottomControl?: React.ReactNode;
  children: React.ReactNode;
}

export function ReportShell({
  title,
  dateLabel,
  headerDateControl,
  headerBottomControl,
  children,
}: ReportShellProps) {
  return (
    <main
      className="min-h-screen bg-[#f0f0f0] text-[#111]"
      data-report-capture-root="true"
    >
      <section className="relative overflow-visible bg-[url('/headerbackground.png')] bg-cover bg-center bg-no-repeat md:bg-[length:100%_100%]">
        <div className="mx-auto max-w-[1280px] px-4 pb-5 pt-6 md:px-8 md:pb-6 md:pt-8">
          <div className="grid gap-4 text-white md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <div className="space-y-4">
              <h1 className="max-w-[960px] text-2xl font-medium leading-tight tracking-tight sm:text-3xl md:text-5xl">
                {title}
              </h1>
              <nav className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-md bg-white/10 px-2.5 py-1.5 hover:bg-white/20 sm:px-3 sm:py-2"
                >
                  <LayoutGridIcon className="size-4" />
                  Home
                </Link>
                <Link
                  href="/overall"
                  className="inline-flex items-center gap-2 rounded-md bg-white/10 px-2.5 py-1.5 hover:bg-white/20 sm:px-3 sm:py-2"
                >
                  <BarChart3Icon className="size-4" />
                  Overall
                </Link>
                <Link
                  href="/campaign/awareness"
                  className="inline-flex items-center gap-2 rounded-md bg-white/10 px-2.5 py-1.5 hover:bg-white/20 sm:px-3 sm:py-2"
                >
                  <LineChartIcon className="size-4" />
                  Campaign Type
                </Link>
              </nav>
            </div>
            {headerDateControl ? (
              <div className="flex w-full items-start md:w-auto md:justify-self-end">{headerDateControl}</div>
            ) : (
              <div className="w-full rounded-2xl bg-[#dfdfdf] px-4 py-3 text-center text-sm font-semibold text-[#5f5f5f] sm:w-auto sm:px-6 sm:text-base md:justify-self-end">
                {dateLabel}
              </div>
            )}
          </div>
          {headerBottomControl ? <div className="mt-4">{headerBottomControl}</div> : null}
        </div>
      </section>

      <section className="pb-8 pt-4 md:pb-10 md:pt-5">
        <div className="mx-auto max-w-[1280px] px-4 md:px-8">{children}</div>
      </section>

      <footer className="mx-auto flex max-w-[1280px] flex-col items-center gap-3 border-t-4 border-red-600 px-4 py-5 text-center text-sm text-[#777] sm:flex-row sm:justify-between sm:px-6 sm:text-left">
        <Image src="/logo.png" alt="Company logo" width={148} height={32} className="h-8 w-auto object-contain" />
        <span>LOCUS-T SDN BHD</span>
      </footer>
    </main>
  );
}
