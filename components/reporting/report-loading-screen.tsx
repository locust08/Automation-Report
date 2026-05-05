"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangleIcon,
  CheckIcon,
  Layers3Icon,
  LayoutDashboardIcon,
  LoaderCircleIcon,
  MegaphoneIcon,
  NetworkIcon,
  RefreshCcwIcon,
  SearchIcon,
  SparklesIcon,
  TrendingUpIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getReportLoadingDefinition,
  type ReportLoadingKind,
} from "@/components/reporting/report-loading-config";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  gauge: LayoutDashboardIcon,
  hierarchy: NetworkIcon,
  layers: Layers3Icon,
  layout: SparklesIcon,
  lineChart: TrendingUpIcon,
  megaphone: MegaphoneIcon,
  search: SearchIcon,
};

interface ReportLoadingScreenProps {
  kind?: ReportLoadingKind;
  title?: string;
  message?: string;
  supportMessages?: readonly string[];
  steps?: readonly string[];
  fullPage?: boolean;
  className?: string;
  onRetry?: (() => void) | undefined;
}

export function ReportLoadingScreen({
  kind = "fallback",
  title,
  message,
  supportMessages,
  steps,
  fullPage = false,
  className,
  onRetry,
}: ReportLoadingScreenProps) {
  const definition = getReportLoadingDefinition(kind);
  const resolvedTitle = title ?? definition.title;
  const resolvedMessage = message ?? definition.description;
  const resolvedSupportMessages = supportMessages?.length
    ? supportMessages
    : definition.supportMessages;
  const resolvedSteps = steps?.length ? steps : definition.steps;
  const Icon = ICONS[definition.icon] ?? LoaderCircleIcon;
  const [elapsedMs, setElapsedMs] = useState(0);
  const [supportIndex, setSupportIndex] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 160);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (resolvedSupportMessages.length <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setSupportIndex((current) => (current + 1) % resolvedSupportMessages.length);
    }, 2600);

    return () => window.clearInterval(interval);
  }, [resolvedSupportMessages]);

  const progress = useMemo(() => {
    const ratio = Math.min(0.94, 0.14 + elapsedMs / 18000);
    return ratio;
  }, [elapsedMs]);

  const stepCount = Math.max(resolvedSteps.length, 1);
  const activeStepIndex = Math.min(stepCount - 1, Math.floor(progress * stepCount));
  const longWait = elapsedMs >= 12000;
  const currentSupportMessage =
    resolvedSupportMessages[supportIndex] ?? resolvedSupportMessages[0] ?? resolvedMessage;

  return (
    <section
      className={cn(
        fullPage
          ? "relative isolate flex h-dvh min-h-dvh items-center justify-center overflow-hidden bg-[url('/background.png')] bg-cover bg-center bg-no-repeat px-3 py-3 sm:px-4 sm:py-4"
          : "px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12",
        fullPage
          ? "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_34%),linear-gradient(180deg,rgba(0,0,0,0.15),rgba(0,0,0,0.24))] before:content-['']"
          : "relative isolate overflow-hidden rounded-[2rem] border border-white/80 bg-[linear-gradient(180deg,#fcfcfc_0%,#f3f3f3_100%)] shadow-[0_28px_80px_-48px_rgba(143,0,24,0.45)]",
        "report-loading-enter",
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
          "relative mx-auto w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/88 backdrop-blur-sm",
          fullPage
            ? "px-4 py-5 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.42)] sm:px-6 sm:py-6 lg:px-8 lg:py-7"
            : "px-1"
        )}
      >
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(143,0,24,0.45),transparent)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(143,0,24,0.09),transparent_62%)]" />

        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-4 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-red-800">
            Automation Reporting
          </span>

          <div className="report-loading-copy-swap mt-4 min-h-[3.5rem] sm:mt-5 sm:min-h-[4rem]">
            <h2 className="text-balance text-2xl font-semibold leading-tight tracking-tight text-[#1a1a1a] sm:text-3xl lg:text-[2.8rem]">
              {resolvedTitle}
            </h2>
          </div>

          <p className="mt-3 max-w-2xl text-pretty text-sm leading-6 text-[#666] sm:text-base lg:text-[1rem]">
            {resolvedMessage}
          </p>

          <div className="mt-4 min-h-[1.5rem]">
            <div
              key={`${kind}-${supportIndex}`}
              className="report-loading-copy-swap inline-flex items-center gap-2 text-sm font-medium text-red-700 sm:text-base"
            >
              <span className="relative inline-flex size-3 items-center justify-center">
                <span className="report-loading-ping absolute inset-0 rounded-full bg-red-500/20" />
                <span className="size-1.5 rounded-full bg-red-600" />
              </span>
              <span>{currentSupportMessage}</span>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center sm:mt-7">
            <div className="relative flex h-40 w-40 items-center justify-center sm:h-44 sm:w-44 lg:h-48 lg:w-48">
              <div className="report-loading-orbit absolute inset-0 rounded-full border border-red-100/90" />
              <div className="report-loading-arc absolute inset-[0.55rem] rounded-full border-[9px] border-transparent border-t-red-600/95 border-r-red-500/65" />
              <div className="report-loading-arc-reverse absolute inset-[1.35rem] rounded-full border-[7px] border-transparent border-l-red-200 border-b-red-100" />
              <div className="report-loading-dots absolute inset-[0.8rem] rounded-full border border-dashed border-red-300/70" />
              <div className="absolute inset-[2.3rem] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,1)_0%,rgba(254,242,242,0.96)_70%,rgba(254,242,242,0.82)_100%)] shadow-[0_16px_36px_-24px_rgba(143,0,24,0.5)]" />
              <div className="report-loading-core absolute inset-[2.8rem] flex items-center justify-center rounded-full border border-red-200/80 bg-white shadow-[0_10px_24px_-16px_rgba(143,0,24,0.5)]">
                <Icon className="size-7 text-red-600 sm:size-8" />
              </div>
            </div>
          </div>
        </div>

        {longWait ? (
          <div className="report-loading-copy-swap mx-auto mt-4 max-w-2xl rounded-[1.5rem] border border-red-100 bg-[linear-gradient(180deg,rgba(255,251,251,0.98),rgba(255,244,244,0.9))] px-4 py-3 text-center shadow-[0_18px_36px_-28px_rgba(143,0,24,0.45)] sm:px-5 sm:py-4">
            <p className="text-sm font-semibold text-[#27272a]">{definition.longWaitTitle}</p>
            <p className="mt-1 text-sm leading-6 text-[#666]">{definition.longWaitMessage}</p>
            {onRetry ? (
              <div className="mt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onRetry}
                  className="border-red-200 bg-white text-red-700 hover:bg-red-50 hover:text-red-800"
                >
                  <RefreshCcwIcon className="size-4" />
                  Refresh request
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-7 hidden md:block">
          <div className="relative mx-auto max-w-5xl px-6">
            <div className="absolute inset-x-8 top-5 h-px bg-[#dbdbdb]" />
            <div
              className="absolute left-8 top-5 h-px bg-[linear-gradient(90deg,rgba(185,28,28,0.8),rgba(220,38,38,0.9))] transition-[width] duration-700 ease-out"
              style={{ width: `calc((100% - 4rem) * ${progress})` }}
            />
            <ol className="relative grid gap-6" style={{ gridTemplateColumns: `repeat(${stepCount}, minmax(0, 1fr))` }}>
              {resolvedSteps.map((step, index) => {
                const isCompleted = index < activeStepIndex;
                const isActive = index === activeStepIndex;

                return (
                  <li key={step} className="flex flex-col items-center gap-3 text-center">
                    <span
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold shadow-sm transition-all duration-500",
                        isCompleted
                          ? "border-red-600 bg-red-600 text-white shadow-[0_0_0_8px_rgba(239,68,68,0.12)]"
                          : isActive
                            ? "report-loading-step-active border-red-300 bg-white text-red-700 shadow-[0_0_0_8px_rgba(248,113,113,0.12)]"
                            : "border-[#cfcfcf] bg-white text-[#8a8a8a]"
                      )}
                    >
                      {isCompleted ? <CheckIcon className="size-4" /> : index + 1}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-semibold uppercase tracking-[0.2em] transition-colors duration-500",
                        isCompleted || isActive ? "text-red-700" : "text-[#838383]"
                      )}
                    >
                      {step}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <ol className="mt-8 grid gap-3 md:hidden">
          {resolvedSteps.map((step, index) => {
            const isCompleted = index < activeStepIndex;
            const isActive = index === activeStepIndex;

            return (
              <li
                key={step}
                className={cn(
                  "rounded-2xl border px-4 py-3 transition-all duration-500",
                  isCompleted || isActive
                    ? "border-red-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,245,245,0.96))] shadow-[0_14px_34px_-30px_rgba(143,0,24,0.5)]"
                    : "border-[#ececec] bg-[#fafafa]"
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-all duration-500",
                      isCompleted
                        ? "border-red-600 bg-red-600 text-white"
                        : isActive
                          ? "report-loading-step-active border-red-300 bg-white text-red-700"
                          : "border-[#d4d4d4] bg-white text-[#8a8a8a]"
                    )}
                  >
                    {isCompleted ? <CheckIcon className="size-4" /> : index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className={cn("text-sm font-medium", isCompleted || isActive ? "text-[#27272a]" : "text-[#666]")}>
                      {step}
                    </p>
                    <p className="mt-0.5 text-xs text-[#8a8a8a]">
                      {isCompleted ? "Completed" : isActive ? "In progress" : "Pending"}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export function ReportSuccessScreen({
  kind = "fallback",
  className,
  fullPage = false,
}: {
  kind?: ReportLoadingKind;
  className?: string;
  fullPage?: boolean;
}) {
  const definition = getReportLoadingDefinition(kind);
  const stepCount = Math.max(definition.steps.length, 1);

  return (
    <section
      className={cn(
        fullPage
          ? "relative isolate flex h-dvh min-h-dvh items-center justify-center overflow-hidden bg-[url('/background.png')] bg-cover bg-center bg-no-repeat px-3 py-3 sm:px-4 sm:py-4"
          : "px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12",
        fullPage
          ? "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_34%),linear-gradient(180deg,rgba(0,0,0,0.15),rgba(0,0,0,0.24))] before:content-['']"
          : "relative isolate overflow-hidden rounded-[2rem] border border-white/80 bg-[linear-gradient(180deg,#fcfcfc_0%,#f3f3f3_100%)] shadow-[0_28px_80px_-48px_rgba(143,0,24,0.45)]",
        "report-loading-enter",
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
          "relative mx-auto w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/88 backdrop-blur-sm",
          fullPage
            ? "px-4 py-5 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.42)] sm:px-6 sm:py-6 lg:px-8 lg:py-7"
            : "px-1"
        )}
      >
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(143,0,24,0.45),transparent)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(143,0,24,0.09),transparent_62%)]" />

        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-4 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.32em] text-red-800">
            Automation Reporting
          </span>

          <div className="report-loading-copy-swap mt-4 min-h-[3.5rem] sm:mt-5 sm:min-h-[4rem]">
            <h2 className="text-balance text-2xl font-semibold leading-tight tracking-tight text-[#1a1a1a] sm:text-3xl lg:text-[2.8rem]">
              {definition.successTitle}
            </h2>
          </div>

          <p className="mt-3 max-w-2xl text-pretty text-sm leading-6 text-[#666] sm:text-base lg:text-[1rem]">
            {definition.successMessage}
          </p>

          <div className="mt-4 min-h-[1.5rem]">
            <div className="report-loading-copy-swap inline-flex items-center gap-2 text-sm font-medium text-red-700 sm:text-base">
              <span className="relative inline-flex size-3 items-center justify-center">
                <span className="report-success-ping absolute inset-0 rounded-full bg-red-500/18" />
                <span className="size-1.5 rounded-full bg-red-600" />
              </span>
              <span>Completed successfully</span>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-center sm:mt-7">
            <div className="relative flex h-40 w-40 items-center justify-center sm:h-44 sm:w-44 lg:h-48 lg:w-48">
              <div className="report-success-halo absolute inset-0 rounded-full border border-red-100/80" />
              <div className="report-success-ring absolute inset-[0.45rem] rounded-full border-[9px] border-red-200/50" />
              <div className="report-success-ring-strong absolute inset-[0.9rem] rounded-full border-[7px] border-red-300/70" />
              <div className="absolute inset-[2.3rem] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,1)_0%,rgba(254,242,242,0.96)_70%,rgba(254,242,242,0.82)_100%)] shadow-[0_16px_36px_-24px_rgba(143,0,24,0.55)]" />
              <div className="report-success-core absolute inset-[2.85rem] flex items-center justify-center rounded-full border border-red-300/90 bg-white shadow-[0_12px_28px_-16px_rgba(143,0,24,0.6)]">
                <CheckIcon className="report-success-check size-8 text-red-700 sm:size-9" />
              </div>
              <span className="report-success-spark absolute left-[14%] top-[70%] size-1.5 rounded-full bg-white/90 shadow-[0_0_16px_rgba(255,255,255,0.95)]" />
              <span className="report-success-spark absolute left-[22%] top-[28%] size-1 rounded-full bg-white/90 shadow-[0_0_16px_rgba(255,255,255,0.95)]" />
              <span className="report-success-spark absolute right-[16%] top-[34%] size-1.5 rounded-full bg-white/90 shadow-[0_0_16px_rgba(255,255,255,0.95)]" />
              <span className="report-success-spark absolute right-[22%] top-[66%] size-1 rounded-full bg-white/90 shadow-[0_0_16px_rgba(255,255,255,0.95)]" />
              <span className="report-success-spark absolute bottom-[12%] left-1/2 size-1 rounded-full bg-white/90 shadow-[0_0_16px_rgba(255,255,255,0.95)]" />
            </div>
          </div>
        </div>

        <div className="mt-7 hidden md:block">
          <div className="relative mx-auto max-w-5xl px-6">
            <div className="absolute inset-x-8 top-5 h-px bg-[#dbdbdb]" />
            <div className="absolute inset-x-8 top-5 h-px bg-[linear-gradient(90deg,rgba(185,28,28,0.8),rgba(220,38,38,0.9))]" />
            <ol className="relative grid gap-6" style={{ gridTemplateColumns: `repeat(${stepCount}, minmax(0, 1fr))` }}>
              {definition.steps.map((step) => (
                <li key={step} className="flex flex-col items-center gap-3 text-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-red-600 bg-red-600 text-white shadow-[0_0_0_8px_rgba(239,68,68,0.12)]">
                    <CheckIcon className="size-4" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-red-700">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <ol className="mt-8 grid gap-3 md:hidden">
          {definition.steps.map((step) => (
            <li
              key={step}
              className="rounded-2xl border border-red-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,245,245,0.96))] px-4 py-3 shadow-[0_14px_34px_-30px_rgba(143,0,24,0.5)]"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-600 bg-red-600 text-white">
                  <CheckIcon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#27272a]">{step}</p>
                  <p className="mt-0.5 text-xs text-[#8a8a8a]">Completed</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function ReportErrorScreen({
  kind = "fallback",
  message,
  onRetry,
  className,
  fullPage = false,
}: {
  kind?: ReportLoadingKind;
  message: string;
  onRetry?: (() => void) | undefined;
  className?: string;
  fullPage?: boolean;
}) {
  const definition = getReportLoadingDefinition(kind);

  return (
    <section
      className={cn(
        fullPage
          ? "relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[url('/background.png')] bg-cover bg-center bg-no-repeat px-4 py-8"
          : "px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12",
        fullPage
          ? "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.18),transparent_34%),linear-gradient(180deg,rgba(0,0,0,0.15),rgba(0,0,0,0.24))] before:content-['']"
          : "",
        "report-loading-enter",
        className
      )}
    >
      <div className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,#fffefe_0%,#fff7f7_100%)] p-6 shadow-[0_24px_50px_-34px_rgba(143,0,24,0.45)] backdrop-blur-sm sm:p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(239,68,68,0.09),transparent_72%)]" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-red-200 bg-white text-red-600 shadow-sm">
              <AlertTriangleIcon className="size-5" />
            </div>
            <div>
              <p className="text-base font-semibold text-[#1f1f1f]">{definition.errorTitle}</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#666]">{message}</p>
            </div>
          </div>
          {onRetry ? (
            <Button
              type="button"
              variant="outline"
              onClick={onRetry}
              className="border-red-200 bg-white text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              <RefreshCcwIcon className="size-4" />
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
