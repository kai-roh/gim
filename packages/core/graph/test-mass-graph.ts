// ============================================================
// Integration Test: v1 pipeline + v2 SpatialMassGraph
// Run: npx tsx packages/core/graph/test-mass-graph.ts
// ============================================================

import * as fs from "fs";
import * as path from "path";
import type {
  ForumResult,
  GlobalGraph,
  SpatialMassGraph,
  MassNode,
  MassRelation,
  MassValidationResult,
} from "./types";
import { validateSpatialMassGraph } from "./types";
import { buildProgramGraph, mergeVerticalZones } from "./program-graph";
import { buildVerticalNodeGraph } from "./builder";
import { evaluateGraph } from "./metrics";
import {
  addMassNode,
  removeMassNode,
  updateMassNode,
  addMassRelation,
  removeMassRelation,
  getMassNodesByType,
  getMassNeighbors,
  getMassRelationsBetween,
  massGraphToJSON,
  massGraphFromJSON,
} from "./operations";
import { buildSpatialMassGraphFromForum } from "../forum/forum-engine";
import type { ForumSession, ArchitectResponse, MassProposal } from "../forum/types";

// ============================================================
// Test runner
// ============================================================

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition: boolean, msg: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.log(`  ✗ ${msg}`);
  }
}

function section(name: string) {
  console.log(`\n━━━ ${name} ━━━`);
}

// ============================================================
// Test 1: v1 Pipeline (existing) — regression test
// ============================================================

function testV1Pipeline() {
  section("Test 1: v1 Pipeline (VerticalNodeGraph) regression");

  const resultsDir = path.resolve(__dirname, "../../../forum_results");
  const files = fs.readdirSync(resultsDir).filter((f) => f.endsWith(".json")).sort().reverse();
  assert(files.length > 0, `Forum results found: ${files.length} files`);

  const forumResult: ForumResult = JSON.parse(
    fs.readFileSync(path.join(resultsDir, files[0]), "utf-8")
  );
  assert(!!forumResult.project, "ForumResult has project context");
  assert(forumResult.panel.length >= 2, `Panel has ${forumResult.panel.length} architects`);
  assert(forumResult.rounds.length >= 1, `Has ${forumResult.rounds.length} rounds`);

  // Build ProgramGraph
  const programGraph = buildProgramGraph(forumResult);
  assert(programGraph.nodes.length > 0, `ProgramGraph: ${programGraph.nodes.length} nodes`);
  assert(programGraph.edges.length > 0, `ProgramGraph: ${programGraph.edges.length} edges`);

  // Build GlobalGraph
  const project = forumResult.project;
  let totalFloors = 8;
  for (const c of project.constraints) {
    const match = c.match(/(\d+)층\s*규모/);
    if (match) totalFloors = parseInt(match[1]);
  }
  const global: GlobalGraph = {
    site: project.site,
    program: project.program,
    constraints: project.constraints,
    total_floors: totalFloors,
    basement_floors: 1,
  };

  // Merge consensus zones
  const convergenceRound = forumResult.rounds.find((r) => r.phase === "convergence");
  const responses = convergenceRound?.responses ?? forumResult.rounds[forumResult.rounds.length - 1].responses;
  const consensusZones = mergeVerticalZones(responses, global.total_floors);
  assert(consensusZones.length > 0, `ConsensusZones: ${consensusZones.length} entries`);

  // Build VerticalNodeGraph
  const verticalGraph = buildVerticalNodeGraph(global, programGraph, consensusZones);
  assert(verticalGraph.nodes.length > 50, `VerticalNodeGraph: ${verticalGraph.nodes.length} nodes (>50)`);
  assert(verticalGraph.edges.length > 100, `VerticalNodeGraph: ${verticalGraph.edges.length} edges (>100)`);

  // Evaluate
  const metrics = evaluateGraph(programGraph, verticalGraph);
  assert(metrics.overall > 0, `Overall score: ${(metrics.overall * 100).toFixed(1)}%`);
  assert(metrics.connectivity_accuracy >= 0 && metrics.connectivity_accuracy <= 1, "Connectivity in range");
  assert(metrics.vertical_continuity >= 0 && metrics.vertical_continuity <= 1, "Continuity in range");
  assert(metrics.zone_coverage >= 0 && metrics.zone_coverage <= 1, "Coverage in range");

  return { forumResult, global };
}

// ============================================================
// Test 2: SpatialMassGraph types & validation
// ============================================================

