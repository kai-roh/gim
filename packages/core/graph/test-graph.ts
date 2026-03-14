// ============================================================
// E2E Test Script for Spatial Mass Graph
// Run: npx tsx packages/core/graph/test-graph.ts
// ============================================================

import * as fs from "fs";
import * as path from "path";
import type { ForumResult } from "./types";
import { buildGraphFromForumResult } from "./program-graph";
import { evaluateGraphFull } from "./evaluation";
import { toJSON } from "./operations";

function loadLatestForumResult(): { data: ForumResult; filename: string } {
  const resultsDir = path.resolve(__dirname, "../../../forum_results");

  if (!fs.existsSync(resultsDir)) {
    throw new Error(`Forum results directory not found: ${resultsDir}`);
  }

  const files = fs
    .readdirSync(resultsDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) {
    throw new Error("No forum result files found");
  }

  const latestFile = files[0];
  const raw = fs.readFileSync(path.join(resultsDir, latestFile), "utf-8");
  return { data: JSON.parse(raw) as ForumResult, filename: latestFile };
}

function main() {
  const { data: forumResult, filename } = loadLatestForumResult();
  console.log(`Loaded forum result: ${filename}`);

  const graph = buildGraphFromForumResult(forumResult);
  console.log(`Nodes: ${graph.nodes.length}`);
  console.log(`Relations: ${graph.relations.length}`);
  console.log(`Concept: ${graph.narrative.overall_architectural_concept}`);

  for (const node of graph.nodes) {
    console.log(
      `- ${node.id}: ${node.kind}/${node.hierarchy} ${node.spatial_role} ` +
        `[${node.geometry.primitive}, ${node.geometry.vertical_placement}]`
    );
  }

  const evaluation = evaluateGraphFull(graph);
  console.log(`Overall: ${(evaluation.overall * 100).toFixed(1)}%`);
  console.log(`Model Readiness: ${(evaluation.model_readiness * 100).toFixed(1)}%`);
  console.log(`Image Readiness: ${(evaluation.image_prompt_readiness * 100).toFixed(1)}%`);

  const outputDir = path.resolve(__dirname, "../../../graph_output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "spatial_mass_graph.json");
  fs.writeFileSync(outputPath, toJSON(graph), "utf-8");
  console.log(`Saved: ${outputPath}`);
}

main();
