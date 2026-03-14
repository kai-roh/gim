// ============================================================
// Graph Evaluation Metrics
// ============================================================

import type {
  ProgramGraph,
  VerticalNodeGraph,
  FloorNode,
  VoxelEdge,
} from "./types";

export interface GraphMetrics {
  connectivity_accuracy: number;
  vertical_continuity: number;
  zone_coverage: number;
  overall: number;
}

// ============================================================
// Connectivity Accuracy
// Measures how many positive program edges are satisfied in the voxel graph
// ============================================================

export function connectivityAccuracy(
  program: ProgramGraph,
  voxel: VerticalNodeGraph
): number {
  const positiveEdges = program.edges.filter((e) => e.type === "ADJACENCY_POSITIVE");
  if (positiveEdges.length === 0) return 1.0;

  let satisfied = 0;

  for (const pe of positiveEdges) {
    const sourceProgram = program.nodes.find((n) => n.id === pe.source);
    const targetProgram = program.nodes.find((n) => n.id === pe.target);
    if (!sourceProgram || !targetProgram) continue;

    const sourceNodes = voxel.nodes.filter((n) => n.function === sourceProgram.program_type);
    const targetNodes = voxel.nodes.filter((n) => n.function === targetProgram.program_type);

    const sourceIds = new Set(sourceNodes.map((n) => n.id));
    const targetIds = new Set(targetNodes.map((n) => n.id));

    // Direct connection: same floor adjacency or stacked
    const hasDirectConnection = voxel.edges.some(
      (e) =>
        (e.type === "ADJACENT_TO" || e.type === "STACKED_ON" || e.type === "PROGRAM_LINK") &&
        ((sourceIds.has(e.source) && targetIds.has(e.target)) ||
          (sourceIds.has(e.target) && targetIds.has(e.source)))
    );

    // Zone proximity: source and target are in adjacent/overlapping zones
    const sourceZones = new Set(sourceNodes.map((n) => n.floor_zone));
    const targetZones = new Set(targetNodes.map((n) => n.floor_zone));
    const shareZone = [...sourceZones].some((z) => targetZones.has(z));

    // Floor proximity: any source node within 3 floors of any target node
    const hasFloorProximity = sourceNodes.some((s) =>
      targetNodes.some((t) => Math.abs(s.floor_level - t.floor_level) <= 3)
    );

    if (hasDirectConnection || shareZone || hasFloorProximity) satisfied++;
  }

  return round3(satisfied / positiveEdges.length);
}

// ============================================================
// Vertical Continuity Score
// Measures core/shaft vertical alignment across floors
// ============================================================

export function verticalContinuityScore(
  _program: ProgramGraph,
  voxel: VerticalNodeGraph
): number {
  const coreNodes = voxel.nodes.filter(
    (n) => n.function === "elevator_core" || n.function === "stairwell" || n.function === "service_shaft"
  );

  if (coreNodes.length === 0) return 0;

  // Group core nodes by function
  const coreByFunc = new Map<string, FloorNode[]>();
  for (const node of coreNodes) {
    if (!coreByFunc.has(node.function)) coreByFunc.set(node.function, []);
    coreByFunc.get(node.function)!.push(node);
  }

  let totalPairs = 0;
  let alignedPairs = 0;

  for (const [func, funcNodes] of coreByFunc) {
    const sorted = funcNodes.sort((a, b) => a.floor_level - b.floor_level);

    for (let i = 1; i < sorted.length; i++) {
      totalPairs++;
      // Check if there's a STACKED_ON edge between consecutive floors
      const hasStack = voxel.edges.some(
        (e) =>
          e.type === "STACKED_ON" &&
          ((e.source === sorted[i - 1].id && e.target === sorted[i].id) ||
            (e.source === sorted[i].id && e.target === sorted[i - 1].id))
      );
      if (hasStack) alignedPairs++;
    }
  }

  if (totalPairs === 0) return 1.0;
  return round3(alignedPairs / totalPairs);
}

// ============================================================
// Zone Coverage Score
// Measures how well program types are placed in their target zones
// ============================================================

export function zoneCoverageScore(
  program: ProgramGraph,
  voxel: VerticalNodeGraph
): number {
  if (program.nodes.length === 0) return 1.0;

  let covered = 0;

  for (const pn of program.nodes) {
    const matchingNodes = voxel.nodes.filter(
      (n) => n.function === pn.program_type && n.floor_zone === pn.target_zone
    );
    if (matchingNodes.length > 0) covered++;
  }

  return round3(covered / program.nodes.length);
}

// ============================================================
// Overall Evaluation
// ============================================================

export function evaluateGraph(
  program: ProgramGraph,
  voxel: VerticalNodeGraph
): GraphMetrics {
  const ca = connectivityAccuracy(program, voxel);
  const vc = verticalContinuityScore(program, voxel);
  const zc = zoneCoverageScore(program, voxel);

  // Weighted average
  const overall = round3(ca * 0.35 + vc * 0.35 + zc * 0.30);

  return {
    connectivity_accuracy: ca,
    vertical_continuity: vc,
    zone_coverage: zc,
    overall,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
