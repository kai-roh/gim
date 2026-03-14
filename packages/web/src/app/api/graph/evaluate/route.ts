import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { evaluateGraphFull } from "@gim/core";
import type { VerticalNodeGraph } from "@gim/core";

export async function GET() {
  const graphPath = path.resolve(process.cwd(), "../../graph_output/vertical_node_graph.json");

  if (!fs.existsSync(graphPath)) {
    return NextResponse.json(
      { error: "Graph data not found" },
      { status: 404 }
    );
  }

  const graph: VerticalNodeGraph = JSON.parse(fs.readFileSync(graphPath, "utf-8"));
  const result = evaluateGraphFull(graph.program, graph);

  return NextResponse.json(result);
}
