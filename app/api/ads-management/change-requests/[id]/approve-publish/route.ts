import { NextResponse } from "next/server";
import { approvePublishVerify } from "@/lib/ads-management/service";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { const body = await request.json() as { approverName?: string; comment?: string }; return NextResponse.json(await approvePublishVerify((await params).id, body.approverName || "", body.comment || "")); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Approval and publishing failed." }, { status: 400 }); } }
