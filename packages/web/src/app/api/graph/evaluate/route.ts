import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { evaluateGraphFull, withResolvedMassModel } from "@gim/core";
import type { SpatialMassGraph } from "@gim/core";

export async function GET() {
  const graphPath = path.resolve(process.cwd(), "../../graph_output/spatial_mass_graph.json");

  if (!fs.existsSync(graphPath)) {
    return NextResponse.json(
      { error: "Graph data not found" },
      { status: 404 }
    );
  }

  const graph: SpatialMassGraph = withResolvedMassModel(
    JSON.parse(fs.readFileSync(graphPath, "utf-8"))
  );
  const result = evaluateGraphFull(graph);

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const graph = withResolvedMassModel((await request.json()) as SpatialMassGraph);
  const result = evaluateGraphFull(graph);
  return NextResponse.json(result);
}
