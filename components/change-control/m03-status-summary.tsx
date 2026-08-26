import { Card, CardContent } from "@/components/ui/card";
import type { M03RequestListPayload } from "@/lib/change-control/types";

export function M03StatusSummary({ payload }: { payload: M03RequestListPayload | null }) {
  const cards = [
    ["All requests", payload?.summary.all ?? 0],
    ["Draft", payload?.summary.draft ?? 0],
    ["Awaiting approval", payload?.summary.awaiting_approval ?? 0],
    ["Approved", payload?.summary.approved ?? 0],
    ["Cancelled", payload?.summary.cancelled ?? 0],
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map(([label, value]) => (
        <Card key={String(label)} size="sm" className="gap-1 bg-white">
          <CardContent>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
