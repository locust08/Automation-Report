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
    <main className="min-h-screen bg-[#f0f0f0] text-[#111]">
      <section className="relative overflow-visible bg-[url('/headerbackground.png')] bg-[length:100%_100%] bg-center bg-no-repeat">
        <div className="mx-auto max-w-[1280px] px-4 pb-5 pt-7 md:px-8 md:pb-6 md:pt-8">
          <div className="grid gap-4 text-white md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <div className="space-y-4">
              <h1 className="max-w-[960px] text-4xl font-medium leading-tight tracking-tight md:text-5xl">
                {title}
              </h1>
              <nav className="flex flex-wrap items-center gap-2 text-sm">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 hover:bg-white/20"
                >
                  <LayoutGridIcon className="size-4" />
                  Home
                </Link>
                <Link
                  href="/overall"
                  className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 hover:bg-white/20"
                >
                  <BarChart3Icon className="size-4" />
                  Overall
                </Link>
                <Link
                  href="/campaign/awareness"
                  className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 hover:bg-white/20"
                >
                  <LineChartIcon className="size-4" />
                  Campaign Type
                </Link>
              </nav>
            </div>
            {headerDateControl ? (
              <div className="flex items-start md:justify-self-end">{headerDateControl}</div>
            ) : (
              <div className="rounded-2xl bg-[#dfdfdf] px-6 py-3 text-base font-semibold text-[#5f5f5f] md:justify-self-end">
                {dateLabel}
              </div>
            )}
          </div>
          {headerBottomControl ? <div className="mt-4">{headerBottomControl}</div> : null}
        </div>
      </section>

      <section className="pt-5 pb-10">
        <div className="mx-auto max-w-[1280px] px-4 md:px-8">{children}</div>
      </section>

      <footer className="mx-auto flex max-w-[1280px] items-center justify-between border-t-4 border-red-600 px-6 py-5 text-sm text-[#777]">
        <Image src="/logo.png" alt="Company logo" width={148} height={32} className="h-8 w-auto object-contain" />
        <span>LOCUS-T SDN BHD</span>
      </footer>
    </main>
  );
}
