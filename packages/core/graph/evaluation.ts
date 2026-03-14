// ============================================================
// Extended 7-Dimension Evaluation Engine (Corporate HQ)
// ============================================================

import type {
  ProgramGraph,
  VerticalNodeGraph,
  FloorNode,
  NodeFunction,
  SpatialMassGraph,
} from "./types";
import { validateSpatialMassGraph } from "./types";
import {
  connectivityAccuracy,
  verticalContinuityScore,
  zoneCoverageScore,
} from "./metrics";

export interface EvaluationResult {
  connectivity_accuracy: number;
  vertical_continuity: number;
  zone_coverage: number;
  structural_feasibility: number;
  code_compliance: number;
  brand_identity: number;
  spatial_quality: number;
  overall: number;
  issues: EvaluationIssue[];
}

export interface EvaluationIssue {
  severity: "critical" | "warning" | "info";
  metric: string;
  message: string;
  nodeIds?: string[];
  floor?: number;
}

// ============================================================
// Structural Feasibility (Corporate HQ)
// Checks core continuity, structural system appropriateness
// ============================================================

function structuralFeasibility(voxel: VerticalNodeGraph): {
  score: number;
  issues: EvaluationIssue[];
} {
  const issues: EvaluationIssue[] = [];

  // 1. Core continuity: elevator_core on every floor
  const coreFloors = new Set<number>();
  for (const n of voxel.nodes) {
    if (n.function === "elevator_core") coreFloors.add(n.floor_level);
  }
  const allFloors = new Set<number>();
  for (const n of voxel.nodes) allFloors.add(n.floor_level);
  const missingCoreFloors = [...allFloors].filter((f) => !coreFloors.has(f));
  const coreScore = missingCoreFloors.length === 0 ? 1.0 : 1.0 - missingCoreFloors.length / allFloors.size;

  if (missingCoreFloors.length > 0) {
    issues.push({
      severity: "critical",
      metric: "structural_feasibility",
      message: `Core missing on ${missingCoreFloors.length} floors`,
      floor: missingCoreFloors[0],
    });
  }

  // 2. Large span detection: public_void and atrium spaces may need structural reinforcement
  const largeSpanFunctions: NodeFunction[] = ["public_void", "atrium", "event_space", "auditorium", "installation_space"];
  const largeSpanNodes = voxel.nodes.filter((n) => largeSpanFunctions.includes(n.function));
  const largeSpanScore = largeSpanNodes.length <= 3 ? 1.0 : Math.max(0.5, 1.0 - (largeSpanNodes.length - 3) * 0.1);

  if (largeSpanNodes.length > 3) {
    issues.push({
      severity: "warning",
      metric: "structural_feasibility",
      message: `${largeSpanNodes.length} large-span spaces detected — verify structural reinforcement`,
    });
  }

  // 3. Stairwell continuity check
  const stairFloors = new Set(
    voxel.nodes.filter((n) => n.function === "stairwell").map((n) => n.floor_level)
  );
  const missingStairFloors = [...allFloors].filter((f) => !stairFloors.has(f));
  const stairScore = missingStairFloors.length === 0 ? 1.0 : Math.max(0, 1.0 - missingStairFloors.length / allFloors.size);

  if (missingStairFloors.length > 0) {
    issues.push({
      severity: "warning",
      metric: "structural_feasibility",
      message: `Stairwells missing on ${missingStairFloors.length} floors`,
    });
  }

  const score = round3(coreScore * 0.4 + largeSpanScore * 0.3 + stairScore * 0.3);
  return { score, issues };
}

// ============================================================
// Code Compliance (Corporate HQ — Korean Building Code)
// ============================================================

