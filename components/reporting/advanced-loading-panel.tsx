import { Spinner } from "@/components/ui/spinner";

export function AdvancedLoadingPanel({ title, message }: { title: string; message: string }) {
  return <div role="status" aria-live="polite" className="my-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
    <div className="flex items-center gap-4 px-5 py-4 sm:px-6">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-100"><Spinner className="size-6" /></span>
      <div><p className="font-semibold text-neutral-900">{title}</p><p className="mt-1 text-sm text-neutral-600">{message}</p></div>
    </div>
    <div className="px-5 pb-5 sm:px-6"><div className="h-2.5 overflow-hidden rounded-full bg-neutral-200"><div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-red-700 via-red-500 to-red-400" /></div></div>
  </div>;
}