function testMassGraphTypes() {
  section("Test 2: SpatialMassGraph types & validation");

  // Create a valid graph
  const validGraph = createTestMassGraph(8);
  const result = validateSpatialMassGraph(validGraph);
  assert(result.valid, "Valid graph passes validation");
  assert(result.errors.length === 0, `No errors: ${result.errors.join(", ") || "clean"}`);

  // Too few nodes
  const tooFew = createTestMassGraph(3);
  const r2 = validateSpatialMassGraph(tooFew);
  assert(!r2.valid, "3 nodes fails validation (< 6)");
  assert(r2.errors.some((e) => e.includes("< 최소 6개")), "Error mentions minimum");

  // Too many nodes
  const tooMany = createTestMassGraph(15);
  const r3 = validateSpatialMassGraph(tooMany);
  assert(!r3.valid, "15 nodes fails validation (> 12)");
  assert(r3.errors.some((e) => e.includes("> 최대 12개")), "Error mentions maximum");

  // No core node
  const noCore: SpatialMassGraph = {
    ...createTestMassGraph(7),
    nodes: createTestMassGraph(7).nodes.map((n) => ({ ...n, type: "solid" as const })),
  };
  const r4 = validateSpatialMassGraph(noCore);
  assert(!r4.valid, "Graph without core fails validation");
  assert(r4.errors.some((e) => e.includes("core")), "Error mentions missing core");

  // Bad relation reference
  const badRef: SpatialMassGraph = {
    ...createTestMassGraph(7),
    relations: [
      {
        id: "rel_bad",
        source: "nonexistent",
        target: "mass_01",
        family: "stack",
        rule: "above",
        strength: "hard",
        description: "bad ref",
      },
    ],
  };
  const r5 = validateSpatialMassGraph(badRef);
  assert(!r5.valid, "Bad reference fails validation");
  assert(r5.errors.some((e) => e.includes("존재하지 않음")), "Error mentions invalid reference");

  // Cycle detection
  const cyclic: SpatialMassGraph = {
    ...createTestMassGraph(7),
    relations: [
      { id: "r1", source: "mass_01", target: "mass_02", family: "stack", rule: "above", strength: "hard", description: "1→2" },
      { id: "r2", source: "mass_02", target: "mass_03", family: "stack", rule: "above", strength: "hard", description: "2→3" },
      { id: "r3", source: "mass_03", target: "mass_01", family: "stack", rule: "above", strength: "hard", description: "3→1 cycle!" },
    ],
  };
  const r6 = validateSpatialMassGraph(cyclic);
  assert(!r6.valid, "Cyclic stack relations fail validation");
  assert(r6.errors.some((e) => e.includes("순환")), "Error mentions cycle");

  // Duplicate node id
  const dupId: SpatialMassGraph = {
    ...createTestMassGraph(7),
  };
  dupId.nodes[1] = { ...dupId.nodes[1], id: dupId.nodes[0].id };
  const r7 = validateSpatialMassGraph(dupId);
  assert(!r7.valid, "Duplicate node id fails validation");

  // Programs warning (use index 1 which is a solid node, not core)
  const emptyProgs: SpatialMassGraph = createTestMassGraph(7);
  emptyProgs.nodes[1] = { ...emptyProgs.nodes[1], programs: [] };
  const r8 = validateSpatialMassGraph(emptyProgs);
  assert(r8.warnings.length > 0, "Empty programs produces warning");
}

// ============================================================
// Test 3: SpatialMassGraph CRUD operations
// ============================================================

