import { NextResponse } from "next/server";
import * as path from "path";
import * as fs from "fs";
import { buildGraphFromForumResult, withResolvedMassModel } from "@gim/core";

const FORUM_OUTPUT_DIR = path.resolve(process.cwd(), "../../forum_results");
const GRAPH_OUTPUT_DIR = path.resolve(process.cwd(), "../../graph_output");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Try loading saved graph first
  const graphFile = path.join(GRAPH_OUTPUT_DIR, `graph_${id}.json`);
  if (fs.existsSync(graphFile)) {
    try {
      const raw = fs.readFileSync(graphFile, "utf-8");
      return NextResponse.json(withResolvedMassModel(JSON.parse(raw)));
    } catch {}
  }

  // Fallback: regenerate from forum result
  const forumFile = path.join(FORUM_OUTPUT_DIR, `${id}.json`);
  if (!fs.existsSync(forumFile)) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    const raw = fs.readFileSync(forumFile, "utf-8");
    const forumResult = JSON.parse(raw);
    const graph = withResolvedMassModel(buildGraphFromForumResult(forumResult));

    // Save for future loads
    if (!fs.existsSync(GRAPH_OUTPUT_DIR)) fs.mkdirSync(GRAPH_OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(graphFile, JSON.stringify(graph, null, 2), "utf-8");

    return NextResponse.json(graph);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load session graph";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
