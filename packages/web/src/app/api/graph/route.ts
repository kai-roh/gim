import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const GRAPH_OUTPUT_DIR = path.resolve(process.cwd(), "../../graph_output");

export async function GET(request: Request) {
  const url = new URL(request.url);
  const version = url.searchParams.get("version");

  // v2: SpatialMassGraph
  if (version === "2") {
    const massGraphPath = path.join(GRAPH_OUTPUT_DIR, "spatial_mass_graph.json");
    if (fs.existsSync(massGraphPath)) {
      const data = JSON.parse(fs.readFileSync(massGraphPath, "utf-8"));
      return NextResponse.json(data);
    }
    return NextResponse.json(
      { error: "SpatialMassGraph not found." },
      { status: 404 }
    );
  }

  // v1: VerticalNodeGraph (default)
  const graphPath = path.join(GRAPH_OUTPUT_DIR, "vertical_node_graph.json");
  if (!fs.existsSync(graphPath)) {
    return NextResponse.json(
      { error: "Graph data not found. Run `npm run graph` first." },
      { status: 404 }
    );
  }

  const data = JSON.parse(fs.readFileSync(graphPath, "utf-8"));
  return NextResponse.json(data);
}
