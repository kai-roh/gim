import { sessionStore } from "@/lib/session-store";
import { runPhaseStreaming, buildPanel } from "@gim/core";
import type { ArchitectResponse, DiscussionPhase } from "@gim/core";
import * as path from "path";

const DATA_DIR = path.resolve(process.cwd(), "../../data");

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  const phase = url.searchParams.get("phase") as DiscussionPhase | null;

  if (!sessionId || !phase) {
    return new Response("Missing sessionId or phase", { status: 400 });
  }

  const entry = sessionStore.get(sessionId);
  if (!entry) {
    return new Response("Session not found", { status: 404 });
  }

  if (entry.status === "running") {
    return new Response("Session already running", { status: 409 });
  }

  entry.status = "running";
  const abortController = new AbortController();
  entry.abortController = abortController;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: any) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      try {
        const previousResponses = entry.currentPhaseResponses.length > 0
          ? entry.currentPhaseResponses
          : undefined;

        await runPhaseStreaming(
          entry.session,
          phase,
          {
            onArchitectStart: (architectId) => {
              send("forum:architect_started", { architectId, phase });
            },
            onToken: (architectId, token) => {
              send("forum:token", { architectId, token });
            },
            onArchitectComplete: (architectId, response) => {
              entry.currentPhaseResponses.push({ id: architectId, response });
              send("forum:architect_complete", { architectId, response });
            },
            onPhaseComplete: (phase, responses) => {
              send("forum:phase_complete", { phase, responses });
            },
          },
          previousResponses,
          { dataDir: DATA_DIR }
        );

        entry.status = "completed";
        send("forum:done", { phase, sessionId });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        entry.status = "error";
        entry.error = message;
        send("forum:error", { error: message });
      } finally {
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
      entry.status = "idle";
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
