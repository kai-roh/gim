import { NextResponse } from "next/server";
import * as path from "path";
import * as fs from "fs";

const FORUM_OUTPUT_DIR = path.resolve(process.cwd(), "../../forum_results");
const GRAPH_OUTPUT_DIR = path.resolve(process.cwd(), "../../graph_output");

export interface SessionSummary {
  id: string; // timestamp string (e.g. "2026-03-14T16-55-30")
  timestamp: string;
  location: string;
  company: string;
  panel: string[];
  nodeCount: number;
  edgeCount: number;
  hasGraph: boolean;
}

export async function GET() {
  try {
    if (!fs.existsSync(FORUM_OUTPUT_DIR)) {
      return NextResponse.json([]);
    }

    const files = fs.readdirSync(FORUM_OUTPUT_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    const sessions: SessionSummary[] = [];

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(FORUM_OUTPUT_DIR, file), "utf-8");
        const forum = JSON.parse(raw);
        const id = file.replace(".json", "");

        // Check for matching graph file
        const graphFile = path.join(GRAPH_OUTPUT_DIR, `graph_${id}.json`);
        let nodeCount = 0;
        let edgeCount = 0;
        const hasGraph = fs.existsSync(graphFile);
        if (hasGraph) {
          try {
            const graphRaw = fs.readFileSync(graphFile, "utf-8");
            const graph = JSON.parse(graphRaw);
            nodeCount = graph.nodes?.length ?? 0;
            edgeCount = graph.edges?.length ?? 0;
          } catch {}
        }

        sessions.push({
          id,
          timestamp: id,
          location: forum.context?.site?.location ?? "Unknown",
          company: forum.context?.company?.name ?? "Unknown",
          panel: forum.panel ?? [],
          nodeCount,
          edgeCount,
          hasGraph,
        });
      } catch {
        // skip malformed files
      }
    }

    return NextResponse.json(sessions);
  } catch (err) {
    return NextResponse.json({ error: "Failed to list sessions" }, { status: 500 });
  }
}
