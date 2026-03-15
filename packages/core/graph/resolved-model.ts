// ============================================================
// Resolved Mass Model
// SpatialMassGraph -> deterministic 3D mass interpretation
// ============================================================

import type {
  MassNode,
  MassRelation,
  PersistedGraphVariant,
  RelativeScale,
  ResolveMassModelOptions,
  ResolvedBooleanOperation,
  ResolvedMassDimensions,
  ResolvedMassModel,
  ResolvedMassNode,
  ResolvedModelRelation,
  SpatialMassGraph,
} from "./types";
import { withDisplayColors } from "./colors";
import {
  average,
  ensureGeometry,
  ensureNodeVariantSpace,
  ensureRelationVariantSpace,
  inverseRuleFor,
} from "./rules";

type GraphResolutionInput = Omit<SpatialMassGraph, "resolved_model"> & {
  resolved_model?: ResolvedMassModel;
};

type NodeQuantitativeMetrics = {
  storyCount: number;
  floorToFloorM: number;
  heightM: number;
  targetGfaM2: number | null;
  planAspectRatio: number;
  storySpan: {
    start: number | null;
    end: number | null;
  };
};

type NodeVariantResolution = {
  selectedPrimitive: MassNode["geometry"]["primitive"];
  aspectRatioScale: number;
  footprintScale: number;
  heightScale: number;
  radialDistanceScale: number;
  angleJitterRad: number;
};

type RelationVariantResolution = {
  distanceScale: number;
  lateralOffsetM: number;
};

const SCALE_METERS: Record<RelativeScale, number> = {
  xs: 6,
  small: 10,
  medium: 14,
  large: 20,
  xl: 28,
};

const CLEARANCE_METERS: Record<RelativeScale, number> = {
  xs: 1.5,
  small: 2.5,
  medium: 4,
  large: 6,
  xl: 9,
};

const PLACEMENT_BASE_LEVEL: Record<string, number> = {
  subgrade: -1,
  grounded: 0,
  low: 1,
  mid: 2,
  upper: 3,
  crown: 4,
  spanning: 2,
};

const HIERARCHY_WEIGHT: Record<string, number> = {
  primary: 0,
  secondary: 1,
  tertiary: 2,
};

const DEFAULT_FLOOR_TO_FLOOR_METERS: Record<MassNode["kind"], number> = {
  solid: 4.2,
  void: 4.8,
  core: 4.1,
  connector: 4.2,
};

const HEIGHT_SCALE_STORY_HINT: Record<RelativeScale, number> = {
  xs: 1,
  small: 1,
  medium: 2,
  large: 4,
  xl: 6,
};

const HIERARCHY_GFA_WEIGHT: Record<string, number> = {
  primary: 1.4,
  secondary: 1,
  tertiary: 0.65,
};

const MIN_PLAN_DIMENSION_METERS = 4;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeVariantLabel(
  value: string | null | undefined,
  index: number
): string {
  if (value && value !== "Base") return value;
  return `V${String(index + 1).padStart(2, "0")}`;
}

function hashValue(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function normalizeSeed(input: number | string): number {
  const raw =
    typeof input === "number" && Number.isFinite(input)
      ? Math.floor(input)
      : hashValue(String(input));
  return (raw >>> 0) || 1;
}

function randomUnit(seed: number, token: string): number {
  let value = normalizeSeed(`${seed}:${token}`);
  value = (value * 1664525 + 1013904223) >>> 0;
  return value / 4294967296;
}

function randomRange(seed: number, token: string, min: number, max: number): number {
  return min + randomUnit(seed, token) * (max - min);
}

function symmetricJitter(seed: number, token: string, magnitude: number): number {
  return (randomUnit(seed, token) * 2 - 1) * magnitude;
}

function resolveSeed(graph: GraphResolutionInput, options: ResolveMassModelOptions = {}): number {
  if (typeof options.seed === "number") {
    return normalizeSeed(options.seed);
  }
  if (typeof graph.resolved_model?.seed === "number") {
    return normalizeSeed(graph.resolved_model.seed);
  }
  return normalizeSeed(
    `${graph.metadata.created_at}:${graph.metadata.source_forum}:${graph.nodes
      .map((node) => node.id)
      .join("|")}`
  );
}

function sampleRangeValue(
  range: { min: number | null; max: number | null },
  seed: number,
  token: string,
  fallback: number
): number {
  const min =
    typeof range.min === "number" && Number.isFinite(range.min) ? range.min : fallback;
  const max =
    typeof range.max === "number" && Number.isFinite(range.max) ? range.max : min;
  if (Math.abs(max - min) < 1e-6) return min;
  return randomRange(seed, token, min, max);
}

function inferLegacyNodeVariantSpace(node: MassNode) {
  const alternatives = new Set<MassNode["geometry"]["primitive"]>([node.geometry.primitive]);

  switch (node.geometry.primitive) {
    case "block":
      alternatives.add("bar");
      if (node.kind !== "core") alternatives.add("plate");
      break;
    case "bar":
      alternatives.add("block");
      if (node.kind === "connector") alternatives.add("bridge");
      break;
    case "plate":
      alternatives.add("block");
      alternatives.add("bar");
      break;
    case "ring":
      alternatives.add("block");
      break;
    case "tower":
      alternatives.add("block");
      break;
    case "bridge":
      alternatives.add("bar");
      break;
    case "cylinder":
      alternatives.add("tower");
      break;
    default:
      break;
  }

  if (node.kind === "void") {
    alternatives.add(node.geometry.primitive === "block" ? "cylinder" : "block");
  }

  const freedom: MassNode["variant_space"]["freedom"] =
    node.kind === "core"
      ? "guided"
      : node.hierarchy === "primary"
        ? "guided"
        : "exploratory";

  return {
    alternative_primitives: Array.from(alternatives),
    freedom,
  };
}

function inferLegacyRelationVariantSpace(relation: MassRelation) {
  if (relation.strength === "hard") {
    return {
      distance_scale_range: { min: 0.92, max: 1.12 },
      lateral_offset_range_m:
        relation.rule === "above" || relation.rule === "below" || relation.rule === "rests_on"
          ? { min: 0, max: 2.5 }
          : { min: 0, max: 1.6 },
    };
  }

  return {
    distance_scale_range: { min: 0.78, max: 1.28 },
    lateral_offset_range_m: { min: 0, max: 6 },
  };
}

function normalizeGraphForResolution(graph: GraphResolutionInput): GraphResolutionInput {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      geometry: ensureGeometry(node.geometry),
      variant_space: ensureNodeVariantSpace(
        (node as { variant_space?: MassNode["variant_space"] }).variant_space ??
          inferLegacyNodeVariantSpace(node),
        node.geometry
      ),
      properties: node.properties ?? {},
    })),
    relations: graph.relations.map((relation) => ({
      ...relation,
      inverse_rule: relation.inverse_rule ?? inverseRuleFor(relation.rule),
      variant_space: ensureRelationVariantSpace(
        (relation as { variant_space?: MassRelation["variant_space"] }).variant_space ??
          inferLegacyRelationVariantSpace(relation)
      ),
    })),
  };
}

