import { LoaderCircleIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const DEFAULT_LOADING_STEPS = [
  "Validating account access",
  "Collecting source data",
  "Normalizing platform metrics",
  "Assembling the report view",
] as const;

interface ReportLoadingScreenProps {
  title?: string;
  message: string;
  steps?: readonly string[];
  fullPage?: boolean;
  className?: string;
}

export function ReportLoadingScreen({
  title = "We're preparing your report.",
  message,
  steps = DEFAULT_LOADING_STEPS,
  fullPage = false,
  className,
}: ReportLoadingScreenProps) {
  return (
    <section
      className={cn(
        fullPage
          ? "relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[url('/background.png'),url('/backround.png')] bg-cover bg-center bg-no-repeat px-4 py-8"
          : "px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12",
        fullPage
          ? "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_34%),linear-gradient(180deg,rgba(0,0,0,0.15),rgba(0,0,0,0.24))] before:content-['']"
          : "relative isolate overflow-hidden rounded-[2rem] border border-white/80 bg-[linear-gradient(180deg,#fcfcfc_0%,#f3f3f3_100%)] shadow-[0_28px_80px_-48px_rgba(143,0,24,0.45)]",
        className
      )}
    >
      {fullPage ? null : (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[url('/headerbackground.png')] bg-cover bg-center opacity-95" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_42%),linear-gradient(180deg,rgba(143,0,24,0.12),transparent_28%)]" />
          <div className="pointer-events-none absolute left-1/2 top-28 h-48 w-48 -translate-x-1/2 rounded-full bg-red-700/10 blur-3xl" />
        </>
      )}

      <div
        className={cn(
          "relative mx-auto w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/70 bg-white/84 backdrop-blur-sm",
          fullPage ? "px-5 py-8 shadow-[0_22px_60px_-28px_rgba(0,0,0,0.42)] sm:px-8 sm:py-10 lg:px-12" : "px-1"
        )}
      >
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(143,0,24,0.45),transparent)]" />

        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-4 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-red-800">
            Automation Reporting
          </span>

          <h2 className="mt-6 text-balance text-3xl font-semibold leading-tight tracking-tight text-[#1a1a1a] sm:text-4xl lg:text-[3.25rem]">
            {title}
          </h2>

          <p className="mt-4 max-w-2xl text-pretty text-sm leading-7 text-[#5b5b5b] sm:text-base">
            {message}
          </p>

          <div className="mt-8 flex items-center justify-center">
            <div className="report-loading-orbit relative flex h-20 w-20 items-center justify-center rounded-full border border-red-200/80 bg-[radial-gradient(circle,rgba(255,255,255,0.95)_0%,rgba(246,246,246,0.8)_100%)] shadow-[0_16px_40px_-24px_rgba(143,0,24,0.65)]">
              <div className="absolute inset-2 rounded-full border border-dashed border-red-300/70" />
              <LoaderCircleIcon className="size-6 text-red-700" />
            </div>
          </div>
        </div>

        <div className="mt-10 hidden md:block">
          <div className="relative mx-auto max-w-4xl px-6">
            <div className="absolute inset-x-8 top-4 h-px bg-[#d7d7d7]" />
            <div className="report-loading-shimmer absolute inset-x-8 top-4 h-px bg-[linear-gradient(90deg,transparent,rgba(143,0,24,0.65),transparent)]" />
            <ol className="relative grid grid-cols-4 gap-6">
              {steps.map((step, index) => (
                <li key={step} className="flex flex-col items-center gap-3 text-center">
                  <span
                    className="report-loading-step-dot flex h-8 w-8 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-semibold text-red-800 shadow-sm"
                    style={{ animationDelay: `${index * 0.18}s` }}
                  >
                    {index + 1}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6a6a6a]">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <ol className="mt-10 grid gap-3 md:hidden">
          {steps.map((step, index) => (
            <li
              key={step}
              className="flex items-center gap-3 rounded-2xl border border-[#ececec] bg-[#fafafa] px-4 py-3"
            >
              <span
                className="report-loading-step-dot flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-semibold text-red-800"
                style={{ animationDelay: `${index * 0.18}s` }}
              >
                {index + 1}
              </span>
              <span className="text-sm font-medium text-[#555]">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
