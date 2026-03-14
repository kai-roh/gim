// ============================================================
// Extended 7-Dimension Evaluation Engine
// Builds on top of metrics.ts with 4 additional metrics
// ============================================================

import type {
  ProgramGraph,
  VerticalNodeGraph,
  FloorNode,
} from "./types";
import {
  connectivityAccuracy,
  verticalContinuityScore,
  zoneCoverageScore,
} from "./metrics";
import { getRefugeFloors, getMechanicalFloors, getOutriggerFloors } from "./rules";

export interface EvaluationResult {
  connectivity_accuracy: number;
  vertical_continuity: number;
  zone_coverage: number;
  structural_stability: number;
  environmental: number;
  code_compliance: number;
  economic: number;
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
// Structural Stability
// Checks outrigger placement, core continuity, belt truss alignment
// ============================================================

function structuralStability(voxel: VerticalNodeGraph): {
  score: number;
  issues: EvaluationIssue[];
} {
  const issues: EvaluationIssue[] = [];
  const totalFloors = voxel.global.total_floors;

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
      metric: "structural_stability",
      message: `Core missing on ${missingCoreFloors.length} floors`,
      floor: missingCoreFloors[0],
    });
  }

  // 2. Outrigger placement check
  const expectedOutriggers = getOutriggerFloors(totalFloors, 25);
  const actualOutriggers = voxel.nodes
    .filter((n) => n.function === "outrigger")
    .map((n) => n.floor_level);
  const outriggerScore = expectedOutriggers.length === 0
    ? 1.0
    : actualOutriggers.length / Math.max(expectedOutriggers.length, 1);

  if (actualOutriggers.length < expectedOutriggers.length) {
    issues.push({
      severity: "warning",
      metric: "structural_stability",
      message: `Expected ${expectedOutriggers.length} outrigger floors, found ${actualOutriggers.length}`,
    });
  }

  // 3. Belt truss at outrigger levels
  const beltFloors = new Set(
    voxel.nodes.filter((n) => n.function === "belt_truss").map((n) => n.floor_level)
  );
  const outriggerSet = new Set(actualOutriggers);
  const misaligned = [...outriggerSet].filter((f) => !beltFloors.has(f));
  const beltScore = outriggerSet.size === 0
    ? 1.0
    : 1.0 - misaligned.length / outriggerSet.size;

  if (misaligned.length > 0) {
    issues.push({
      severity: "warning",
      metric: "structural_stability",
      message: `Belt truss missing at ${misaligned.length} outrigger floors`,
    });
  }

  const score = round3(coreScore * 0.5 + outriggerScore * 0.3 + beltScore * 0.2);
  return { score, issues };
}

// ============================================================
// Environmental
// South-facing premium distribution, sky garden placement
// ============================================================

function environmentalScore(voxel: VerticalNodeGraph): {
  score: number;
  issues: EvaluationIssue[];
} {
  const issues: EvaluationIssue[] = [];

  // 1. South-facing premium spaces (office/hotel with south position above mid-rise)
  const premiumFunctions = ["premium_office", "executive_suite", "hotel_suite", "sky_lounge", "observation_deck"];
  const southPremium = voxel.nodes.filter(
    (n) => premiumFunctions.includes(n.function) && (n.position === "south" || n.position === "southeast" || n.position === "southwest")
  );
  const allPremium = voxel.nodes.filter((n) => premiumFunctions.includes(n.function));
  const southRatio = allPremium.length > 0 ? southPremium.length / allPremium.length : 0;

  if (southRatio < 0.3) {
    issues.push({
      severity: "warning",
      metric: "environmental",
      message: `Only ${Math.round(southRatio * 100)}% of premium spaces face south (target: 30%+)`,
    });
  }

  // 2. Sky garden presence
  const skyGardens = voxel.nodes.filter((n) => n.function === "sky_garden");
  const gardenScore = skyGardens.length >= 2 ? 1.0 : skyGardens.length >= 1 ? 0.7 : 0.3;

  if (skyGardens.length === 0) {
    issues.push({
      severity: "warning",
      metric: "environmental",
      message: "No sky gardens found in the building",
    });
  }

  // 3. View premium average for high_rise/crown zones
  const highNodes = voxel.nodes.filter(
    (n) => n.floor_zone === "high_rise" || n.floor_zone === "crown"
  );
  const avgView = highNodes.length > 0
    ? highNodes.reduce((sum, n) => sum + n.abstract.view_premium, 0) / highNodes.length
    : 0;

  const score = round3(Math.min(southRatio * 1.5, 1) * 0.4 + gardenScore * 0.3 + avgView * 0.3);
  return { score, issues };
}

// ============================================================
// Code Compliance
// Refuge areas every 25 floors, mechanical spacing
// ============================================================

