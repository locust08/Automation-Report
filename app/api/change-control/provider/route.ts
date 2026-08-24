import { NextResponse } from "next/server";
import { PROVIDER_EXECUTION_LOCKED } from "@/lib/change-control/types";

export async function POST() {
  return NextResponse.json(PROVIDER_EXECUTION_LOCKED, { status: 423 });
}
