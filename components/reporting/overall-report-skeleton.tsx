import { Skeleton } from "@/components/ui/skeleton";

export function OverallSummarySkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <section
      aria-label="Loading summary metrics"
      aria-busy="true"
      className={compact ? "rounded-[1.25rem] bg-[#e7e7e7] p-3 shadow-sm" : "rounded-[1.5rem] bg-[#e7e7e7] p-4 shadow-sm"}
    >
      <Skeleton className="mb-3 h-9 w-32 rounded-full bg-black/10" />

      <div className="space-y-3 md:hidden">
        <div className="flex gap-2 overflow-hidden pb-1">
          {["w-24", "w-20", "w-16", "w-20"].map((width, index) => (
            <Skeleton key={index} className={`h-8 shrink-0 rounded-full bg-black/10 ${width}`} />
          ))}
        </div>
        <div className={compact ? "rounded-lg border border-black/5 bg-[#ded9e2] p-3" : "rounded-lg border border-black/5 bg-[#ded9e2] p-4"}>
          <Skeleton className="mx-auto h-4 w-24 bg-black/10" />
          <Skeleton className="mx-auto mt-4 h-10 w-28 bg-black/10" />
          <Skeleton className="mx-auto mt-3 h-4 w-20 bg-black/10" />
        </div>
      </div>

      <div className="hidden grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2 md:grid">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="mx-auto h-4 w-20 bg-black/10" />
            <Skeleton className={compact ? "h-[92px] bg-black/10" : "h-[104px] bg-black/10"} />
          </div>
        ))}
      </div>
    </section>
  )
}

export function OverallCampaignSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <section
      aria-label="Loading campaign performance"
      aria-busy="true"
      className={compact ? "space-y-3 rounded-[1.25rem] bg-[#e7e7e7] p-3 shadow-sm" : "space-y-4 rounded-[1.5rem] bg-[#e7e7e7] p-4 shadow-sm"}
    >
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-56 max-w-[60%] bg-black/10" />
        <Skeleton className="h-8 w-28 bg-black/10" />
      </div>
      {[0, 1].map((index) => (
        <div key={index} className="rounded-xl border border-black/5 bg-white/75 p-3">
          <Skeleton className="h-9 w-full bg-red-200/60" />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, itemIndex) => (
              <div key={itemIndex} className="space-y-1.5">
                <Skeleton className="h-3 w-16 bg-black/10" />
                <Skeleton className="h-5 w-20 max-w-full bg-black/10" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

export function OverallAudienceSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <section
      aria-label="Loading audience breakdown"
      aria-busy="true"
      className={compact ? "space-y-3 rounded-[1.25rem] bg-[#e7e7e7] p-3 shadow-sm" : "space-y-4 rounded-[1.5rem] bg-[#e7e7e7] p-4 shadow-sm"}
    >
      <Skeleton className="h-8 w-52 max-w-[65%] bg-black/10" />
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1].map((index) => (
          <div key={index} className="rounded-xl bg-white/75 p-3">
            <Skeleton className="h-5 w-28 bg-black/10" />
            <div className="mt-4 space-y-3">
              {["w-full", "w-5/6", "w-2/3"].map((width, rowIndex) => (
                <Skeleton key={rowIndex} className={`h-7 bg-black/10 ${width}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function OverallReportSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-4" aria-label="Loading report" aria-busy="true">
      <OverallSummarySkeleton compact={compact} />
      <OverallCampaignSkeleton compact={compact} />
      <OverallAudienceSkeleton compact={compact} />
    </div>
  )
}