function codeCompliance(voxel: VerticalNodeGraph): {
  score: number;
  issues: EvaluationIssue[];
} {
  const issues: EvaluationIssue[] = [];
  const totalFloors = voxel.global.total_floors;

  // 1. Refuge areas every 25 floors
  const expectedRefuge = getRefugeFloors(totalFloors, 25);
  const actualRefuge = new Set(
    voxel.nodes.filter((n) => n.function === "refuge_area").map((n) => n.floor_level)
  );

  let refugeMatches = 0;
  for (const expected of expectedRefuge) {
    // Allow ±2 floor tolerance
    const found = [...actualRefuge].some((f) => Math.abs(f - expected) <= 2);
    if (found) refugeMatches++;
  }
  const refugeScore = expectedRefuge.length > 0 ? refugeMatches / expectedRefuge.length : 1.0;

  if (refugeMatches < expectedRefuge.length) {
    issues.push({
      severity: "critical",
      metric: "code_compliance",
      message: `Refuge areas: ${refugeMatches}/${expectedRefuge.length} required positions covered`,
    });
  }

  // 2. Mechanical floor spacing
  const expectedMech = getMechanicalFloors(totalFloors, 20);
  const actualMech = new Set(
    voxel.nodes.filter((n) => n.function === "mechanical_room").map((n) => n.floor_level)
  );
  let mechMatches = 0;
  for (const expected of expectedMech) {
    const found = [...actualMech].some((f) => Math.abs(f - expected) <= 3);
    if (found) mechMatches++;
  }
  const mechScore = expectedMech.length > 0 ? mechMatches / expectedMech.length : 1.0;

  if (mechMatches < expectedMech.length) {
    issues.push({
      severity: "warning",
      metric: "code_compliance",
      message: `Mechanical floors: ${mechMatches}/${expectedMech.length} expected positions`,
    });
  }

  // 3. Stairwell presence on every floor
  const stairFloors = new Set(
    voxel.nodes.filter((n) => n.function === "stairwell").map((n) => n.floor_level)
  );
  const missingStairs = [...new Set(voxel.nodes.map((n) => n.floor_level))].filter(
    (f) => !stairFloors.has(f)
  );
  const stairScore = missingStairs.length === 0 ? 1.0 : 1.0 - missingStairs.length / voxel.nodes.length * 10;

  if (missingStairs.length > 0) {
    issues.push({
      severity: "critical",
      metric: "code_compliance",
      message: `Stairwells missing on ${missingStairs.length} floors`,
    });
  }

  const score = round3(
    Math.max(0, refugeScore * 0.4 + mechScore * 0.3 + Math.max(0, stairScore) * 0.3)
  );
  return { score, issues };
}

// ============================================================
// Economic
// Premium space ratio in high floors, hotel/office placement
// ============================================================

function economicScore(voxel: VerticalNodeGraph): {
  score: number;
  issues: EvaluationIssue[];
} {
  const issues: EvaluationIssue[] = [];
  const totalFloors = voxel.global.total_floors;

  // 1. High-floor premium ratio
  const highFloorThreshold = totalFloors * 0.6;
  const highFloorNodes = voxel.nodes.filter(
    (n) => n.floor_level >= highFloorThreshold && !["elevator_core", "stairwell", "service_shaft", "elevator_lobby", "mechanical_room", "electrical_room"].includes(n.function)
  );
  const premiumHighFloor = highFloorNodes.filter(
    (n) => ["premium_office", "executive_suite", "hotel_suite", "sky_lounge", "observation_deck", "rooftop_bar", "hotel_room"].includes(n.function)
  );
  const premiumRatio = highFloorNodes.length > 0 ? premiumHighFloor.length / highFloorNodes.length : 0;

  if (premiumRatio < 0.5) {
    issues.push({
      severity: "info",
      metric: "economic",
      message: `Only ${Math.round(premiumRatio * 100)}% of high-floor space is premium (target: 50%+)`,
    });
  }

  // 2. Hotel above office check (higher floors = higher premium)
  const hotelFloors = voxel.nodes
    .filter((n) => n.function === "hotel_room" || n.function === "hotel_suite")
    .map((n) => n.floor_level);
  const officeFloors = voxel.nodes
    .filter((n) => n.function === "open_office" || n.function === "premium_office")
    .map((n) => n.floor_level);

  const avgHotel = hotelFloors.length > 0 ? hotelFloors.reduce((a, b) => a + b, 0) / hotelFloors.length : 0;
  const avgOffice = officeFloors.length > 0 ? officeFloors.reduce((a, b) => a + b, 0) / officeFloors.length : 0;
  const hotelAboveOffice = avgHotel > avgOffice ? 1.0 : 0.5;

  if (avgHotel <= avgOffice && hotelFloors.length > 0) {
    issues.push({
      severity: "info",
      metric: "economic",
      message: "Hotel floors should be above office floors for view premium",
    });
  }

  // 3. Prestige distribution
  const avgPrestige = voxel.nodes.length > 0
    ? voxel.nodes.reduce((sum, n) => sum + n.abstract.prestige, 0) / voxel.nodes.length
    : 0;

  const score = round3(premiumRatio * 0.4 + hotelAboveOffice * 0.3 + avgPrestige * 0.3);
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

  // New 4 metrics
  const ss = structuralStability(voxel);
  const env = environmentalScore(voxel);
  const cc = codeCompliance(voxel);
  const econ = economicScore(voxel);

  // Weighted overall
  const weights = {
    connectivity_accuracy: 0.15,
    vertical_continuity: 0.15,
    zone_coverage: 0.10,
    structural_stability: 0.20,
    environmental: 0.10,
    code_compliance: 0.20,
    economic: 0.10,
  };

  const overall = round3(
    ca * weights.connectivity_accuracy +
    vc * weights.vertical_continuity +
    zc * weights.zone_coverage +
    ss.score * weights.structural_stability +
    env.score * weights.environmental +
    cc.score * weights.code_compliance +
    econ.score * weights.economic
  );

  const allIssues = [...ss.issues, ...env.issues, ...cc.issues, ...econ.issues];
  allIssues.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 };
    return sev[a.severity] - sev[b.severity];
  });

  return {
    connectivity_accuracy: ca,
    vertical_continuity: vc,
    zone_coverage: zc,
    structural_stability: ss.score,
    environmental: env.score,
    code_compliance: cc.score,
    economic: econ.score,
    overall,
    issues: allIssues,
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
