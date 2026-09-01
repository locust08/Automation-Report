import { createMetaGraphTransport, type MetaM03Transport } from "@/lib/change-control/meta-provider-adapter";

export type MetaSynchronizedResourceType = "campaign" | "ad_set" | "ad" | "creative";
export type MetaSynchronizedResource = {
  id: string;
  type: MetaSynchronizedResourceType;
  name: string;
  status: string | null;
  parent_id: string | null;
  creative_id: string | null;
};

export async function discoverMetaSynchronizedResources(input: {
  accountIdentity: string;
  type: MetaSynchronizedResourceType;
  parentIdentity?: string | null;
  search?: string | null;
  transport?: MetaM03Transport;
}): Promise<{ resources: MetaSynchronizedResource[]; provider_execution_locked: true }> {
  const account = normalizeMetaAccount(input.accountIdentity);
  if (!account) throw new Error("Enter a valid Meta ad-account identity.");
  const transport = input.transport ?? createMetaGraphTransport();
  const endpoint = discoveryEndpoint(account, input.type, input.parentIdentity);
  const fields = fieldsFor(input.type);
  const response = await transport.request({ method: "GET", endpoint: `${endpoint}?limit=100`, fields });
  const rows = Array.isArray(response.payload.data) ? response.payload.data : [];
  const search = input.search?.trim().toLowerCase() ?? "";
  const resources = rows
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
    .map((row) => mapResource(input.type, row))
    .filter((row) => !search || row.id.toLowerCase().includes(search) || row.name.toLowerCase().includes(search))
    .slice(0, 50);
  return { resources, provider_execution_locked: true };
}

function discoveryEndpoint(account: string, type: MetaSynchronizedResourceType, parent?: string | null) {
  if (type === "campaign") return `act_${account}/campaigns`;
  if (type === "ad_set") return parent ? `${parent}/adsets` : `act_${account}/adsets`;
  if (type === "ad") return parent ? `${parent}/ads` : `act_${account}/ads`;
  return `act_${account}/adcreatives`;
}

function fieldsFor(type: MetaSynchronizedResourceType) {
  if (type === "campaign") return ["id", "name", "status", "effective_status"];
  if (type === "ad_set") return ["id", "name", "status", "effective_status", "campaign_id"];
  if (type === "ad") return ["id", "name", "status", "effective_status", "adset_id", "creative{id,name}"];
  return ["id", "name", "effective_object_story_id"];
}

function mapResource(type: MetaSynchronizedResourceType, row: Record<string, unknown>): MetaSynchronizedResource {
  const creative = row.creative && typeof row.creative === "object" ? row.creative as Record<string, unknown> : {};
  return {
    id: String(row.id ?? ""),
    type,
    name: String(row.name ?? row.id ?? "Unnamed Meta resource"),
    status: row.effective_status != null ? String(row.effective_status) : row.status != null ? String(row.status) : null,
    parent_id: row.campaign_id != null ? String(row.campaign_id) : row.adset_id != null ? String(row.adset_id) : null,
    creative_id: creative.id != null ? String(creative.id) : null,
  };
}

function normalizeMetaAccount(value: string) { return value.replace(/^act_/, "").replace(/\D/g, ""); }