function localRuleFor(nodeId: string, relation: MassRelation) {
  if (relation.source === nodeId) return relation.rule;
  return relation.inverse_rule || inverseRuleFor(relation.rule);
}

function normalizePositiveMetric(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function normalizePositiveInteger(value: number | null | undefined): number | null {
  const normalized = normalizePositiveMetric(value);
  return normalized === null ? null : Math.max(1, Math.round(normalized));
}

function defaultFloorToFloor(node: MassNode): number {
  const explicit = normalizePositiveMetric(node.geometry.floor_to_floor_m);
  if (explicit !== null) return explicit;
  if (node.kind === "void" || node.geometry.porosity === "open") return 4.8;
  if (node.kind === "core") return 4.1;
  if (node.kind === "connector") return 4.2;
  return node.geometry.skin === "transparent" ? 4.4 : DEFAULT_FLOOR_TO_FLOOR_METERS[node.kind];
}

function categoricalStoryCount(node: MassNode): number {
  let stories = HEIGHT_SCALE_STORY_HINT[node.geometry.height] ?? 2;

  if (node.geometry.span_character === "single") {
    stories = Math.min(stories, 2);
  } else if (node.geometry.span_character === "stacked") {
    stories = Math.max(stories, 2);
  } else if (node.geometry.span_character === "multi_level") {
    stories = Math.max(stories, 4);
  }

  if (node.geometry.primitive === "tower") stories = Math.max(stories, 6);
  if (node.geometry.primitive === "bridge") stories = Math.min(stories, 2);
  if (node.kind === "connector") stories = Math.min(stories, 2);
  if (node.kind === "core") stories = Math.max(stories, 2);

  return Math.max(1, stories);
}

function normalizeStorySpan(
  span: MassNode["geometry"]["story_span"] | undefined,
  fallbackStoryCount: number
) {
  let start = normalizePositiveInteger(span?.start);
  let end = normalizePositiveInteger(span?.end);

  if (start !== null && end !== null && start > end) {
    [start, end] = [end, start];
  }
  if (start !== null && end === null) {
    end = start + fallbackStoryCount - 1;
  }
  if (end !== null && start === null) {
    start = Math.max(1, end - fallbackStoryCount + 1);
  }

  return { start, end };
}

function resolvePlanAspectRatio(
  node: MassNode,
  primitive: MassNode["geometry"]["primitive"],
  aspectRatioScale: number
): number {
  const explicit = normalizePositiveMetric(node.geometry.plan_aspect_ratio);
  if (explicit !== null) {
    return Math.max(0.35, explicit * aspectRatioScale);
  }

  let ratio =
    node.geometry.proportion === "elongated"
      ? 2.2
      : node.geometry.proportion === "slender"
        ? 1
        : node.geometry.proportion === "broad"
          ? 1.35
          : 1;

  switch (primitive) {
    case "bar":
      ratio = Math.max(ratio, 2.8);
      break;
    case "bridge":
      ratio = Math.max(ratio, 4.2);
      break;
    case "plate":
      ratio = Math.max(ratio, 1.7);
      break;
    case "tower":
      ratio = Math.max(0.9, Math.min(ratio, 1.2));
      break;
    case "ring":
    case "cylinder":
      ratio = 1;
      break;
    default:
      break;
  }

  return Math.max(0.35, ratio * aspectRatioScale);
}

function gfaWeight(node: MassNode): number {
  if (node.kind === "void") return 0;
  if (node.kind === "connector") return 0.35;
  if (node.kind === "core") return 0.55;
  return HIERARCHY_GFA_WEIGHT[node.hierarchy] ?? 1;
}

function allocateFallbackTargetGfa(graph: GraphResolutionInput): Map<string, number> {
  const allocations = new Map<string, number>();
  const totalGfa = normalizePositiveMetric(graph.project.program.total_gfa) ?? 0;
  if (totalGfa <= 0) return allocations;

  let explicitSum = 0;
  for (const node of graph.nodes) {
    explicitSum += normalizePositiveMetric(node.geometry.target_gfa_m2) ?? 0;
  }

  const remaining = Math.max(totalGfa - explicitSum, 0);
  if (remaining <= 0) return allocations;

  const candidates = graph.nodes.filter(
    (node) =>
      normalizePositiveMetric(node.geometry.target_gfa_m2) === null && gfaWeight(node) > 0
  );
  const weightSum = candidates.reduce((sum, node) => sum + gfaWeight(node), 0);
  if (weightSum <= 0) return allocations;

  for (const node of candidates) {
    allocations.set(node.id, round2((remaining * gfaWeight(node)) / weightSum));
  }

  return allocations;
}

function resolveNodeMetrics(
  node: MassNode,
  siteWidth: number,
  siteDepth: number,
  fallbackTargetGfaM2?: number,
  aspectRatioScale = 1,
  primitive: MassNode["geometry"]["primitive"] = node.geometry.primitive
): NodeQuantitativeMetrics {
  const floorToFloorM = defaultFloorToFloor(node);
  const explicitStoryCount = normalizePositiveInteger(node.geometry.story_count);
  const derivedStoryCountFromHeight =
    normalizePositiveMetric(node.geometry.height_m) !== null
      ? Math.max(1, Math.round((node.geometry.height_m as number) / floorToFloorM))
      : null;

  let storyCount =
    explicitStoryCount ?? derivedStoryCountFromHeight ?? categoricalStoryCount(node);
  let storySpan = normalizeStorySpan(node.geometry.story_span, storyCount);
  if (storySpan.start !== null && storySpan.end !== null) {
    storyCount = storySpan.end - storySpan.start + 1;
  }

  const targetGfaM2 =
    normalizePositiveMetric(node.geometry.target_gfa_m2) ??
    normalizePositiveMetric(fallbackTargetGfaM2);

  const hasExplicitVerticalDirective =
    explicitStoryCount !== null || storySpan.start !== null || storySpan.end !== null;
  if (
    targetGfaM2 !== null &&
    siteWidth > 0 &&
    siteDepth > 0 &&
    !hasExplicitVerticalDirective &&
    node.kind !== "void"
  ) {
    const siteArea = siteWidth * siteDepth;
    const footprintFactor =
      node.kind === "core" ? 0.22 : node.kind === "connector" ? 0.18 : 0.68;
    const maxPlanArea = Math.max(siteArea * footprintFactor, 36);
    storyCount = Math.max(storyCount, Math.ceil(targetGfaM2 / maxPlanArea));
    storySpan = normalizeStorySpan(node.geometry.story_span, storyCount);
  }

  const heightM =
    normalizePositiveMetric(node.geometry.height_m) ?? round2(storyCount * floorToFloorM);

  return {
    storyCount,
    floorToFloorM,
    heightM,
    targetGfaM2,
    planAspectRatio: resolvePlanAspectRatio(node, primitive, aspectRatioScale),
    storySpan,
  };
}

function fallbackPlanDimensions(
  node: MassNode,
  primitive: MassNode["geometry"]["primitive"]
): Omit<ResolvedMassDimensions, "height"> {
  let width = SCALE_METERS[node.geometry.width] ?? SCALE_METERS.medium;
  let depth = SCALE_METERS[node.geometry.depth] ?? SCALE_METERS.medium;

  switch (node.geometry.proportion) {
    case "elongated":
      width *= 1.35;
      depth *= 0.8;
      break;
    case "slender":
      width *= 0.76;
      depth *= 0.76;
      break;
    case "broad":
      width *= 1.22;
      depth *= 1.22;
      break;
    default:
      break;
  }

  switch (primitive) {
    case "bar":
      width *= 1.35;
      depth *= 0.72;
      break;
    case "plate":
      width *= 1.16;
      depth *= 1.12;
      break;
    case "tower":
      width *= 0.82;
      depth *= 0.82;
      break;
    case "bridge":
      width *= 1.7;
      depth *= 0.58;
      break;
    case "ring":
      width *= 1.18;
      depth *= 1.18;
      break;
    case "cylinder":
      depth = width;
      break;
    default:
      break;
  }

  if (node.kind === "void") {
    width *= 0.96;
    depth *= 0.96;
  }

  return {
    width,
    depth,
  };
}

function baseDimensions(
  node: MassNode,
  metrics: NodeQuantitativeMetrics,
  seed: number,
  variant: NodeVariantResolution
): ResolvedMassDimensions {
  const fallback = fallbackPlanDimensions(node, variant.selectedPrimitive);

  let width = fallback.width;
  let depth = fallback.depth;
  let height = metrics.heightM * variant.heightScale;

  if (metrics.targetGfaM2 !== null && metrics.storyCount > 0 && node.kind !== "connector") {
    const planArea = Math.max(
      metrics.targetGfaM2 / metrics.storyCount,
      MIN_PLAN_DIMENSION_METERS * MIN_PLAN_DIMENSION_METERS
    );
    width = Math.sqrt(planArea * metrics.planAspectRatio);
    depth = planArea / Math.max(width, MIN_PLAN_DIMENSION_METERS);
  }

  width *= variant.footprintScale;
  depth *= variant.footprintScale;

  if (variant.selectedPrimitive === "bridge") {
    width = Math.max(width, depth * 1.8);
    depth = Math.max(depth, 3.4);
  }

  const planMin = node.kind === "core" ? 0.96 : 0.93;
  const planMax = node.kind === "core" ? 1.04 : 1.07;
  const heightMin = 0.97;
  const heightMax = 1.03;

  width *= randomRange(seed, `${node.id}:width`, planMin, planMax);
  depth *= randomRange(seed, `${node.id}:depth`, planMin, planMax);
  height *= randomRange(seed, `${node.id}:height`, heightMin, heightMax);

  return {
    width: round2(Math.max(width, MIN_PLAN_DIMENSION_METERS)),
    depth: round2(Math.max(depth, MIN_PLAN_DIMENSION_METERS)),
    height: round2(Math.max(height, metrics.floorToFloorM)),
  };
}

function resolveNodeVariant(node: MassNode, seed: number): NodeVariantResolution {
  const { variant_space: variantSpace } = node;
  const basePrimitive = node.geometry.primitive;
  const alternatives =
    variantSpace.alternative_primitives.length > 0
      ? variantSpace.alternative_primitives
      : [basePrimitive];

  let selectedPrimitive = basePrimitive;
  if (variantSpace.freedom !== "fixed" && alternatives.length > 1) {
    const keepBaseBias =
      variantSpace.freedom === "guided" && alternatives.includes(basePrimitive) ? 0.55 : 0;
    const primitiveRoll = randomUnit(seed, `${node.id}:variant:primitive`);
    if (primitiveRoll > keepBaseBias) {
      const index = Math.floor(
        randomUnit(seed, `${node.id}:variant:primitive:index`) * alternatives.length
      );
      selectedPrimitive = alternatives[index] ?? basePrimitive;
    }
  }

  return {
    selectedPrimitive,
    aspectRatioScale: sampleRangeValue(
      variantSpace.aspect_ratio_range,
      seed,
      `${node.id}:variant:aspect`,
      1
    ),
    footprintScale: sampleRangeValue(
      variantSpace.footprint_scale_range,
      seed,
      `${node.id}:variant:footprint`,
      1
    ),
    heightScale: sampleRangeValue(
      variantSpace.height_scale_range,
      seed,
      `${node.id}:variant:height`,
      1
    ),
    radialDistanceScale: sampleRangeValue(
      variantSpace.radial_distance_scale_range,
      seed,
      `${node.id}:variant:radial`,
      1
    ),
    angleJitterRad:
      ((variantSpace.angle_jitter_deg ?? 0) * Math.PI) / 180,
  };
}

function resolveRelationVariant(
  relation: MassRelation,
  seed: number
): RelationVariantResolution {
  return {
    distanceScale: sampleRangeValue(
      relation.variant_space.distance_scale_range,
      seed,
      `${relation.id}:variant:distance`,
      1
    ),
    lateralOffsetM: sampleRangeValue(
      relation.variant_space.lateral_offset_range_m,
      seed,
      `${relation.id}:variant:lateral`,
      0
    ),
  };
}

function clearanceFor(relation: MassRelation): number {
  return CLEARANCE_METERS[relation.constraints.clearance ?? "medium"] ?? CLEARANCE_METERS.medium;
}

function directionAngle(
  node: MassNode,
  seed: number,
  relation: MassRelation | undefined,
  angleJitterRad: number
): number {
  const hint = `${node.relative_position.relation_hint ?? ""} ${relation?.rationale ?? ""}`.toLowerCase();
  if (hint.includes("east") || hint.includes("right") || hint.includes("오른")) return 0;
  if (hint.includes("west") || hint.includes("left") || hint.includes("왼")) return Math.PI;
  if (hint.includes("north") || hint.includes("front") || hint.includes("앞")) return -Math.PI / 2;
  if (hint.includes("south") || hint.includes("back") || hint.includes("뒤")) return Math.PI / 2;
  const base = ((hashValue(node.id) % 360) / 180) * Math.PI;
  return (
    base +
    symmetricJitter(
      seed,
      `${node.id}:${relation?.id ?? "free"}:angle`,
      Math.max(angleJitterRad, 0.08)
    )
  );
}

function relationDistance(
  rule: string,
  nodeDims: ResolvedMassDimensions,
  anchorDims: ResolvedMassDimensions,
  clearance: number
): number {
  const halfSpan = Math.max(nodeDims.width, nodeDims.depth, anchorDims.width, anchorDims.depth) / 2;

  switch (rule) {
    case "wraps":
    case "inside":
    case "contains":
    case "aligned_with":
    case "penetrates":
    case "above":
    case "below":
    case "rests_on":
      return 0;
    case "adjacent":
      return nodeDims.width / 2 + anchorDims.width / 2 + clearance;
    case "offset_from":
      return nodeDims.width / 2 + anchorDims.width / 2 + clearance * 1.8;
    case "linked":
      return halfSpan * 0.7 + clearance;
    case "bridges_to":
      return halfSpan * 0.3;
    default:
      return halfSpan * 0.6 + clearance;
  }
}

function resolveBaseLevels(graph: GraphResolutionInput) {
  const levels = new Map<string, number>();
  const forwardRelations = graph.relations.filter((relation) => !relation.id.includes("__inverse"));

  for (const node of graph.nodes) {
    levels.set(node.id, PLACEMENT_BASE_LEVEL[node.geometry.vertical_placement] ?? 0);
  }

  for (let iteration = 0; iteration < 10; iteration += 1) {
    for (const relation of forwardRelations) {
      const sourceLevel = levels.get(relation.source) ?? 0;
      const targetLevel = levels.get(relation.target) ?? 0;
      switch (relation.rule) {
        case "above":
        case "rests_on":
          levels.set(relation.source, Math.max(sourceLevel, targetLevel + 1));
          break;
        case "below":
          levels.set(relation.source, Math.min(sourceLevel, targetLevel - 1));
          break;
        case "wraps":
        case "inside":
        case "contains":
        case "linked":
        case "aligned_with":
        case "penetrates":
          levels.set(relation.source, Math.round((sourceLevel + targetLevel) / 2));
          break;
        default:
          break;
      }
    }
  }

  const minLevel = Math.min(...Array.from(levels.values()));
  if (minLevel < 0) {
    for (const [nodeId, level] of levels) {
      levels.set(nodeId, level - minLevel);
    }
  }

  return levels;
}

function applyDimensionConstraints(
  graph: GraphResolutionInput,
  dimensions: Map<string, ResolvedMassDimensions>,
  nodeNotes: Map<string, string[]>
) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const forwardRelations = graph.relations.filter((relation) => !relation.id.includes("__inverse"));

  for (const relation of forwardRelations) {
    const sourceNode = nodeById.get(relation.source);
    const targetNode = nodeById.get(relation.target);
    if (!sourceNode || !targetNode) continue;

    const sourceDims = dimensions.get(relation.source);
    const targetDims = dimensions.get(relation.target);
    if (!sourceDims || !targetDims) continue;

    const clearance = clearanceFor(relation);

    if (relation.rule === "wraps" || relation.rule === "contains") {
      sourceDims.width = round2(Math.max(sourceDims.width, targetDims.width + clearance * 2.4));
      sourceDims.depth = round2(Math.max(sourceDims.depth, targetDims.depth + clearance * 2.4));
      nodeNotes.get(sourceNode.id)?.push(`Expanded around ${targetNode.id} by ${relation.rule}.`);
    }

    if (relation.rule === "inside") {
      sourceDims.width = round2(Math.min(sourceDims.width, Math.max(targetDims.width - clearance * 1.4, targetDims.width * 0.62)));
      sourceDims.depth = round2(Math.min(sourceDims.depth, Math.max(targetDims.depth - clearance * 1.4, targetDims.depth * 0.62)));
      nodeNotes.get(sourceNode.id)?.push(`Compressed to sit inside ${targetNode.id}.`);
    }

    if (relation.rule === "penetrates") {
      if (sourceNode.kind === "void") {
        sourceDims.width = round2(Math.min(sourceDims.width, targetDims.width * 0.72));
        sourceDims.depth = round2(Math.min(sourceDims.depth, targetDims.depth * 0.72));
      }
      if (targetNode.kind === "void") {
        targetDims.width = round2(Math.min(targetDims.width, sourceDims.width * 0.72));
        targetDims.depth = round2(Math.min(targetDims.depth, sourceDims.depth * 0.72));
      }
    }
  }
}

