"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { REPORT_DISPLAY_DEFAULTS, reportDisplayPage, type ReportDisplayPage, type ReportDisplayPreferences } from "@/lib/reporting/display-preferences";
type DisplayState = { preferences: ReportDisplayPreferences; loading: boolean; saving: boolean; error: string | null; save: (page: ReportDisplayPage, value: boolean) => Promise<void> };
const DisplayContext = createContext<DisplayState>({ preferences: REPORT_DISPLAY_DEFAULTS, loading: false, saving: false, error: null, save: async () => {} });
export function ReportDisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const relevant = Boolean(reportDisplayPage(pathname)) || pathname === "/settings";
  const [preferences, setPreferences] = useState(REPORT_DISPLAY_DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!relevant || loaded) return;
    // New automation captures keep defaults; interactive downloads retain loaded state.
    if (new URLSearchParams(window.location.search).get("screenshot")?.match(/^(1|true)$/)) { setLoaded(true); return; }
    const controller = new AbortController();
    void fetch("/api/user/report-display-preferences", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async response => { if (!response.ok) throw new Error("Unable to load report display preferences. Default display is being used."); return response.json(); })
      .then(payload => { setPreferences(payload.preferences); setLoaded(true); })
      .catch(cause => { if (!controller.signal.aborted) { setError(cause.message); setLoaded(true); } });
    return () => controller.abort();
  }, [relevant, loaded]);
  async function save(page: ReportDisplayPage, value: boolean) {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/user/report-display-preferences", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ [page]: value }) });
      if (!response.ok) throw new Error("Unable to save report display preferences. Please try again.");
      const payload = await response.json(); setPreferences(payload.preferences);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save preferences."); }
    finally { setSaving(false); }
  }
  return <DisplayContext.Provider value={{ preferences, loading: relevant && !loaded, saving, error, save }}>{children}</DisplayContext.Provider>;
}
export function useReportDisplayPreferences() { return useContext(DisplayContext); }
export function useShowComparisonPercentages() {
  const { preferences, loading } = useReportDisplayPreferences();
  const page = reportDisplayPage(usePathname());
  return page ? !loading && preferences[page] : true;
}
export function ComparisonPercentage({ children }: { children: ReactNode }) {
  return useShowComparisonPercentages() ? <>{children}</> : null;
}