function codeCompliance(voxel: VerticalNodeGraph): {
  score: number;
  issues: EvaluationIssue[];
} {
  const issues: EvaluationIssue[] = [];
  const totalFloors = voxel.global.total_floors;

  // 1. Fire stairs: 6층 이상 건물은 직통계단 2개소 이상
  const stairFloors = new Map<number, number>();
  for (const n of voxel.nodes) {
    if (n.function === "stairwell") {
      stairFloors.set(n.floor_level, (stairFloors.get(n.floor_level) ?? 0) + 1);
    }
  }

  let stairDeficient = 0;
  if (totalFloors >= 6) {
    for (const [floor, count] of stairFloors) {
      if (floor > 0 && count < 2) stairDeficient++;
    }
  }
  const stairScore = stairDeficient === 0 ? 1.0 : Math.max(0, 1.0 - stairDeficient * 0.15);

  if (stairDeficient > 0) {
    issues.push({
      severity: "critical",
      metric: "code_compliance",
      message: `${stairDeficient} floors have fewer than 2 fire stairs (required for 6+ story buildings)`,
    });
  }

  // 2. Mechanical room presence
  const hasMechanical = voxel.nodes.some((n) => n.function === "mechanical_room");
  const mechScore = hasMechanical ? 1.0 : 0.5;
  if (!hasMechanical) {
    issues.push({
      severity: "warning",
      metric: "code_compliance",
      message: "No mechanical room found in the building",
    });
  }

  // 3. Elevator core continuity
  const coreFloors = new Set(
    voxel.nodes.filter((n) => n.function === "elevator_core").map((n) => n.floor_level)
  );
  const allFloors = [...new Set(voxel.nodes.map((n) => n.floor_level))];
  const missingCore = allFloors.filter((f) => !coreFloors.has(f));
  const coreScore = missingCore.length === 0 ? 1.0 : Math.max(0, 1.0 - missingCore.length / allFloors.length);

  if (missingCore.length > 0) {
    issues.push({
      severity: "critical",
      metric: "code_compliance",
      message: `Elevator core missing on ${missingCore.length} floors`,
    });
  }

  const score = round3(stairScore * 0.4 + mechScore * 0.2 + coreScore * 0.4);
  return { score, issues };
}

// ============================================================
// Brand Identity
// Evaluates how well brand-experience spaces are positioned
// ============================================================

function brandIdentity(voxel: VerticalNodeGraph): {
  score: number;
  issues: EvaluationIssue[];
} {
  const issues: EvaluationIssue[] = [];

  // 1. Brand experience spaces in ground/lower zones
  const brandFunctions: NodeFunction[] = [
    "brand_showroom", "experiential_retail", "installation_space",
    "exhibition_hall", "flagship_store", "gallery",
  ];
  const brandNodes = voxel.nodes.filter((n) => brandFunctions.includes(n.function));
  const groundBrandNodes = brandNodes.filter(
    (n) => n.floor_zone === "ground" || n.floor_zone === "lower"
  );

  const brandPlacementScore = brandNodes.length > 0
    ? groundBrandNodes.length / brandNodes.length
    : 0.3;

  if (brandNodes.length === 0) {
    issues.push({
      severity: "warning",
      metric: "brand_identity",
      message: "No brand experience spaces found in the building",
    });
  } else if (groundBrandNodes.length === 0) {
    issues.push({
      severity: "warning",
      metric: "brand_identity",
      message: "Brand experience spaces not on ground/lower floors — reduced street presence",
    });
  }

  // 2. Lobby presence and quality
  const lobbyNodes = voxel.nodes.filter((n) => n.function === "lobby");
  const lobbyScore = lobbyNodes.length > 0 ? 1.0 : 0.3;

  if (lobbyNodes.length === 0) {
    issues.push({
      severity: "warning",
      metric: "brand_identity",
      message: "No dedicated lobby space found",
    });
  }

  // 3. Public void / atrium for brand statement
  const voidNodes = voxel.nodes.filter(
    (n) => n.function === "public_void" || n.function === "atrium"
  );
  const voidScore = voidNodes.length > 0 ? 1.0 : 0.5;

  // 4. Average brand_expression score
  const avgBrandExpr = voxel.nodes.length > 0
    ? voxel.nodes.reduce((sum, n) => sum + n.abstract.brand_expression, 0) / voxel.nodes.length
    : 0;

  const score = round3(brandPlacementScore * 0.3 + lobbyScore * 0.2 + voidScore * 0.2 + avgBrandExpr * 0.3);
  return { score, issues };
}