function selectAnchorId(
  node: MassNode,
  graph: GraphResolutionInput,
  positions: Map<string, { x: number; z: number }>
) {
  if (node.relative_position.anchor_to && positions.has(node.relative_position.anchor_to)) {
    return node.relative_position.anchor_to;
  }

  const forwardRelations = graph.relations
    .filter((relation) => !relation.id.includes("__inverse"))
    .filter((relation) => relation.source === node.id || relation.target === node.id)
    .sort((a, b) => {
      if (a.strength !== b.strength) return a.strength === "hard" ? -1 : 1;
      return b.weight - a.weight;
    });

  for (const relation of forwardRelations) {
    const otherId = relation.source === node.id ? relation.target : relation.source;
    if (positions.has(otherId)) return otherId;
  }

  const placedIds = Array.from(positions.keys());
  return placedIds[0];
}

function relationBetween(graph: GraphResolutionInput, nodeId: string, otherId: string) {
  const relation = graph.relations
    .filter((item) => !item.id.includes("__inverse"))
    .find(
      (item) =>
        (item.source === nodeId && item.target === otherId) ||
        (item.source === otherId && item.target === nodeId)
    );
  return relation;
}

function applyBooleanOperation(
  operations: Map<string, ResolvedBooleanOperation[]>,
  hostId: string,
  targetNodeId: string,
  reason: string
) {
  const current = operations.get(hostId) ?? [];
  if (current.some((item) => item.target_node_id === targetNodeId && item.reason === reason)) {
    return;
  }
  current.push({
    type: "subtract",
    target_node_id: targetNodeId,
    reason,
  });
  operations.set(hostId, current);
}

