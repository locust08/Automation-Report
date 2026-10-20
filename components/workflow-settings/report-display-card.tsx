"use client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useReportDisplayPreferences } from "@/components/reporting/report-display-preferences";
import type { ReportDisplayPage } from "@/lib/reporting/display-preferences";
const pages: [ReportDisplayPage, string][] = [["overall", "Monthly Performance"], ["campaign", "Campaign reports"], ["advanced", "Advanced Report"]];
export function ReportDisplayCard() {
  const { preferences, loading, saving, error, save } = useReportDisplayPreferences();
  return <Card className="bg-white"><CardHeader><CardTitle>Report display</CardTitle><CardDescription>Show comparison percentages on your reports and downloads. Saved automatically for your account. CTR, rates and shares remain visible.</CardDescription></CardHeader><CardContent className="space-y-4">
    {pages.map(([page, label]) => <label key={page} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"><span>{label}</span><span className="flex items-center gap-3 text-sm">Show comparison percentages<Switch checked={preferences[page]} disabled={loading || saving} onCheckedChange={value => void save(page, value)} aria-label={`Show comparison percentages for ${label}`} /></span></label>)}
    {loading || saving ? <p role="status" className="text-sm text-muted-foreground">{loading ? "Loading preferencesâ€¦" : "Savingâ€¦"}</p> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
  </CardContent></Card>;
}