// ============================================================
// Spatial Quality
// Natural light, views, ceiling heights, spatial flow
// ============================================================

function spatialQuality(voxel: VerticalNodeGraph): {
  score: number;
  issues: EvaluationIssue[];
} {
  const issues: EvaluationIssue[] = [];

  // 1. South-facing premium spaces
  const premiumFunctions: NodeFunction[] = [
    "premium_office", "executive_suite", "lounge", "sky_garden",
    "brand_showroom", "gallery", "rooftop_bar",
  ];
  const southPremium = voxel.nodes.filter(
    (n) => premiumFunctions.includes(n.function) &&
      (n.position === "south" || n.position === "southeast" || n.position === "southwest")
  );
  const allPremium = voxel.nodes.filter((n) => premiumFunctions.includes(n.function));
  const southRatio = allPremium.length > 0 ? southPremium.length / allPremium.length : 0;

  if (southRatio < 0.3 && allPremium.length > 0) {
    issues.push({
      severity: "info",
      metric: "spatial_quality",
      message: `Only ${Math.round(southRatio * 100)}% of premium spaces face south (target: 30%+)`,
    });
  }

  // 2. Green/garden spaces
  const gardenNodes = voxel.nodes.filter((n) => n.function === "sky_garden");
  const gardenScore = gardenNodes.length >= 1 ? 1.0 : 0.5;

  if (gardenNodes.length === 0) {
    issues.push({
      severity: "info",
      metric: "spatial_quality",
      message: "No sky garden / rooftop garden found",
    });
  }

  // 3. Average spatial_quality score
  const avgSQ = voxel.nodes.length > 0
    ? voxel.nodes.reduce((sum, n) => sum + n.abstract.spatial_quality, 0) / voxel.nodes.length
    : 0;

  // 4. Office floor view quality
  const officeFunctions: NodeFunction[] = ["open_office", "premium_office", "executive_suite", "coworking"];
  const officeNodes = voxel.nodes.filter((n) => officeFunctions.includes(n.function));
  const avgOfficeView = officeNodes.length > 0
    ? officeNodes.reduce((sum, n) => sum + n.abstract.view_premium, 0) / officeNodes.length
    : 0;

  const score = round3(
    Math.min(southRatio * 1.5, 1) * 0.25 +
    gardenScore * 0.2 +
    avgSQ * 0.3 +
    avgOfficeView * 0.25
  );
  return { score, issues };
}

// ============================================================
// Full 7-Dimension Evaluation
// ============================================================

export function evaluateGraphFull(
  program: ProgramGraph,
  voxel: VerticalNodeGraph
): EvaluationResult {
  // Original 3 metrics
  const ca = connectivityAccuracy(program, voxel);
  const vc = verticalContinuityScore(program, voxel);
  const zc = zoneCoverageScore(program, voxel);

  // New 4 metrics (Corporate HQ specific)
  const sf = structuralFeasibility(voxel);
  const cc = codeCompliance(voxel);
  const bi = brandIdentity(voxel);
  const sq = spatialQuality(voxel);

  // Weighted overall
  const weights = {
    connectivity_accuracy: 0.15,
    vertical_continuity: 0.10,
    zone_coverage: 0.10,
    structural_feasibility: 0.15,
    code_compliance: 0.20,
    brand_identity: 0.15,
    spatial_quality: 0.15,
  };

  const overall = round3(
    ca * weights.connectivity_accuracy +
    vc * weights.vertical_continuity +
    zc * weights.zone_coverage +
    sf.score * weights.structural_feasibility +
    cc.score * weights.code_compliance +
    bi.score * weights.brand_identity +
    sq.score * weights.spatial_quality
  );

  const allIssues = [...sf.issues, ...cc.issues, ...bi.issues, ...sq.issues];
  allIssues.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 };
    return sev[a.severity] - sev[b.severity];
  });

  return {
    connectivity_accuracy: ca,
    vertical_continuity: vc,
    zone_coverage: zc,
    structural_feasibility: sf.score,
    code_compliance: cc.score,
    brand_identity: bi.score,
    spatial_quality: sq.score,
    overall,
    issues: allIssues,
  };
}

