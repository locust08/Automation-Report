import type { ReportLoadingKind } from "@/components/reporting/report-loading-config";
import {
  ReportErrorScreen,
  ReportLoadingScreen,
} from "@/components/reporting/report-loading-screen";

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
  return (
    <ReportLoadingScreen
      kind={kind}
      message={message}
      fullPage={fullPage}
      onRetry={onRetry}
    />
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
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-800">
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
