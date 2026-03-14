// ============================================================
// E2E Test Script for Building Node Graph System
// Run: npx tsx packages/core/graph/test-graph.ts
// ============================================================

import * as fs from "fs";
import * as path from "path";
import type { ForumResult, GlobalGraph, VerticalNodeGraph } from "./types";
import { buildProgramGraph, mergeVerticalZones } from "./program-graph";
import { buildVerticalNodeGraph } from "./builder";
import { evaluateGraph } from "./metrics";
import { toJSON } from "./operations";

// ============================================================
// 1. Load latest forum result
// ============================================================

function loadLatestForumResult(): { data: ForumResult; filename: string } {
  const resultsDir = path.resolve(__dirname, "../../../forum_results");

  if (!fs.existsSync(resultsDir)) {
    throw new Error(`Forum results directory not found: ${resultsDir}`);
  }

  const files = fs
    .readdirSync(resultsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();

  if (files.length === 0) {
    throw new Error("No forum result files found");
  }

  const latestFile = files[0];
  console.log(`\n=== Loading forum result: ${latestFile} ===\n`);

  const raw = fs.readFileSync(path.join(resultsDir, latestFile), "utf-8");
  return { data: JSON.parse(raw) as ForumResult, filename: latestFile };
}

// ============================================================
// 2. Extract GlobalGraph from forum result
// ============================================================

function extractGlobalGraph(forumResult: ForumResult): GlobalGraph {
  const project = forumResult.project;

  // Extract total floors from constraints
  let totalFloors = 8;
  let basementFloors = 1;

  for (const c of project.constraints) {
    const match = c.match(/(\d+)층\s*규모/);
    if (match) totalFloors = parseInt(match[1]);
  }

  return {
    site: project.site,
    program: project.program,
    constraints: project.constraints,
    total_floors: totalFloors,
    basement_floors: basementFloors,
  };
}

// ============================================================
// 3. Run pipeline
// ============================================================

function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   GIM - Building Node Graph Generator       ║");
  console.log("╚══════════════════════════════════════════════╝");

  // Step 1: Load forum result
  const { data: forumResult, filename } = loadLatestForumResult();

  // Step 2: Extract GlobalGraph
  const global = extractGlobalGraph(forumResult);
  console.log(`Site: ${global.site.location}`);
  console.log(`Total GFA: ${global.program.total_gfa}m²`);
  console.log(`Floors: B${global.basement_floors} ~ ${global.total_floors}F`);
  console.log(`Programs: ${global.program.uses.map((u) => `${u.type}(${(u.ratio * 100).toFixed(0)}%)`).join(", ")}`);

  // Step 3: Build ProgramGraph
  console.log("\n--- Building Program Graph ---");
  const programGraph = buildProgramGraph(forumResult);

  console.log(`ProgramGraph Nodes: ${programGraph.nodes.length}`);
  for (const node of programGraph.nodes) {
    console.log(`  [${node.id}] ${node.program_type} @ ${node.target_zone} (F${node.floor_range[0]}~${node.floor_range[1]}, ${(node.area_ratio * 100).toFixed(0)}%)`);
  }

  console.log(`ProgramGraph Edges: ${programGraph.edges.length}`);
  const edgesByType = new Map<string, number>();
  for (const edge of programGraph.edges) {
    edgesByType.set(edge.type, (edgesByType.get(edge.type) ?? 0) + 1);
  }
  for (const [type, count] of edgesByType) {
    console.log(`  ${type}: ${count}`);
  }

  // Step 4: Merge consensus zones for builder
  const convergenceRound = forumResult.rounds.find((r) => r.phase === "convergence");
  const responses = convergenceRound?.responses ?? forumResult.rounds[forumResult.rounds.length - 1].responses;
  const consensusZones = mergeVerticalZones(responses, global.total_floors);

  // Step 5: Build VerticalNodeGraph
  console.log("\n--- Building Vertical Node Graph ---");
  const verticalGraph = buildVerticalNodeGraph(global, programGraph, consensusZones);

  console.log(`FloorNodes: ${verticalGraph.nodes.length}`);
  console.log(`VoxelEdges: ${verticalGraph.edges.length}`);

  // Edge type breakdown
  const voxelEdgesByType = new Map<string, number>();
  for (const edge of verticalGraph.edges) {
    voxelEdgesByType.set(edge.type, (voxelEdgesByType.get(edge.type) ?? 0) + 1);
  }
  console.log("Edge breakdown:");
  for (const [type, count] of voxelEdgesByType) {
    console.log(`  ${type}: ${count}`);
  }

  // Zone summary
  const nodesByZone = new Map<string, number>();
  for (const node of verticalGraph.nodes) {
    nodesByZone.set(node.floor_zone, (nodesByZone.get(node.floor_zone) ?? 0) + 1);
  }
  console.log("Nodes by zone:");
  for (const [zone, count] of nodesByZone) {
    console.log(`  ${zone}: ${count}`);
  }

  // Step 6: Evaluate
  console.log("\n--- Evaluation Metrics ---");
  const metrics = evaluateGraph(programGraph, verticalGraph);
  console.log(`Connectivity Accuracy:  ${(metrics.connectivity_accuracy * 100).toFixed(1)}%`);
  console.log(`Vertical Continuity:    ${(metrics.vertical_continuity * 100).toFixed(1)}%`);
  console.log(`Zone Coverage:          ${(metrics.zone_coverage * 100).toFixed(1)}%`);
  console.log(`Overall Score:          ${(metrics.overall * 100).toFixed(1)}%`);

  // Step 7: Save output
  const outputDir = path.resolve(__dirname, "../../../graph_output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "vertical_node_graph.json");
  fs.writeFileSync(outputPath, toJSON(verticalGraph), "utf-8");
  console.log(`\nSaved: ${outputPath}`);

  // Step 8: ASCII vertical building diagram
  printAsciiBuilding(verticalGraph);
}

// ============================================================
// ASCII Building Diagram
// ============================================================

function printAsciiBuilding(graph: VerticalNodeGraph) {
  console.log("\n=== Vertical Building Diagram ===\n");

  const nodesByFloor = new Map<number, typeof graph.nodes>();
  for (const node of graph.nodes) {
    if (!nodesByFloor.has(node.floor_level)) nodesByFloor.set(node.floor_level, []);
    nodesByFloor.get(node.floor_level)!.push(node);
  }

  const floors = Array.from(nodesByFloor.keys()).sort((a, b) => b - a); // top to bottom

  const zoneSymbols: Record<string, string> = {
    basement: "B",
    ground: "G",
    lower: "L",
    middle: "M",
    upper: "U",
    penthouse: "P",
    rooftop: "R",
  };

  const funcSymbols: Record<string, string> = {
    elevator_core: "[]",
    stairwell: "||",
    parking: "PP",
    brand_showroom: "BS",
    exhibition_hall: "EH",
    experiential_retail: "ER",
    installation_space: "IS",
    cafe: "CF",
    flagship_store: "FS",
    lobby: "LB",
    atrium: "AT",
    public_void: "VV",
    community_space: "CS",
    event_space: "EV",
    premium_office: "PO",
    open_office: "OO",
    executive_suite: "ES",
    coworking: "CW",
    focus_room: "FR",
    lounge: "LG",
    meditation_room: "MD",
    cafeteria: "CA",
    meeting_room: "MT",
    auditorium: "AU",
    nursery: "NU",
    sky_garden: "SG",
    rooftop_bar: "RB",
    gallery: "GA",
    mechanical_room: "MR",
    electrical_room: "EL",
    server_room: "SR",
    elevator_lobby: "EL",
  };

  for (const floor of floors) {
    const floorNodes = nodesByFloor.get(floor)!;
    const zone = floorNodes[0]?.floor_zone ?? "?";
    const zoneChar = zoneSymbols[zone] ?? "?";

    const floorLabel = floor < 0 ? `B${Math.abs(floor)}` : `${floor}F`;
    const paddedLabel = floorLabel.padStart(4);

    // Exclude infrastructure nodes from display, show spatial program nodes
    const skipFuncs = new Set(["elevator_core", "stairwell", "service_shaft", "elevator_lobby"]);
    const programNodes = floorNodes.filter((n) => !skipFuncs.has(n.function));
    const coreCount = floorNodes.length - programNodes.length;

    // Build compact bar showing all program nodes
    const symbols = programNodes.map((n) => {
      const sym = funcSymbols[n.function] ?? n.function.substring(0, 2).toUpperCase();
      return sym;
    });

    const hasBrand = floorNodes.some((n) => n.function === "brand_showroom" || n.function === "experiential_retail");
    const hasMech = floorNodes.some((n) => n.function === "mechanical_room" || n.function === "electrical_room");

    let marker = " ";
    if (hasBrand) marker = "*";
    else if (hasMech) marker = "~";

    const barContent = symbols.join(" ");
    const bar = `|${marker}${barContent.padEnd(20)}${marker}|`;

    console.log(`${paddedLabel} [${zoneChar}] ${bar} [${coreCount}c+${programNodes.length}p]`);
  }

  console.log("\nLegend: B=basement G=ground L=lower M=middle U=upper P=penthouse R=rooftop");
  console.log("Markers: * brand_experience  ~ mechanical");
}

// ============================================================
// Run
// ============================================================

main();