// ============================================================
// SpatialMassGraph (v2) Evaluation
// ============================================================

export interface MassEvaluationResult {
  relation_satisfaction: number;    // % of relations geometrically satisfied
  model_readiness: number;          // is resolved_model present and complete
  narrative_completeness: number;   // are narratives filled for all nodes
  graph_coherence: number;          // node count 6-12, all relations valid refs
  structural_feasibility: number;   // core present, reasonable stacking
  overall: number;
  issues: EvaluationIssue[];
}

export function evaluateMassGraphFull(graph: SpatialMassGraph): MassEvaluationResult {
  const issues: EvaluationIssue[] = [];

  // 1. relation_satisfaction
  const relationSatisfaction = computeRelationSatisfaction(graph, issues);

  // 2. model_readiness
  const modelReadiness = computeModelReadiness(graph, issues);

  // 3. narrative_completeness
  const narrativeCompleteness = computeNarrativeCompleteness(graph, issues);

  // 4. graph_coherence
  const graphCoherence = computeGraphCoherence(graph, issues);

  // 5. structural_feasibility
  const structFeasibility = computeMassStructuralFeasibility(graph, issues);

  // Weighted overall
  const overall = round3(
    relationSatisfaction * 0.25 +
    modelReadiness * 0.15 +
    narrativeCompleteness * 0.15 +
    graphCoherence * 0.20 +
    structFeasibility * 0.25
  );

  issues.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 };
    return sev[a.severity] - sev[b.severity];
  });

  return {
    relation_satisfaction: relationSatisfaction,
    model_readiness: modelReadiness,
    narrative_completeness: narrativeCompleteness,
    graph_coherence: graphCoherence,
    structural_feasibility: structFeasibility,
    overall,
    issues,
  };
}

function computeRelationSatisfaction(
  graph: SpatialMassGraph,
  issues: EvaluationIssue[]
): number {
  if (graph.relations.length === 0) return 1.0;

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  let satisfied = 0;

  for (const rel of graph.relations) {
    const source = nodeMap.get(rel.source);
    const target = nodeMap.get(rel.target);
    if (!source || !target) continue;

    let ok = false;
    if (rel.family === "stack") {
      // Stack: source floor_range should be adjacent to target floor_range
      // e.g., source [3,5] stacked on target [1,2] means source bottom = target top + 1
      const sourceBottom = source.floor_range[0];
      const sourceTop = source.floor_range[1];
      const targetBottom = target.floor_range[0];
      const targetTop = target.floor_range[1];
      ok = sourceBottom === targetTop + 1 || targetBottom === sourceTop + 1;
    } else if (rel.family === "contact") {
      // Contact: floor ranges should overlap
      ok =
        source.floor_range[0] <= target.floor_range[1] &&
        target.floor_range[0] <= source.floor_range[1];
    } else {
      // Other relation families — count as satisfied if nodes exist
      ok = true;
    }

    if (ok) {
      satisfied++;
    } else {
      issues.push({
        severity: "warning",
        metric: "relation_satisfaction",
        message: `Relation "${rel.id}" (${rel.family}/${rel.rule}) between "${rel.source}" and "${rel.target}" not geometrically satisfied`,
        nodeIds: [rel.source, rel.target],
      });
    }
  }

  return round3(satisfied / graph.relations.length);
}