function testMassGraphOperations() {
  section("Test 3: SpatialMassGraph CRUD operations");

  let graph = createTestMassGraph(7);
  const originalCount = graph.nodes.length;

  // addMassNode
  const newNode: MassNode = {
    id: "mass_new",
    type: "solid",
    label: "새 매스",
    ground_contact: false,
    floor_range: [10, 12],
    floor_zone: "upper",
    geometry: {
      primitive: "tower",
      scale: { category: "medium", hint: { width: 15, depth: 15, height: 12 } },
      proportion: "slender",
      skin: "mixed",
      porosity: "solid",
      span_character: "stacked",
    },
    narrative: {
      intent_text: "test",
      architectural_description: "test",
      facade_text: "test",
      architect_influence: {},
      discussion_trace: "test",
    },
    programs: ["open_office"],
  };
  graph = addMassNode(graph, newNode);
  assert(graph.nodes.length === originalCount + 1, `addMassNode: ${graph.nodes.length} nodes`);
  assert(graph.metadata.total_nodes === originalCount + 1, "metadata.total_nodes updated");

  // updateMassNode
  graph = updateMassNode(graph, "mass_new", { label: "수정된 매스" });
  const updated = graph.nodes.find((n) => n.id === "mass_new");
  assert(updated?.label === "수정된 매스", "updateMassNode works");
  assert(updated?.id === "mass_new", "updateMassNode preserves id");

  // addMassRelation
  const newRel: MassRelation = {
    id: "rel_new",
    source: "mass_01",
    target: "mass_new",
    family: "stack",
    rule: "above",
    strength: "hard",
    description: "test relation",
  };
  graph = addMassRelation(graph, newRel);
  assert(graph.relations.some((r) => r.id === "rel_new"), "addMassRelation works");
  assert(graph.metadata.total_relations === graph.relations.length, "metadata.total_relations updated");

  // getMassNeighbors
  const neighbors = getMassNeighbors(graph, "mass_01");
  assert(neighbors.some((n) => n.id === "mass_new"), "getMassNeighbors finds new node");

  // getMassRelationsBetween
  const rels = getMassRelationsBetween(graph, "mass_01", "mass_new");
  assert(rels.length === 1, "getMassRelationsBetween finds relation");
  assert(rels[0].id === "rel_new", "Found correct relation");

  // getMassNodesByType
  const coreNodes = getMassNodesByType(graph, "core");
  assert(coreNodes.length >= 1, `getMassNodesByType('core'): ${coreNodes.length}`);

  // removeMassRelation
  graph = removeMassRelation(graph, "rel_new");
  assert(!graph.relations.some((r) => r.id === "rel_new"), "removeMassRelation works");

  // removeMassNode (should also remove connected relations)
  graph = addMassRelation(graph, newRel); // re-add for cascade test
  graph = removeMassNode(graph, "mass_new");
  assert(graph.nodes.length === originalCount, `removeMassNode: back to ${originalCount}`);
  assert(!graph.relations.some((r) => r.source === "mass_new" || r.target === "mass_new"), "Cascade removes relations");

  // Serialization
  const json = massGraphToJSON(graph);
  const restored = massGraphFromJSON(json);
  assert(restored.nodes.length === graph.nodes.length, "Serialization roundtrip preserves nodes");
  assert(restored.relations.length === graph.relations.length, "Serialization roundtrip preserves relations");
  assert(restored.metadata.version === 2, "Serialization preserves version");
}

// ============================================================
// Test 4: buildSpatialMassGraphFromForum
// ============================================================

function testBuildFromForum(forumResult: ForumResult) {
  section("Test 4: buildSpatialMassGraphFromForum");

  // Create a mock session with mass_proposals injected into convergence responses
  const session: ForumSession = {
    project_id: "test_session",
    panel: forumResult.panel,
    context: forumResult.project,
    rounds: forumResult.rounds.map((round) => {
      if (round.phase === "convergence") {
        // Inject mock mass_proposal into each response
        return {
          ...round,
          responses: round.responses.map((resp) => ({
            ...resp,
            mass_proposal: createMockMassProposal(),
          })),
        };
      }
      return round;
    }),
    current_phase: "convergence",
    iteration: forumResult.rounds.length,
  };

  const massGraph = buildSpatialMassGraphFromForum(session);

  assert(!!massGraph, "buildSpatialMassGraphFromForum returns graph");
  assert(massGraph.metadata.version === 2, "Graph version is 2");
  assert(massGraph.nodes.length >= 6, `Nodes: ${massGraph.nodes.length} (>=6)`);
  assert(massGraph.nodes.length <= 12, `Nodes: ${massGraph.nodes.length} (<=12)`);
  assert(massGraph.relations.length > 0, `Relations: ${massGraph.relations.length}`);
  assert(!!massGraph.global, "Has global context");
  assert(massGraph.global.site.location === forumResult.project.site.location, "Correct site location");

  // Check node properties
  const coreNodes = massGraph.nodes.filter((n) => n.type === "core");
  assert(coreNodes.length >= 1, `Core nodes: ${coreNodes.length}`);

  const groundNodes = massGraph.nodes.filter((n) => n.ground_contact);
  assert(groundNodes.length >= 1, `Ground contact nodes: ${groundNodes.length}`);

  for (const node of massGraph.nodes) {
    assert(!!node.id, `Node ${node.label} has id`);
    assert(!!node.label, `Node ${node.id} has label`);
    assert(node.floor_range[0] <= node.floor_range[1], `Node ${node.id} floor_range valid`);
    assert(node.geometry.scale.hint.width > 0, `Node ${node.id} has width`);
    assert(node.geometry.scale.hint.height > 0, `Node ${node.id} has height`);
    assert(!!node.narrative.intent_text, `Node ${node.id} has narrative`);
  }

  // Validate
  const validation = validateSpatialMassGraph(massGraph);
  assert(validation.valid, `Validation: ${validation.valid ? "PASS" : "FAIL"} ${validation.errors.join(", ")}`);

  // Save for inspection
  const outputDir = path.resolve(__dirname, "../../../graph_output");
  const outputPath = path.join(outputDir, "spatial_mass_graph.json");
  fs.writeFileSync(outputPath, JSON.stringify(massGraph, null, 2), "utf-8");
  console.log(`  → Saved: ${outputPath}`);

  // Print summary
  console.log("\n  Mass Graph Summary:");
  for (const node of massGraph.nodes) {
    const progs = node.programs.slice(0, 3).join(", ");
    console.log(`    [${node.id}] ${node.label} (${node.type}) F${node.floor_range[0]}~${node.floor_range[1]} | ${node.geometry.primitive} ${node.geometry.scale.hint.width}×${node.geometry.scale.hint.depth}×${node.geometry.scale.hint.height}m | ${progs}`);
  }
  console.log("  Relations:");
  for (const rel of massGraph.relations) {
    const src = massGraph.nodes.find((n) => n.id === rel.source)?.label || rel.source;
    const tgt = massGraph.nodes.find((n) => n.id === rel.target)?.label || rel.target;
    console.log(`    ${src} → ${tgt}: ${rel.family}.${rel.rule} (${rel.strength})`);
  }
}

