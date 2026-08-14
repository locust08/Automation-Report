import type { ReportLoadingKind } from "@/components/reporting/report-loading-config";
import {
  ReportErrorScreen,
  ReportLoadingScreen,
} from "@/components/reporting/report-loading-screen";
import { Skeleton } from "@/components/ui/skeleton";

export function ReportLoadingState({
  kind = "fallback",
  message,
  fullPage = false,
  onRetry,
}: {
  kind?: ReportLoadingKind;
  message: string;
  fullPage?: boolean;
  onRetry?: (() => void) | undefined;
}) {
  if (!fullPage) {
    return <ReportSectionLoadingState message={message} onRetry={onRetry} />;
  }

  return (
    <ReportLoadingScreen
      kind={kind}
      message={message}
      fullPage={fullPage}
      onRetry={onRetry}
    />
  );
}

export function ReportSectionLoadingState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <section className="rounded-[2rem] bg-[#e7e7e7] p-4 shadow-sm sm:p-6">
      <div className="rounded-2xl border border-[#d1d1d1] bg-white/75 p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-[#c7c7c7]" />
              <p className="text-sm font-semibold text-[#626262]">{message}</p>
            </div>
            <Skeleton className="h-3 w-56 max-w-full bg-[#d7d7d7]" />
          </div>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="self-start rounded-full border border-[#cfcfcf] bg-white px-3 py-1.5 text-xs font-semibold text-[#555] transition-colors hover:border-[#b9b9b9] hover:bg-[#f7f7f7] sm:self-auto"
            >
              Retry
            </button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="rounded-xl border border-[#d8d8d8] bg-[#f2f2f2] p-3">
              <Skeleton className="h-4 w-24 bg-[#d7d7d7]" />
              <Skeleton className="mt-3 h-9 w-full bg-[#d4d4d4]" />
              <Skeleton className="mt-2 h-3 w-2/3 bg-[#d7d7d7]" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ReportErrorState({
  kind = "fallback",
  message,
  onRetry,
}: {
  kind?: ReportLoadingKind;
  message: string;
  onRetry?: (() => void) | undefined;
}) {
  return <ReportErrorScreen kind={kind} message={message} onRetry={onRetry} />;
}

export function ReportWarnings({ warnings }: { warnings: string[] }) {
  const uniqueWarnings = Array.from(
    new Set(
      warnings
        .map((warning) => warning.trim())
        .filter((warning) => warning.length > 0)
        .filter((warning) => !warning.startsWith("Notion resolved "))
    )
  );

  if (!uniqueWarnings.length) {
    return null;
  }

  return (
    <div
      className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-800"
      data-report-export-exclude="true"
    >
      <p className="mb-1 font-semibold">Warnings</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {uniqueWarnings.map((warning, index) => (
          <li key={`${index}-${warning}`}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}

export function ReportEmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-white p-8 text-center shadow-sm">
      <p className="text-base font-semibold text-[#444]">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