function evaluateResolvedRelation(
  relation: MassRelation,
  sourceNode: ResolvedMassNode,
  targetNode: ResolvedMassNode
): ResolvedModelRelation {
  const dx = Math.abs(sourceNode.transform.x - targetNode.transform.x);
  const dz = Math.abs(sourceNode.transform.z - targetNode.transform.z);
  const dy = sourceNode.transform.y - targetNode.transform.y;
  const samePlan = dx < 4 && dz < 4;
  const sourceHalfHeight = sourceNode.dimensions.height / 2;
  const targetHalfHeight = targetNode.dimensions.height / 2;

  let satisfied = true;
  const notes: string[] = [];

  switch (relation.rule) {
    case "above":
      satisfied = dy > sourceHalfHeight + targetHalfHeight;
      notes.push("Source should sit above target.");
      break;
    case "below":
      satisfied = dy < -(sourceHalfHeight + targetHalfHeight);
      notes.push("Source should sit below target.");
      break;
    case "adjacent":
      satisfied = !samePlan && Math.hypot(dx, dz) > 4;
      notes.push("Source and target should read as side-by-side masses.");
      break;
    case "aligned_with":
      satisfied = dx < 3 || dz < 3;
      notes.push("Source and target should align along a shared axis.");
      break;
    case "wraps":
    case "contains":
      satisfied =
        sourceNode.dimensions.width >= targetNode.dimensions.width &&
        sourceNode.dimensions.depth >= targetNode.dimensions.depth &&
        samePlan;
      notes.push("Source envelope should be larger than target.");
      break;
    case "inside":
      satisfied =
        sourceNode.dimensions.width <= targetNode.dimensions.width &&
        sourceNode.dimensions.depth <= targetNode.dimensions.depth &&
        samePlan;
      notes.push("Source should fit inside target envelope.");
      break;
    case "penetrates":
      satisfied = samePlan;
      notes.push("Source and target should overlap in plan.");
      break;
    case "bridges_to":
      satisfied = Math.hypot(dx, dz) > 0;
      notes.push("Source should span between connected masses.");
      break;
    default:
      notes.push("Relation interpreted through deterministic layout rules.");
      break;
  }

  return {
    relation_id: relation.id,
    source_id: relation.source,
    target_id: relation.target,
    rule: relation.rule,
    applied_strategy: relation.constraints.geometry_effect ?? "attach",
    satisfied,
    notes,
  };
}