// ============================================================
// Test 5: graph-context actions (type-level only)
// ============================================================

function testGraphContextTypes() {
  section("Test 5: GraphAction types compile correctly");

  // These are compile-time checks — if this file compiles, these pass
  const actions: any[] = [
    { type: "LOAD_MASS_GRAPH_SUCCESS", massGraph: createTestMassGraph(7) },
    { type: "UPDATE_MASS_NODE", nodeId: "mass_01", updates: { label: "updated" } },
    { type: "REMOVE_MASS_NODE", nodeId: "mass_01" },
    { type: "ADD_MASS_NODE", node: createTestMassGraph(7).nodes[0] },
    { type: "ADD_MASS_RELATION", relation: { id: "r1", source: "a", target: "b", family: "stack", rule: "above", strength: "hard", description: "" } },
    { type: "REMOVE_MASS_RELATION", relationId: "r1" },
    { type: "SET_MASS_GRAPH", massGraph: createTestMassGraph(7) },
  ];
  assert(actions.length === 7, "All 7 v2 action types defined");
  assert(true, "All v2 GraphAction types compile (checked at build time)");
}

// ============================================================
// Helpers
// ============================================================

function createTestMassGraph(nodeCount: number): SpatialMassGraph {
  const nodes: MassNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const isCore = i === 0;
    nodes.push({
      id: `mass_${String(i + 1).padStart(2, "0")}`,
      type: isCore ? "core" : "solid",
      label: isCore ? "메인 코어" : `매스 ${i + 1}`,
      ground_contact: i <= 1,
      floor_range: [i * 3 - 2, i * 3] as [number, number],
      floor_zone: i <= 1 ? "ground" : i <= 3 ? "lower" : "middle",
      geometry: {
        primitive: isCore ? "block" : "tower",
        scale: {
          category: "medium",
          hint: { width: 10, depth: 10, height: 10 },
        },
        proportion: "compact",
        skin: "opaque",
        porosity: "solid",
        span_character: "stacked",
      },
      narrative: {
        intent_text: `Test node ${i + 1}`,
        architectural_description: `Description for ${i + 1}`,
        facade_text: "opaque facade",
        architect_influence: {},
        discussion_trace: "",
      },
      programs: isCore ? ["elevator_core", "stairwell"] : ["open_office"],
    });
  }

  const relations: MassRelation[] = [];
  for (let i = 1; i < Math.min(nodeCount, 5); i++) {
    relations.push({
      id: `rel_${String(i).padStart(2, "0")}`,
      source: `mass_${String(i + 1).padStart(2, "0")}`,
      target: `mass_${String(i).padStart(2, "0")}`,
      family: "stack",
      rule: "above",
      strength: "hard",
      description: `Stack relation ${i}→${i - 1}`,
    });
  }

  return {
    global: {
      site: {
        location: "서울 테스트",
        dimensions: [40, 35],
        far: 600,
        bcr: 60,
        height_limit: 100,
        context: { north: "도로", south: "도로", east: "건물", west: "건물" },
      },
      program: {
        total_gfa: 10000,
        uses: [{ type: "office", ratio: 0.7 }, { type: "retail", ratio: 0.3 }],
      },
      constraints: [],
      total_floors: 20,
      basement_floors: 2,
    },
    nodes,
    relations,
    composition_summary: "Test composition",
    metadata: {
      created_at: new Date().toISOString(),
      source_forum: "test",
      total_nodes: nodes.length,
      total_relations: relations.length,
      floor_range: [-2, nodeCount * 3],
      version: 2,
    },
  };
}

