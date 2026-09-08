"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExclusionCapSetting } from "@/lib/workflow-settings/exclusion-cap";

export function ExclusionCapCard() {
  const [setting, setSetting] = useState<ExclusionCapSetting | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/admin/settings/exclusion-cap", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.setting) throw new Error(payload.error || "Unable to load cap.");
      setSetting(payload.setting); setValue(String(payload.setting.cap));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load cap."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function save() {
    if (!setting) return;
    setBusy(true); setError(null); setMessage("");
    try {
      const response = await fetch("/api/admin/settings/exclusion-cap", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cap: Number(value), expectedVersion: setting.version }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.setting) throw new Error(payload.error || "Unable to save cap.");
      setSetting(payload.setting); setValue(String(payload.setting.cap)); setMessage("Saved for all users and accounts.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save cap."); }
    finally { setBusy(false); }
  }
  const valid = value.trim() !== "" && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 2147483647;
  return <Card className="bg-white">
    <CardHeader><CardTitle>Automatic search-term exclusions</CardTitle><CardDescription>One shared limit for all users and accounts, across manual and scheduled analysis.</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      <label htmlFor="exclusion-cap" className="block text-sm font-medium">Maximum automatic exclusions per analysis</label>
      <div className="flex flex-wrap items-center gap-3"><Input id="exclusion-cap" className="w-40" type="number" min={0} max={2147483647} step={1} value={value} disabled={!setting || busy} onChange={event => { setValue(event.target.value); setMessage(""); }} /><Button disabled={!setting || busy || !valid || Number(value) === setting.cap} onClick={() => void save()}>{busy ? "Saving…" : "Save cap"}</Button></div>
      <p className="text-sm text-muted-foreground">Enter 0 for no limit. All terms are analysed; this only limits automatic exclusions. Changes apply to the next batch, counting exclusions already claimed in that analysis.</p>
      {setting ? <p className="text-xs text-muted-foreground">Current shared cap: {setting.cap === 0 ? "No limit" : setting.cap}{setting.updatedBy ? ` · Updated by ${setting.updatedBy}` : ""}</p> : !error ? <p role="status">Loading cap…</p> : null}
      {message ? <p role="status" className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <div role="alert" className="text-sm text-red-700">{error} <button className="underline" onClick={() => void load()}>Reload cap</button></div> : null}
    </CardContent>
  </Card>;
}
