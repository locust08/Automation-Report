import { NextResponse } from "next/server";

export function movedToM03Response() {
  return NextResponse.json({ error: "moved_to_m03", message: "Google Ads changes now use M03 Change Control.", location: "/change-control?open=new&platform=google" }, { status: 410 });
}
