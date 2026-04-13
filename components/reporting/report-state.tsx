import { AlertTriangleIcon, LoaderCircleIcon } from "lucide-react";

export function ReportLoadingState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-white p-8 text-center shadow-sm">
      <LoaderCircleIcon className="mx-auto mb-3 size-6 animate-spin text-red-700" />
      <p className="text-base text-muted-foreground">{message}</p>
    </div>
  );
}

export function ReportErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-300 bg-red-50 p-6 text-red-700">
      <div className="mb-2 flex items-center gap-2 font-semibold">
        <AlertTriangleIcon className="size-5" />
        Data Fetch Error
      </div>
      <p className="text-sm">{message}</p>
    </div>
  );
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
