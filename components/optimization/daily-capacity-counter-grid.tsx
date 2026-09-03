import { Card, CardContent } from "@/components/ui/card";

export type DailyAnalysisCapacity = {
  total: number;
  used: number;
  reserved: number;
  claiming: number;
  available: number;
  allocatedAccountIds?: string[];
};

export function DailyCapacityCounterGrid({ capacity }: { capacity: DailyAnalysisCapacity | null }) {
  const counters = [
    ["Total attempts", capacity?.total ?? 0],
    ["Used", (capacity?.used ?? 0) + (capacity?.claiming ?? 0)],
    ["Reserved", capacity?.reserved ?? 0],
    ["Available", capacity?.available ?? 0],
  ] as const;

  return <div className="grid w-full grid-cols-2 gap-2">
    {counters.map(([label, value]) => <Card key={label} size="sm" className="gap-0 border-0 bg-white/92 py-2 shadow-sm ring-0">
      <CardContent className="px-3 sm:px-4">
        <p className="text-sm font-semibold leading-tight text-neutral-600">{label}</p>
        <p className="mt-0.5 text-xl font-semibold leading-none tabular-nums text-neutral-950">{value.toLocaleString("en-MY")}</p>
      </CardContent>
    </Card>)}
  </div>;
}
