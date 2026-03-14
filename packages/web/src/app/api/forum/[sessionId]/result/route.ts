import { NextResponse } from "next/server";
import { sessionStore } from "@/lib/session-store";
import { sessionToForumResult } from "@gim/core";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const entry = sessionStore.get(sessionId);

  if (!entry) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: entry.status,
    session: sessionToForumResult(entry.session),
  });
}
