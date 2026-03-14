import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export async function GET() {
  const graphPath = path.resolve(process.cwd(), "../../graph_output/vertical_node_graph.json");

  if (!fs.existsSync(graphPath)) {
    return NextResponse.json(
      { error: "Graph data not found. Run `npm run graph` first." },
      { status: 404 }
    );
  }

  const data = JSON.parse(fs.readFileSync(graphPath, "utf-8"));
  return NextResponse.json(data);
}
