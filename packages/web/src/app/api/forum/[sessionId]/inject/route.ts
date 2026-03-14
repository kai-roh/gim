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
  const { message, feedback } = body as { message?: string; feedback?: string };
  const payload = message || feedback;

  if (!payload) {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  // Inject user feedback as a constraint for the next round
  entry.session.context.constraints.push(`[Client Feedback] ${payload}`);

  return NextResponse.json({
    sessionId,
    injected: payload,
    totalConstraints: entry.session.context.constraints.length,
  });
}
