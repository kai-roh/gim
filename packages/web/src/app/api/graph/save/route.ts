import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { withResolvedMassModel } from "@gim/core/graph/resolved-model";

export async function POST(request: NextRequest) {
  const graphPath = path.resolve(process.cwd(), "../../graph_output/spatial_mass_graph.json");
  const backupPath = graphPath + ".backup";

  try {
    const graph = withResolvedMassModel(await request.json());

    // Create backup before overwriting
    if (fs.existsSync(graphPath)) {
      fs.copyFileSync(graphPath, backupPath);
    }

    fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), "utf-8");

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Save failed" },
      { status: 500 }
    );
  }
}
