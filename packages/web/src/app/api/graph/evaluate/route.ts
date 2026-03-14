import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { evaluateGraphFull, evaluateMassGraphFull } from "@gim/core";
import type { VerticalNodeGraph, SpatialMassGraph } from "@gim/core";

export async function GET() {
  const graphOutputPath = path.resolve(process.cwd(), "../../graph_output");

  // Try v2 (SpatialMassGraph) first
  const v2Path = path.join(graphOutputPath, "spatial_mass_graph.json");
  if (fs.existsSync(v2Path)) {
    const graph: SpatialMassGraph = JSON.parse(fs.readFileSync(v2Path, "utf-8"));
    const result = evaluateMassGraphFull(graph);
    return NextResponse.json({ version: 2, ...result });
  }

  // Fall back to v1 (VerticalNodeGraph)
  const v1Path = path.join(graphOutputPath, "vertical_node_graph.json");
  if (!fs.existsSync(v1Path)) {
    return NextResponse.json(
      { error: "Graph data not found" },
      { status: 404 }
    );
  }

  const graph: VerticalNodeGraph = JSON.parse(fs.readFileSync(v1Path, "utf-8"));
  const result = evaluateGraphFull(graph.program, graph);
  return NextResponse.json({ version: 1, ...result });
}