function computeModelReadiness(
  graph: SpatialMassGraph,
  issues: EvaluationIssue[]
): number {
  if (!graph.resolved_model) {
    issues.push({
      severity: "warning",
      metric: "model_readiness",
      message: "resolved_model is not present",
    });
    return 0;
  }

  if (graph.resolved_model.nodes.length === graph.nodes.length) {
    return 1.0;
  }

  issues.push({
    severity: "warning",
    metric: "model_readiness",
    message: `resolved_model has ${graph.resolved_model.nodes.length} nodes but graph has ${graph.nodes.length} nodes`,
  });
  return 0;
}

function computeNarrativeCompleteness(
  graph: SpatialMassGraph,
  issues: EvaluationIssue[]
): number {
  if (graph.nodes.length === 0) return 1.0;

  let totalFields = 0;
  let filledFields = 0;

  for (const node of graph.nodes) {
    totalFields += 2; // intent_text and architectural_description

    if (node.narrative.intent_text && node.narrative.intent_text.trim().length > 0) {
      filledFields++;
    }
    if (node.narrative.architectural_description && node.narrative.architectural_description.trim().length > 0) {
      filledFields++;
    }
  }

  const score = round3(filledFields / totalFields);

  if (score < 1.0) {
    const missing = totalFields - filledFields;
    issues.push({
      severity: "info",
      metric: "narrative_completeness",
      message: `${missing} narrative fields are empty across ${graph.nodes.length} nodes`,
    });
  }

  return score;
}

function computeGraphCoherence(
  graph: SpatialMassGraph,
  issues: EvaluationIssue[]
): number {
  const validation = validateSpatialMassGraph(graph);

  if (validation.valid) return 1.0;

  const errorCount = validation.errors.length;
  const score = round3(Math.max(0, 1.0 - errorCount * 0.15));

  for (const err of validation.errors) {
    issues.push({
      severity: "critical",
      metric: "graph_coherence",
      message: err,
    });
  }
  for (const warn of validation.warnings) {
    issues.push({
      severity: "warning",
      metric: "graph_coherence",
      message: warn,
    });
  }

  return score;
}

function computeMassStructuralFeasibility(
  graph: SpatialMassGraph,
  issues: EvaluationIssue[]
): number {
  let score = 1.0;

  // 1. Core node must exist
  const hasCore = graph.nodes.some((n) => n.type === "core");
  if (!hasCore) {
    score -= 0.4;
    issues.push({
      severity: "critical",
      metric: "structural_feasibility",
      message: "No core node found in the mass graph",
    });
  }

  // 2. Check for floating masses — nodes that are not ground_contact
  //    and have no "stack" relation supporting them from below
  const stackTargets = new Set<string>(); // nodes that have something stacked on them (they support)
  const stackSources = new Set<string>(); // nodes that are stacked on something (they are supported)
  for (const rel of graph.relations) {
    if (rel.family === "stack") {
      // In a stack relation, typically source sits on top of target
      stackSources.add(rel.source);
      stackTargets.add(rel.target);
    }
  }

  const floatingNodes: string[] = [];
  for (const node of graph.nodes) {
    if (node.ground_contact) continue; // on the ground, fine
    if (stackSources.has(node.id)) continue; // stacked on something, fine
    floatingNodes.push(node.id);
  }

  if (floatingNodes.length > 0) {
    const penalty = Math.min(0.4, floatingNodes.length * 0.1);
    score -= penalty;
    issues.push({
      severity: "warning",
      metric: "structural_feasibility",
      message: `${floatingNodes.length} mass(es) appear to float without stack support: ${floatingNodes.join(", ")}`,
      nodeIds: floatingNodes,
    });
  }

  return round3(Math.max(0, score));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
