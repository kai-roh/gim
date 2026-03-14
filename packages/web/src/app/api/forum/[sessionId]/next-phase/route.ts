import { NextResponse } from "next/server";
import { sessionStore } from "@/lib/session-store";
import type { DiscussionPhase } from "@gim/core";

const PHASE_ORDER: DiscussionPhase[] = [
  "proposal",
  "cross_critique",
  "convergence",
];

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const entry = sessionStore.get(sessionId);

  if (!entry) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (entry.status === "running") {
    return NextResponse.json({ error: "Session is running" }, { status: 409 });
  }

  const currentIdx = PHASE_ORDER.indexOf(entry.session.current_phase);
  const nextPhase = PHASE_ORDER[currentIdx + 1];

  if (!nextPhase) {
    return NextResponse.json({
      error: "No more phases",
      currentPhase: entry.session.current_phase,
    }, { status: 400 });
  }

  entry.status = "idle";

  return NextResponse.json({
    sessionId,
    nextPhase,
    streamUrl: `/api/forum/stream?sessionId=${sessionId}&phase=${nextPhase}`,
  });
}
