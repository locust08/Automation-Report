import { NextResponse } from "next/server";

import { isNotionIntegrationError } from "@/lib/reporting/notion";

export function buildReportingErrorResponse(
  error: unknown,
  fallbackMessage: string
): NextResponse {
  if (isNotionIntegrationError(error)) {
    return NextResponse.json(error.payload, { status: error.httpStatus });
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return NextResponse.json({ error: message }, { status: 500 });
}
