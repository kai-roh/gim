import { NextResponse } from "next/server";
import * as path from "path";
import * as fs from "fs";

const GRAPH_OUTPUT_DIR = path.resolve(process.cwd(), "../../graph_output");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const graphFile = path.join(GRAPH_OUTPUT_DIR, `graph_${id}.json`);
  if (!fs.existsSync(graphFile)) {
    return NextResponse.json({ error: "Graph not found for this session" }, { status: 404 });
  }

  try {
    const raw = fs.readFileSync(graphFile, "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to read graph";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