export function resolveSpatialMassModel(
  graph: GraphResolutionInput,
  options: ResolveMassModelOptions = {}
): ResolvedMassModel {
  const normalizedGraph = normalizeGraphForResolution(graph);
  const forwardRelations = normalizedGraph.relations.filter(
    (relation) => !relation.id.includes("__inverse")
  );
  const nodeById = new Map(normalizedGraph.nodes.map((node) => [node.id, node]));
  const dimensions = new Map<string, ResolvedMassDimensions>();
  const notes = new Map<string, string[]>();
  const rotationY = new Map<string, number>();
  const positions = new Map<string, { x: number; z: number }>();
  const yMap = new Map<string, number>();
  const booleanOperations = new Map<string, ResolvedBooleanOperation[]>();
  const levels = resolveBaseLevels(normalizedGraph);
  const siteWidth = normalizedGraph.project.site.dimensions[0] || 40;
  const siteDepth = normalizedGraph.project.site.dimensions[1] || 35;
  const seed = resolveSeed(normalizedGraph, options);
  const allocatedTargetGfa = allocateFallbackTargetGfa(normalizedGraph);
  const metricsByNode = new Map<string, NodeQuantitativeMetrics>();
  const nodeVariants = new Map<string, NodeVariantResolution>();
  const relationVariants = new Map<string, RelationVariantResolution>();
  const globalAngleOffset = symmetricJitter(seed, "global-angle-offset", 0.44);
  const variantId =
    options.variant_id ?? normalizedGraph.resolved_model?.variant_id ?? `variant-${seed}`;
  const variantLabel =
    options.variant_label ??
    (normalizedGraph.resolved_model?.variant_label === "Base"
      ? "V01"
      : normalizedGraph.resolved_model?.variant_label) ??
    "V01";

  for (const relation of normalizedGraph.relations) {
    relationVariants.set(relation.id, resolveRelationVariant(relation, seed));
  }

  for (const node of normalizedGraph.nodes) {
    const nodeVariant = resolveNodeVariant(node, seed);
    nodeVariants.set(node.id, nodeVariant);
    const metrics = resolveNodeMetrics(
      node,
      siteWidth,
      siteDepth,
      allocatedTargetGfa.get(node.id),
      nodeVariant.aspectRatioScale,
      nodeVariant.selectedPrimitive
    );
    metricsByNode.set(node.id, metrics);
    dimensions.set(node.id, baseDimensions(node, metrics, seed, nodeVariant));
    notes.set(node.id, []);
    rotationY.set(
      node.id,
      node.geometry.orientation === "diagonal"
        ? Math.PI / 4
        : node.geometry.orientation === "curved"
          ? 0.35
          : 0
    );
    if (nodeVariant.selectedPrimitive !== node.geometry.primitive) {
      notes
        .get(node.id)
        ?.push(`Variant primitive switched to ${nodeVariant.selectedPrimitive}.`);
    }
    if (node.geometry.target_gfa_m2 == null && metrics.targetGfaM2 !== null) {
      notes.get(node.id)?.push(`Allocated target GFA ${round2(metrics.targetGfaM2)}m² from project total.`);
    }
    if (metrics.storySpan.start !== null && metrics.storySpan.end !== null) {
      notes
        .get(node.id)
        ?.push(`Pinned to stories ${metrics.storySpan.start}-${metrics.storySpan.end}.`);
    }
  }

  applyDimensionConstraints(normalizedGraph, dimensions, notes);

  for (const node of normalizedGraph.nodes) {
    if (node.kind === "connector") continue;
    const dims = dimensions.get(node.id);
    if (!dims) continue;

    const maxWidth = siteWidth > 0 ? siteWidth * 0.92 : dims.width;
    const maxDepth = siteDepth > 0 ? siteDepth * 0.92 : dims.depth;
    const clampedWidth = Math.min(dims.width, maxWidth);
    const clampedDepth = Math.min(dims.depth, maxDepth);
    if (clampedWidth !== dims.width || clampedDepth !== dims.depth) {
      dims.width = round2(clampedWidth);
      dims.depth = round2(clampedDepth);
      notes.get(node.id)?.push("Clamped to fit site envelope.");
    }
  }

  const roots = [...normalizedGraph.nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "core" ? -1 : 1;
    const hierarchyDelta = (HIERARCHY_WEIGHT[a.hierarchy] ?? 9) - (HIERARCHY_WEIGHT[b.hierarchy] ?? 9);
    if (hierarchyDelta !== 0) return hierarchyDelta;
    return a.id.localeCompare(b.id);
  });

  let rootIndex = 0;
  for (const node of roots) {
    if (node.relative_position.anchor_to) continue;
    const nodeVariant = nodeVariants.get(node.id)!;
    const radius =
      Math.max(Math.min(siteWidth, siteDepth) * 0.18 + rootIndex * 4, 8) *
      randomRange(seed, `${node.id}:root-radius`, 0.88, 1.18) *
      nodeVariant.radialDistanceScale;
    const angle =
      (Math.PI * 2 * rootIndex) / Math.max(roots.length, 1) +
      globalAngleOffset +
      symmetricJitter(
        seed,
        `${node.id}:root-angle`,
        Math.max(nodeVariant.angleJitterRad * 0.65, 0.12)
      );
    if (node.kind === "core") {
      positions.set(node.id, { x: 0, z: 0 });
    } else {
      positions.set(node.id, {
        x: round2(Math.cos(angle) * radius),
        z: round2(Math.sin(angle) * radius),
      });
    }
    rootIndex += 1;
  }

  for (let iteration = 0; iteration < normalizedGraph.nodes.length + 2; iteration += 1) {
    let progressed = false;
    for (const node of normalizedGraph.nodes) {
      if (positions.has(node.id)) continue;
      const anchorId = selectAnchorId(node, normalizedGraph, positions);
      if (!anchorId) continue;

      const anchorPosition = positions.get(anchorId);
      const anchorDims = dimensions.get(anchorId);
      const nodeDims = dimensions.get(node.id);
      if (!anchorPosition || !anchorDims || !nodeDims) continue;

      const relation = relationBetween(normalizedGraph, node.id, anchorId);
      const localRule = relation ? localRuleFor(node.id, relation) : "linked";
      const nodeVariant = nodeVariants.get(node.id)!;
      const relationVariant = relation
        ? relationVariants.get(relation.id)
        : undefined;
      const angle =
        directionAngle(node, seed, relation, nodeVariant.angleJitterRad) +
        symmetricJitter(
          seed,
          `${node.id}:${anchorId}:anchor-angle`,
          Math.max(nodeVariant.angleJitterRad * 0.35, 0.08)
        );
      const baseDistance = relationDistance(
        localRule,
        nodeDims,
        anchorDims,
        relation ? clearanceFor(relation) : CLEARANCE_METERS.medium
      );
      const distance =
        baseDistance === 0
          ? 0
          : round2(
              baseDistance *
                (relationVariant?.distanceScale ?? 1) *
                nodeVariant.radialDistanceScale *
                (relation?.strength === "hard"
                  ? randomRange(seed, `${relation.id}:${node.id}:distance`, 0.92, 1.08)
                  : randomRange(seed, `${relation?.id ?? node.id}:${node.id}:distance`, 0.78, 1.22))
            );
      const lateralOffsetMagnitude = relationVariant?.lateralOffsetM ?? 0;
      const lateralOffset =
        lateralOffsetMagnitude <= 0
          ? 0
          : round2(
              lateralOffsetMagnitude *
                (randomUnit(seed, `${relation?.id ?? node.id}:${node.id}:lateral-sign`) > 0.5
                  ? 1
                  : -1)
            );

      positions.set(node.id, {
        x: round2(
          anchorPosition.x +
            Math.cos(angle) * distance +
            Math.cos(angle + Math.PI / 2) * lateralOffset
        ),
        z: round2(
          anchorPosition.z +
            Math.sin(angle) * distance +
            Math.sin(angle + Math.PI / 2) * lateralOffset
        ),
      });
      if ((distance > 0 || lateralOffset !== 0) && localRule !== "aligned_with") {
        rotationY.set(node.id, angle);
      }
      progressed = true;
    }

    if (!progressed) break;
  }

  for (const node of normalizedGraph.nodes) {
    if (!positions.has(node.id)) {
      const nodeVariant = nodeVariants.get(node.id)!;
      const angle =
        ((hashValue(node.id) % 360) / 180) * Math.PI +
        globalAngleOffset +
        symmetricJitter(
          seed,
          `${node.id}:fallback-angle`,
          Math.max(nodeVariant.angleJitterRad, 0.18)
        );
      const radius =
        Math.max(siteWidth * 0.14, 10) *
        randomRange(seed, `${node.id}:fallback-radius`, 0.84, 1.24) *
        nodeVariant.radialDistanceScale;
      positions.set(node.id, {
        x: round2(Math.cos(angle) * radius),
        z: round2(Math.sin(angle) * Math.max(siteDepth * 0.14, 10)),
      });
      notes.get(node.id)?.push("Placed by fallback radial rule.");
    }
  }

  const referenceFloorToFloor = round2(
    average(
      normalizedGraph.nodes.map((node) => metricsByNode.get(node.id)?.floorToFloorM ?? 4.2),
      4.2
    )
  );
  const lockedYNodes = new Set<string>();

  for (const node of normalizedGraph.nodes) {
    const dims = dimensions.get(node.id)!;
    const metrics = metricsByNode.get(node.id)!;
    if (metrics.storySpan.start !== null) {
      lockedYNodes.add(node.id);
      yMap.set(
        node.id,
        round2((metrics.storySpan.start - 1) * referenceFloorToFloor + dims.height / 2)
      );
      continue;
    }
    yMap.set(node.id, (levels.get(node.id) ?? 0) * referenceFloorToFloor + dims.height / 2);
  }

  for (let iteration = 0; iteration < 12; iteration += 1) {
    for (const relation of forwardRelations) {
      const sourceDims = dimensions.get(relation.source);
      const targetDims = dimensions.get(relation.target);
      if (!sourceDims || !targetDims) continue;
      const sourceY = yMap.get(relation.source) ?? 0;
      const targetY = yMap.get(relation.target) ?? 0;
      const sourceGap = sourceDims.height / 2 + targetDims.height / 2;

      if ((relation.rule === "above" || relation.rule === "rests_on") && !lockedYNodes.has(relation.source)) {
        const gap = relation.rule === "rests_on" ? Math.max(referenceFloorToFloor * 0.1, 1) : Math.max(referenceFloorToFloor * 0.2, 2);
        yMap.set(relation.source, Math.max(sourceY, targetY + sourceGap + gap));
      }

      if (relation.rule === "below" && !lockedYNodes.has(relation.source)) {
        yMap.set(
          relation.source,
          Math.min(sourceY, targetY - sourceGap - Math.max(referenceFloorToFloor * 0.2, 2))
        );
      }

      if (
        ["wraps", "inside", "contains", "linked", "aligned_with", "penetrates"].includes(
          relation.rule
        ) &&
        !lockedYNodes.has(relation.source)
      ) {
        yMap.set(relation.source, round2((sourceY + targetY) / 2));
      }
    }
  }

  let minBottom = Infinity;
  for (const node of normalizedGraph.nodes) {
    const dims = dimensions.get(node.id)!;
    const bottom = (yMap.get(node.id) ?? 0) - dims.height / 2;
    minBottom = Math.min(minBottom, bottom);
  }
  if (minBottom < 0) {
    for (const node of normalizedGraph.nodes) {
      yMap.set(node.id, round2((yMap.get(node.id) ?? 0) - minBottom));
    }
  }

  for (const node of normalizedGraph.nodes) {
    if (node.kind !== "connector") continue;
    const peerIds = forwardRelations
      .filter((relation) => relation.source === node.id || relation.target === node.id)
      .map((relation) => (relation.source === node.id ? relation.target : relation.source))
      .filter((peerId, index, all) => all.indexOf(peerId) === index)
      .slice(0, 2);

    if (peerIds.length < 2) continue;
    const first = positions.get(peerIds[0]);
    const second = positions.get(peerIds[1]);
    const dims = dimensions.get(node.id);
    if (!first || !second || !dims) continue;

    const dx = second.x - first.x;
    const dz = second.z - first.z;
    const distance = Math.max(Math.hypot(dx, dz), dims.width);
    positions.set(node.id, {
      x: round2((first.x + second.x) / 2),
      z: round2((first.z + second.z) / 2),
    });
    rotationY.set(node.id, Math.atan2(dz, dx));
    dims.width = round2(distance);
    dims.depth = round2(Math.max(4, Math.min(dims.depth, 6)));
    dims.height = round2(Math.max(3, dims.height));
    notes.get(node.id)?.push(`Resolved as connector between ${peerIds.join(" and ")}.`);
  }

  for (const relation of forwardRelations) {
    const sourceNode = nodeById.get(relation.source);
    const targetNode = nodeById.get(relation.target);
    if (!sourceNode || !targetNode) continue;

    if (
      sourceNode.kind === "void" &&
      targetNode.kind !== "void" &&
      ["penetrates", "inside", "contains", "wraps"].includes(relation.rule)
    ) {
      applyBooleanOperation(booleanOperations, targetNode.id, sourceNode.id, relation.rule);
    }

    if (
      targetNode.kind === "void" &&
      sourceNode.kind !== "void" &&
      ["penetrates", "inside", "contains", "wraps"].includes(relation.rule)
    ) {
      applyBooleanOperation(booleanOperations, sourceNode.id, targetNode.id, relation.rule);
    }
  }

  const resolvedNodes: ResolvedMassNode[] = normalizedGraph.nodes.map((node) => ({
    node_id: node.id,
    kind: node.kind,
    hierarchy: node.hierarchy,
    primitive: nodeVariants.get(node.id)!.selectedPrimitive,
    anchor_to: node.relative_position.anchor_to,
    dimensions: dimensions.get(node.id)!,
    transform: {
      x: positions.get(node.id)!.x,
      y: round2(yMap.get(node.id) ?? 0),
      z: positions.get(node.id)!.z,
      rotation_x: nodeVariants.get(node.id)!.selectedPrimitive === "ring" ? Math.PI / 2 : 0,
      rotation_y: round2(rotationY.get(node.id) ?? 0),
      rotation_z: 0,
    },
    shell: {
      skin: node.geometry.skin,
      porosity: node.geometry.porosity,
      opacity: node.kind === "void" ? 0.82 : 0.98,
    },
    boolean_operations: booleanOperations.get(node.id) ?? [],
    notes: notes.get(node.id) ?? [],
  }));

  const resolvedRelations: ResolvedModelRelation[] = forwardRelations.map((relation) => {
    const sourceNode = resolvedNodes.find((node) => node.node_id === relation.source);
    const targetNode = resolvedNodes.find((node) => node.node_id === relation.target);
    if (!sourceNode || !targetNode) {
      return {
        relation_id: relation.id,
        source_id: relation.source,
        target_id: relation.target,
        rule: relation.rule,
        applied_strategy: relation.constraints.geometry_effect ?? "attach",
        satisfied: false,
        notes: ["Related node missing from resolved model."],
      };
    }
    return evaluateResolvedRelation(relation, sourceNode, targetNode);
  });

  const bounds = resolvedNodes.reduce(
    (acc, node) => {
      const halfWidth = node.dimensions.width / 2;
      const halfDepth = node.dimensions.depth / 2;
      const halfHeight = node.dimensions.height / 2;
      acc.minX = Math.min(acc.minX, node.transform.x - halfWidth);
      acc.maxX = Math.max(acc.maxX, node.transform.x + halfWidth);
      acc.minZ = Math.min(acc.minZ, node.transform.z - halfDepth);
      acc.maxZ = Math.max(acc.maxZ, node.transform.z + halfDepth);
      acc.minY = Math.min(acc.minY, node.transform.y - halfHeight);
      acc.maxY = Math.max(acc.maxY, node.transform.y + halfHeight);
      return acc;
    },
    {
      minX: Infinity,
      maxX: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
    }
  );

  const relationSuccessCount = resolvedRelations.filter((relation) => relation.satisfied).length;

  return {
    units: "meters",
    strategy: "constraint_layout_v1",
    generated_at: new Date().toISOString(),
    variant_id: variantId,
    variant_label: variantLabel,
    seed,
    nodes: resolvedNodes,
    relations: resolvedRelations,
    footprint: {
      width: round2(Math.max(bounds.maxX - bounds.minX, 0)),
      depth: round2(Math.max(bounds.maxZ - bounds.minZ, 0)),
      height: round2(Math.max(bounds.maxY - bounds.minY, 0)),
    },
    notes: [
      "Deterministic mass model derived from SpatialMassGraph relation constraints.",
      "Variant space sampling selects permitted primitive, scale, and offset alternatives without changing graph identity.",
      "Void nodes are preserved as subtraction candidates and selectable wireframe overlays.",
      `Satisfied ${relationSuccessCount}/${resolvedRelations.length} forward relations during layout.`,
    ],
  };
}

