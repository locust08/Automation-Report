import {
  OverallAudienceSkeleton,
  OverallCampaignSkeleton,
  OverallSummarySkeleton,
} from "@/components/reporting/overall-report-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export function OverallRouteSkeleton() {
  return (
    <main
      className="flex min-h-screen flex-col overflow-x-clip bg-[#f0f0f0] text-[#111]"
      aria-label="Loading monthly performance report"
      aria-busy="true"
    >
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-1 flex-col px-3 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-6 lg:px-10 lg:pb-8 lg:pt-8">
        <section className="relative overflow-hidden rounded-3xl bg-[url('/headerbackground.png')] bg-cover bg-center bg-no-repeat shadow-sm md:bg-[length:100%_100%]">
          <div className="w-full px-3 py-4 sm:px-6 sm:py-5 lg:px-8">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)] lg:items-start lg:gap-x-6">
              <div className="space-y-2">
                <Skeleton className="h-8 w-[min(28rem,85%)] bg-white/25 sm:h-9" />
                <Skeleton className="h-8 w-[min(20rem,60%)] bg-white/20 sm:h-9" />
              </div>
              <Skeleton className="h-9 w-full max-w-[360px] bg-white/75 lg:justify-self-end" />
            </div>

            <div className="mt-3 flex gap-1.5">
              <Skeleton className="h-9 w-20 bg-white/20" />
              <Skeleton className="h-9 w-28 bg-white/80" />
              <Skeleton className="h-9 w-20 bg-white/20" />
            </div>

            <div className="mt-3 rounded-2xl bg-white/90 p-2.5 shadow-sm">
              <div className="grid grid-cols-[84px_minmax(0,1fr)_32px] gap-2">
                <Skeleton className="h-8 bg-black/10" />
                <Skeleton className="h-8 bg-black/10" />
                <Skeleton className="h-8 bg-black/10" />
              </div>
              <div className="mt-2 flex items-center gap-0">
                <Skeleton className="h-8 w-24 rounded-r-none bg-black/10" />
                <Skeleton className="h-8 w-20 rounded-none bg-red-200/70" />
                <Skeleton className="h-8 w-20 rounded-l-none bg-black/10" />
                <Skeleton className="ml-auto h-8 w-20 bg-black/10" />
              </div>
            </div>
          </div>
        </section>

        <section className="flex-1 py-3 sm:py-4 lg:py-6">
          <div className="w-full px-3 sm:px-6 lg:px-8">
            <div className="space-y-4">
              <OverallSummarySkeleton compact />
              <OverallCampaignSkeleton compact />
              <OverallAudienceSkeleton compact />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
