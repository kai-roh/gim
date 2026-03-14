import { NextResponse } from "next/server";
import { sessionStore } from "@/lib/session-store";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const entry = sessionStore.get(sessionId);

  if (!entry) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const body = await request.json();
  const { message } = body as { message: string };

  if (!message) {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  // Inject user feedback as a constraint for the next round
  entry.session.context.constraints.push(`[Client Feedback] ${message}`);

  return NextResponse.json({
    sessionId,
    injected: message,
    totalConstraints: entry.session.context.constraints.length,
  });
}
