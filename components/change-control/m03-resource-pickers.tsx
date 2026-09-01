"use client";

import { useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GoogleSynchronizedResource, GoogleSynchronizedResourceType } from "@/lib/change-control/google-resource-discovery";
import type { MetaSynchronizedResource, MetaSynchronizedResourceType } from "@/lib/change-control/meta-resource-discovery";
import type { TikTokSynchronizedResource, TikTokSynchronizedResourceType } from "@/lib/change-control/tiktok-resource-discovery";
import { requestM03Api } from "@/lib/change-control/workspace";

export function M03GoogleResourcePicker({ accountIdentity, campaignIdentity, onSelect }: { accountIdentity: string; campaignIdentity: string; onSelect: (resource: GoogleSynchronizedResource) => void }) {
  const [type, setType] = useState<GoogleSynchronizedResourceType>("campaign");
  const state = useResourcePickerState<GoogleSynchronizedResource>();
  async function loadResources() {
    await state.load(async () => {
      const query = resourceQuery(accountIdentity, type, state.search, type === "campaign" ? "" : state.parentIdentity || campaignIdentity);
      return (await requestM03Api<{ resources: GoogleSynchronizedResource[] }>(`/api/change-control/google/resources?${query}`)).resources;
    });
  }
  return <ResourcePickerFrame title="Synchronized Google resources" description="Select the exact official campaign, ad group, or ad. Discovery is read-only." state={state} busy={state.busy} accountIdentity={accountIdentity} onLoad={loadResources} renderType={<Select value={type} onValueChange={(value) => setType(value as GoogleSynchronizedResourceType)}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="campaign">Campaigns</SelectItem><SelectItem value="ad_group">Ad groups</SelectItem><SelectItem value="ad">Ads</SelectItem></SelectContent></Select>} parentDisabled={type === "campaign"} parentPlaceholder={type === "ad" ? "Ad group or campaign ID" : "Campaign ID"} onSelect={onSelect} />;
}

export function M03MetaResourcePicker({ accountIdentity, campaignIdentity, onSelect }: { accountIdentity: string; campaignIdentity: string; onSelect: (resource: MetaSynchronizedResource) => void }) {
  const [type, setType] = useState<MetaSynchronizedResourceType>("campaign");
  const state = useResourcePickerState<MetaSynchronizedResource>();
  async function loadResources() {
    await state.load(async () => {
      const query = resourceQuery(accountIdentity, type, state.search, type === "campaign" ? "" : state.parentIdentity || campaignIdentity);
      return (await requestM03Api<{ resources: MetaSynchronizedResource[] }>(`/api/change-control/meta/resources?${query}`)).resources;
    });
  }
  return <ResourcePickerFrame title="Synchronized Meta resources" description="Read official Meta identities and select the exact entity to change. This performs GET requests only." state={state} busy={state.busy} accountIdentity={accountIdentity} onLoad={loadResources} renderType={<select className="h-9 rounded-md border bg-white px-3 text-sm" value={type} onChange={(event) => setType(event.target.value as MetaSynchronizedResourceType)}><option value="campaign">Campaigns</option><option value="ad_set">Ad sets</option><option value="ad">Ads</option><option value="creative">Creatives</option></select>} parentDisabled={type === "campaign"} parentPlaceholder={type === "ad" ? "Ad set ID (optional)" : "Campaign ID (optional)"} onSelect={onSelect} />;
}

export function M03TikTokResourcePicker({ accountIdentity, campaignIdentity, onSelect }: { accountIdentity: string; campaignIdentity: string; onSelect: (resource: TikTokSynchronizedResource) => void }) {
  const [type, setType] = useState<TikTokSynchronizedResourceType>("campaign");
  const state = useResourcePickerState<TikTokSynchronizedResource>();
  async function loadResources() {
    await state.load(async () => {
      const parent = type === "ad_group" || type === "ad" ? state.parentIdentity || campaignIdentity : "";
      const query = resourceQuery(accountIdentity, type, state.search, parent);
      return (await requestM03Api<{ resources: TikTokSynchronizedResource[] }>(`/api/change-control/tiktok/resources?${query}`)).resources;
    });
  }
  return <ResourcePickerFrame title="Synchronized TikTok resources" description="Read official TikTok identities and select the exact regular Auction resource. This performs GET requests only." state={state} busy={state.busy} accountIdentity={accountIdentity} onLoad={loadResources} renderType={<select className="h-9 rounded-md border bg-white px-3 text-sm" value={type} onChange={(event) => setType(event.target.value as TikTokSynchronizedResourceType)}><option value="campaign">Campaigns</option><option value="ad_group">Ad groups</option><option value="ad">Ads</option><option value="identity">Identities</option><option value="video">Videos</option><option value="pixel">Pixels</option></select>} parentDisabled={!(type === "ad_group" || type === "ad")} parentPlaceholder={type === "ad" ? "Ad group ID (optional)" : "Campaign ID (optional)"} onSelect={onSelect} />;
}

type Resource = { id: string; type: string; name: string; status?: string | null };
type PickerState<T extends Resource> = ReturnType<typeof useResourcePickerState<T>>;

function useResourcePickerState<T extends Resource>() {
  const [parentIdentity, setParentIdentity] = useState("");
  const [search, setSearch] = useState("");
  const [resources, setResources] = useState<T[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function load(loader: () => Promise<T[]>) {
    setBusy(true); setError(null);
    try { setResources(await loader()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Something went wrong."); }
    finally { setBusy(false); }
  }
  return { parentIdentity, setParentIdentity, search, setSearch, resources, busy, error, load };
}

function ResourcePickerFrame<T extends Resource>({ title, description, state, accountIdentity, onLoad, renderType, parentDisabled, parentPlaceholder, onSelect }: { title: string; description: string; state: PickerState<T>; busy: boolean; accountIdentity: string; onLoad: () => Promise<void>; renderType: React.ReactNode; parentDisabled: boolean; parentPlaceholder: string; onSelect: (resource: T) => void }) {
  return <div className="rounded-xl border border-red-200 bg-red-50/40 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{title}</h3><p className="text-sm text-muted-foreground">{description}</p></div><Badge variant="outline">Provider mutations locked</Badge></div><div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_1fr_auto]">{renderType}<Input className="bg-white" placeholder="Search name or ID" value={state.search} onChange={(event) => state.setSearch(event.target.value)} /><Input className="bg-white" disabled={parentDisabled} placeholder={parentPlaceholder} value={state.parentIdentity} onChange={(event) => state.setParentIdentity(event.target.value)} /><Button variant="outline" disabled={state.busy || !accountIdentity.trim()} onClick={() => void onLoad()}><RefreshCwIcon /> {state.busy ? "Loading" : "Load"}</Button></div>{state.error ? <p className="mt-3 text-sm text-red-700">{state.error}</p> : null}{state.resources.length ? <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">{state.resources.map((resource) => <button type="button" key={`${resource.type}:${resource.id}`} onClick={() => onSelect(resource)} className="rounded-lg border bg-white p-3 text-left hover:border-red-300 hover:bg-red-50"><span className="block font-medium">{resource.name}</span><span className="mt-1 block text-xs text-muted-foreground">{resource.type.replaceAll("_", " ")} · {resource.id}{resource.status ? ` · ${resource.status}` : ""}</span></button>)}</div> : null}</div>;
}

function resourceQuery(accountIdentity: string, type: string, search: string, parentIdentity: string) {
  const query = new URLSearchParams({ account_identity: accountIdentity, type });
  if (search.trim()) query.set("search", search.trim());
  if (parentIdentity.trim()) query.set("parent_identity", parentIdentity.trim());
  return query;
}
