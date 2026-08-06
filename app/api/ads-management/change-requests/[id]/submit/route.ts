import { NextResponse } from "next/server";
import { submitChangeSetForReview } from "@/lib/ads-management/service";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const body = await request.json() as { actorName?: string }; return NextResponse.json(await submitChangeSetForReview((await params).id, body.actorName || "Unknown user")); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Submission failed." }, { status: 400 }); } }