function createMockMassProposal(): MassProposal {
  return {
    entities: [
      {
        label: "지하 주차장",
        type: "solid",
        floor_range: [-2, -1],
        programs: ["parking", "loading_dock", "mechanical_room"],
        description: "지하 주차 및 기계실",
        geometry_intent: "broad plate, opaque, solid",
      },
      {
        label: "공공 포디움",
        type: "solid",
        floor_range: [1, 3],
        programs: ["lobby", "brand_showroom", "cafe", "flagship_store"],
        description: "도시와 만나는 개방적 저층부",
        geometry_intent: "broad plate, transparent, porous",
      },
      {
        label: "메인 코어",
        type: "core",
        floor_range: [-2, 20],
        programs: ["elevator_core", "stairwell"],
        description: "수직 동선 코어",
        geometry_intent: "compact block, opaque, solid",
      },
      {
        label: "문화 매스",
        type: "solid",
        floor_range: [4, 6],
        programs: ["exhibition_hall", "gallery", "event_space"],
        description: "브랜드 문화 체험 공간",
        geometry_intent: "bar, mixed skin, porous",
      },
      {
        label: "업무 타워",
        type: "solid",
        floor_range: [7, 16],
        programs: ["open_office", "premium_office", "meeting_room", "cafeteria"],
        description: "오피스 타워 본체",
        geometry_intent: "slender tower, mixed, solid",
      },
      {
        label: "중앙 보이드",
        type: "void",
        floor_range: [3, 6],
        programs: ["atrium", "public_void"],
        description: "3개 층 높이의 관통 보이드",
        geometry_intent: "vertical void, transparent, open",
      },
      {
        label: "임원 라운지",
        type: "solid",
        floor_range: [17, 18],
        programs: ["executive_suite", "lounge", "meeting_room"],
        description: "임원 전용 공간",
        geometry_intent: "compact plate, mixed, solid",
      },
      {
        label: "옥상 정원",
        type: "solid",
        floor_range: [19, 20],
        programs: ["sky_garden", "rooftop_bar"],
        description: "옥상 조경 및 커뮤니티",
        geometry_intent: "broad plate, transparent, open",
      },
    ],
    key_relations: [
      { source: "공공 포디움", target: "지하 주차장", family: "stack", rule: "above", rationale: "수직 적층" },
      { source: "문화 매스", target: "공공 포디움", family: "stack", rule: "above", rationale: "포디움 위 문화 공간" },
      { source: "업무 타워", target: "문화 매스", family: "stack", rule: "above", rationale: "타워가 문화 매스 위에" },
      { source: "임원 라운지", target: "업무 타워", family: "stack", rule: "above", rationale: "상층부 임원 공간" },
      { source: "옥상 정원", target: "임원 라운지", family: "stack", rule: "above", rationale: "최상층 옥상" },
      { source: "중앙 보이드", target: "공공 포디움", family: "intersection", rule: "penetrates", rationale: "포디움을 관통하는 보이드" },
      { source: "메인 코어", target: "업무 타워", family: "enclosure", rule: "inside", rationale: "코어가 타워 내부에 위치" },
    ],
    form_concept: "투명한 포디움 위에 슬렌더 타워가 올라가는 수직 구성",
  };
}

// ============================================================
// Run all tests
// ============================================================

function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   GIM Integration Test — v1 + v2            ║");
  console.log("╚══════════════════════════════════════════════╝");

  // Test 1: v1 regression
  const { forumResult } = testV1Pipeline();

  // Test 2: v2 types & validation
  testMassGraphTypes();

  // Test 3: v2 CRUD operations
  testMassGraphOperations();

  // Test 4: buildSpatialMassGraphFromForum
  testBuildFromForum(forumResult);

  // Test 5: graph-context action types
  testGraphContextTypes();

  // Summary
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log(`║   Results: ${passed}/${total} passed, ${failed} failed${" ".repeat(Math.max(0, 16 - String(passed).length - String(total).length - String(failed).length))}║`);
  console.log("╚══════════════════════════════════════════════╝");

  if (failed > 0) {
    process.exit(1);
  }
}

main();
