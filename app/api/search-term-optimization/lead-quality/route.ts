import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/server-session";
import { parseLeadQualityCsv, type LeadQualityValues } from "@/lib/search-term-optimization/lead-quality-repository";
import { importLeadQuality, updateLeadQuality } from "@/lib/search-term-optimization/supabase-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["pms", "specialist", "admin"]);

export async function PATCH(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.has(session.role)) return NextResponse.json({ error: "Your role cannot edit lead quality." }, { status: 403 });
  const body = await request.json() as { searchTermId?: unknown } & Partial<LeadQualityValues>;
  const searchTermId = String(body.searchTermId ?? "");
  if (!/^\d+:\d+$/.test(searchTermId)) return NextResponse.json({ error: "A valid search-term ID is required." }, { status: 400 });
  try {
    const values = validateValues(body);
    return NextResponse.json(await updateLeadQuality(searchTermId, values));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update lead quality." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.has(session.role)) return NextResponse.json({ error: "Your role cannot import lead quality." }, { status: 403 });
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "A CSV file is required." }, { status: 400 });
    if (file.size > 2_000_000) return NextResponse.json({ error: "CSV files must be 2 MB or smaller." }, { status: 400 });
    const parsed = parseLeadQualityCsv(await file.text());
    if (parsed.rows.length === 0) return NextResponse.json({ updated: 0, errors: parsed.errors }, { status: 400 });
    const result = await importLeadQuality(parsed.rows);
    return NextResponse.json({ updated: result.updated, errors: [...parsed.errors, ...result.errors] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to import lead quality." }, { status: 400 });
  }
}

function validateValues(body: Partial<LeadQualityValues>): LeadQualityValues {
  return {
    qualifiedLeads: count(body.qualifiedLeads), spamLeads: count(body.spamLeads),
    invalidLeads: count(body.invalidLeads), clientComplaints: count(body.clientComplaints),
  };
}

function count(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error("Lead values must be non-negative whole numbers or blank.");
  return number;
}
