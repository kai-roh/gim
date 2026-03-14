import { sessionStore } from "@/lib/session-store";
import {
  runPhaseStreaming,
  sessionToForumResult,
  buildGraphFromForumResult,
} from "@gim/core";
import type { DiscussionPhase } from "@gim/core";
import * as path from "path";
import * as fs from "fs";

const DATA_DIR = path.resolve(process.cwd(), "../../data");
const FORUM_OUTPUT_DIR = path.resolve(process.cwd(), "../../forum_results");
const GRAPH_OUTPUT_DIR = path.resolve(process.cwd(), "../../graph_output");

function kstTimestamp(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function saveForumResult(session: any, timestamp: string) {
  try {
    if (!fs.existsSync(FORUM_OUTPUT_DIR)) fs.mkdirSync(FORUM_OUTPUT_DIR, { recursive: true });
    const filePath = path.join(FORUM_OUTPUT_DIR, `${timestamp}.json`);
    const forumResult = sessionToForumResult(session);
    fs.writeFileSync(filePath, JSON.stringify(forumResult, null, 2), "utf-8");
    return filePath;
  } catch { return null; }
}

function saveGraphOutput(graph: any, timestamp: string) {
  try {
    if (!fs.existsSync(GRAPH_OUTPUT_DIR)) fs.mkdirSync(GRAPH_OUTPUT_DIR, { recursive: true });
    const filePath = path.join(GRAPH_OUTPUT_DIR, `graph_${timestamp}.json`);
    const data = JSON.stringify(graph, null, 2);
    fs.writeFileSync(filePath, data, "utf-8");
    fs.writeFileSync(path.join(GRAPH_OUTPUT_DIR, "spatial_mass_graph.json"), data, "utf-8");
    return filePath;
  } catch { return null; }
}

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
          ? [...entry.currentPhaseResponses]
          : undefined;
        const phaseResponses: { id: string; response: any }[] = [];

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
              phaseResponses.push({ id: architectId, response });
              send("forum:architect_complete", { architectId, response });
            },
            onPhaseComplete: (phaseCompleted, responses) => {
              send("forum:phase_complete", { phase: phaseCompleted, responses });
            },
          },
          previousResponses,
          { dataDir: DATA_DIR }
        );
        entry.currentPhaseResponses = phaseResponses;

        // Generate graph from forum results
        try {
          const forumResult = sessionToForumResult(entry.session);
          const graph = buildGraphFromForumResult(forumResult);
          send("forum:graph_generated", { graph });

          // Save to disk only on final phase (convergence)
          if (phase === "convergence") {
            const ts = kstTimestamp();
            const forumPath = saveForumResult(entry.session, ts);
            const graphPath = saveGraphOutput(graph, ts);
            send("forum:saved", {
              forumPath: forumPath ? path.basename(forumPath) : null,
              graphPath: graphPath ? path.basename(graphPath) : null,
            });
          }
        } catch (graphErr) {
          const msg = graphErr instanceof Error ? graphErr.message : "Graph generation failed";
          send("forum:graph_error", { error: msg });
        }

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
