import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export async function POST(request: NextRequest) {
  const graphPath = path.resolve(process.cwd(), "../../graph_output");

  try {
    const data = await request.json();

    // Detect version
    const isV2 = data.metadata?.version === 2;
    const filename = isV2 ? "spatial_mass_graph.json" : "vertical_node_graph.json";
    const filePath = path.join(graphPath, filename);
    const backupPath = filePath + ".backup";

    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupPath);
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return NextResponse.json({ success: true, file: filename });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Save failed" },
      { status: 500 }
    );
  }
}