export function withResolvedMassModel(
  graph: GraphResolutionInput,
  options: ResolveMassModelOptions = {}
): SpatialMassGraph {
  const normalizedGraph = normalizeGraphForResolution(graph);
  const colorizedGraph = withDisplayColors(normalizedGraph as SpatialMassGraph);
  const baseGraph = {
    ...colorizedGraph,
    metadata: {
      ...colorizedGraph.metadata,
      node_count: colorizedGraph.nodes.length,
      relation_count: colorizedGraph.relations.length,
    },
  };

  const normalizeStoredVariant = (
    variant: PersistedGraphVariant,
    index: number
  ): PersistedGraphVariant => {
    const resolvedModel = variant.resolved_model;
    const id = variant.id || resolvedModel?.variant_id || `variant-${index + 1}`;
    const label = normalizeVariantLabel(
      variant.label || resolvedModel?.variant_label,
      index
    );
    const generatedAt =
      variant.generated_at ||
      resolvedModel?.generated_at ||
      baseGraph.metadata.created_at;

    return {
      ...variant,
      id,
      label,
      generated_at: generatedAt,
      resolved_model: {
        ...resolvedModel,
        generated_at: generatedAt,
        variant_id: id,
        variant_label: label,
      },
    };
  };

  const buildInitialVariant = (resolvedModel: ResolvedMassModel): PersistedGraphVariant => ({
    id: resolvedModel.variant_id,
    label: normalizeVariantLabel(resolvedModel.variant_label, 0),
    generated_at: resolvedModel.generated_at,
    resolved_model: {
      ...resolvedModel,
      variant_label: normalizeVariantLabel(resolvedModel.variant_label, 0),
    },
  });

  const existingVariants =
    Array.isArray(baseGraph.variants) && baseGraph.variants.length > 0
      ? baseGraph.variants.map(normalizeStoredVariant)
      : [];

  const resolvedModel =
    baseGraph.resolved_model ?? resolveSpatialMassModel(baseGraph, options);

  const variants =
    existingVariants.length > 0
      ? existingVariants
      : [buildInitialVariant(resolvedModel)];

  const requestedActiveVariantId =
    baseGraph.active_variant_id ??
    baseGraph.resolved_model?.variant_id ??
    resolvedModel.variant_id;
  const activeVariant =
    variants.find((variant) => variant.id === requestedActiveVariantId) ??
    variants[variants.length - 1];
  const activeVariantId = activeVariant?.id ?? null;

  return {
    ...baseGraph,
    resolved_model: activeVariant?.resolved_model ?? resolvedModel,
    variants,
    active_variant_id: activeVariantId,
  };
}
