// ============================================================
// Extended 7-Dimension Evaluation Engine (Corporate HQ)
// ============================================================

import type {
  ProgramGraph,
  VerticalNodeGraph,
  FloorNode,
  NodeFunction,
} from "./types";
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

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
