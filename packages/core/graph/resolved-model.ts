// ============================================================
// Resolved Mass Model
// SpatialMassGraph -> deterministic 3D mass interpretation
// ============================================================

import type {
  MassNode,
  MassRelation,
  RelativeScale,
  ResolveMassModelOptions,
  ResolvedBooleanOperation,
  ResolvedMassDimensions,
  ResolvedMassModel,
  ResolvedMassNode,
  ResolvedModelRelation,
  SpatialMassGraph,
} from "./types";
import { inverseRuleFor } from "./rules";

type GraphResolutionInput = Omit<SpatialMassGraph, "resolved_model"> & {
  resolved_model?: ResolvedMassModel;
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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

function localRuleFor(nodeId: string, relation: MassRelation) {
  if (relation.source === nodeId) return relation.rule;
  return relation.inverse_rule || inverseRuleFor(relation.rule);
}

function baseDimensions(node: MassNode, seed: number): ResolvedMassDimensions {
  let width = SCALE_METERS[node.geometry.width] ?? SCALE_METERS.medium;
  let depth = SCALE_METERS[node.geometry.depth] ?? SCALE_METERS.medium;
  let height = SCALE_METERS[node.geometry.height] ?? SCALE_METERS.medium;

  switch (node.geometry.proportion) {
    case "elongated":
      width *= 1.35;
      depth *= 0.8;
      break;
    case "slender":
      width *= 0.76;
      depth *= 0.76;
      height *= 1.2;
      break;
    case "broad":
      width *= 1.22;
      depth *= 1.22;
      height *= 0.9;
      break;
    default:
      break;
  }

  switch (node.geometry.span_character) {
    case "stacked":
      height *= 1.25;
      break;
    case "multi_level":
      height *= 1.8;
      break;
    default:
      break;
  }

  switch (node.geometry.primitive) {
    case "bar":
      width *= 1.35;
      depth *= 0.72;
      break;
    case "plate":
      width *= 1.16;
      depth *= 1.12;
      height *= 0.52;
      break;
    case "tower":
      width *= 0.82;
      depth *= 0.82;
      height *= 1.9;
      break;
    case "bridge":
      width *= 1.7;
      depth *= 0.58;
      height *= 0.38;
      break;
    case "ring":
      width *= 1.18;
      depth *= 1.18;
      height *= 0.52;
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

  const planMin = node.kind === "core" ? 0.94 : 0.86;
  const planMax = node.kind === "core" ? 1.06 : 1.16;
  const heightMin = node.kind === "void" ? 0.94 : 0.9;
  const heightMax = node.kind === "void" ? 1.06 : 1.14;

  width *= randomRange(seed, `${node.id}:width`, planMin, planMax);
  depth *= randomRange(seed, `${node.id}:depth`, planMin, planMax);
  height *= randomRange(seed, `${node.id}:height`, heightMin, heightMax);

  return {
    width: round2(width),
    depth: round2(depth),
    height: round2(height),
  };
}

function clearanceFor(relation: MassRelation): number {
  return CLEARANCE_METERS[relation.constraints?.clearance ?? "medium"] ?? CLEARANCE_METERS.medium;
}

function directionAngle(node: MassNode, seed: number, relation?: MassRelation): number {
  const hint = `${node.relative_position.relation_hint ?? ""} ${relation?.rationale ?? ""}`.toLowerCase();
  if (hint.includes("east") || hint.includes("right") || hint.includes("오른")) return 0;
  if (hint.includes("west") || hint.includes("left") || hint.includes("왼")) return Math.PI;
  if (hint.includes("north") || hint.includes("front") || hint.includes("앞")) return -Math.PI / 2;
  if (hint.includes("south") || hint.includes("back") || hint.includes("뒤")) return Math.PI / 2;
  const base = ((hashValue(node.id) % 360) / 180) * Math.PI;
  return base + symmetricJitter(seed, `${node.id}:${relation?.id ?? "free"}:angle`, 0.52);
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
    applied_strategy: relation.constraints?.geometry_effect ?? "attach",
    satisfied,
    notes,
  };
}

export function resolveSpatialMassModel(
  graph: GraphResolutionInput,
  options: ResolveMassModelOptions = {}
): ResolvedMassModel {
  const forwardRelations = graph.relations.filter((relation) => !relation.id.includes("__inverse"));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const dimensions = new Map<string, ResolvedMassDimensions>();
  const notes = new Map<string, string[]>();
  const rotationY = new Map<string, number>();
  const positions = new Map<string, { x: number; z: number }>();
  const yMap = new Map<string, number>();
  const booleanOperations = new Map<string, ResolvedBooleanOperation[]>();
  const levels = resolveBaseLevels(graph);
  const project = graph.project ?? (graph as any).global;
  const siteWidth = project?.site?.dimensions?.[0] || 40;
  const siteDepth = project?.site?.dimensions?.[1] || 35;
  const seed = resolveSeed(graph, options);
  const globalAngleOffset = symmetricJitter(seed, "global-angle-offset", 0.44);
  const variantId = options.variant_id ?? graph.resolved_model?.variant_id ?? `variant-${seed}`;
  const variantLabel =
    options.variant_label ?? graph.resolved_model?.variant_label ?? "Base";

  for (const node of graph.nodes) {
    dimensions.set(node.id, baseDimensions(node, seed));
    notes.set(node.id, []);
    rotationY.set(
      node.id,
      node.geometry.orientation === "diagonal"
        ? Math.PI / 4
        : node.geometry.orientation === "curved"
          ? 0.35
          : 0
    );
  }

  applyDimensionConstraints(graph, dimensions, notes);

  const roots = [...graph.nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "core" ? -1 : 1;
    const hierarchyDelta = (HIERARCHY_WEIGHT[a.hierarchy] ?? 9) - (HIERARCHY_WEIGHT[b.hierarchy] ?? 9);
    if (hierarchyDelta !== 0) return hierarchyDelta;
    return a.id.localeCompare(b.id);
  });

  let rootIndex = 0;
  for (const node of roots) {
    if (node.relative_position.anchor_to) continue;
    const radius =
      Math.max(Math.min(siteWidth, siteDepth) * 0.18 + rootIndex * 4, 8) *
      randomRange(seed, `${node.id}:root-radius`, 0.88, 1.18);
    const angle =
      (Math.PI * 2 * rootIndex) / Math.max(roots.length, 1) +
      globalAngleOffset +
      symmetricJitter(seed, `${node.id}:root-angle`, 0.36);
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

  for (let iteration = 0; iteration < graph.nodes.length + 2; iteration += 1) {
    let progressed = false;
    for (const node of graph.nodes) {
      if (positions.has(node.id)) continue;
      const anchorId = selectAnchorId(node, graph, positions);
      if (!anchorId) continue;

      const anchorPosition = positions.get(anchorId);
      const anchorDims = dimensions.get(anchorId);
      const nodeDims = dimensions.get(node.id);
      if (!anchorPosition || !anchorDims || !nodeDims) continue;

      const relation = relationBetween(graph, node.id, anchorId);
      const localRule = relation ? localRuleFor(node.id, relation) : "linked";
      const angle =
        directionAngle(node, seed, relation) +
        symmetricJitter(seed, `${node.id}:${anchorId}:anchor-angle`, 0.16);
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
                (relation?.strength === "hard"
                  ? randomRange(seed, `${relation.id}:${node.id}:distance`, 0.92, 1.08)
                  : randomRange(seed, `${relation?.id ?? node.id}:${node.id}:distance`, 0.78, 1.22))
            );

      positions.set(node.id, {
        x: round2(anchorPosition.x + Math.cos(angle) * distance),
        z: round2(anchorPosition.z + Math.sin(angle) * distance),
      });
      if (distance > 0 && localRule !== "aligned_with") {
        rotationY.set(node.id, angle);
      }
      progressed = true;
    }

    if (!progressed) break;
  }

  for (const node of graph.nodes) {
    if (!positions.has(node.id)) {
      const angle =
        ((hashValue(node.id) % 360) / 180) * Math.PI +
        globalAngleOffset +
        symmetricJitter(seed, `${node.id}:fallback-angle`, 0.5);
      const radius =
        Math.max(siteWidth * 0.14, 10) *
        randomRange(seed, `${node.id}:fallback-radius`, 0.84, 1.24);
      positions.set(node.id, {
        x: round2(Math.cos(angle) * radius),
        z: round2(Math.sin(angle) * Math.max(siteDepth * 0.14, 10)),
      });
      notes.get(node.id)?.push("Placed by fallback radial rule.");
    }
  }

  for (const node of graph.nodes) {
    const dims = dimensions.get(node.id)!;
    yMap.set(node.id, (levels.get(node.id) ?? 0) * 12 + dims.height / 2);
  }

  for (let iteration = 0; iteration < 12; iteration += 1) {
    for (const relation of forwardRelations) {
      const sourceDims = dimensions.get(relation.source);
      const targetDims = dimensions.get(relation.target);
      if (!sourceDims || !targetDims) continue;
      const sourceY = yMap.get(relation.source) ?? 0;
      const targetY = yMap.get(relation.target) ?? 0;
      const sourceGap = sourceDims.height / 2 + targetDims.height / 2;

      if (relation.rule === "above" || relation.rule === "rests_on") {
        const gap = relation.rule === "rests_on" ? 1 : 3;
        yMap.set(relation.source, Math.max(sourceY, targetY + sourceGap + gap));
      }

      if (relation.rule === "below") {
        yMap.set(relation.source, Math.min(sourceY, targetY - sourceGap - 3));
      }

      if (["wraps", "inside", "contains", "linked", "aligned_with", "penetrates"].includes(relation.rule)) {
        yMap.set(relation.source, round2((sourceY + targetY) / 2));
      }
    }
  }

  let minBottom = Infinity;
  for (const node of graph.nodes) {
    const dims = dimensions.get(node.id)!;
    const bottom = (yMap.get(node.id) ?? 0) - dims.height / 2;
    minBottom = Math.min(minBottom, bottom);
  }
  if (minBottom < 0) {
    for (const node of graph.nodes) {
      yMap.set(node.id, round2((yMap.get(node.id) ?? 0) - minBottom));
    }
  }

  for (const node of graph.nodes) {
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

  const resolvedNodes: ResolvedMassNode[] = graph.nodes.map((node) => ({
    node_id: node.id,
    kind: node.kind,
    hierarchy: node.hierarchy,
    primitive: node.geometry.primitive,
    anchor_to: node.relative_position.anchor_to,
    dimensions: dimensions.get(node.id)!,
    transform: {
      x: positions.get(node.id)!.x,
      y: round2(yMap.get(node.id) ?? 0),
      z: positions.get(node.id)!.z,
      rotation_x: node.geometry.primitive === "ring" ? Math.PI / 2 : 0,
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
        applied_strategy: relation.constraints?.geometry_effect ?? "attach",
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
      "Void nodes are preserved as subtraction candidates and selectable wireframe overlays.",
      `Satisfied ${relationSuccessCount}/${resolvedRelations.length} forward relations during layout.`,
    ],
  };
}

export function withResolvedMassModel(
  graph: GraphResolutionInput,
  options: ResolveMassModelOptions = {}
): SpatialMassGraph {
  const baseGraph = {
    ...graph,
    metadata: {
      ...graph.metadata,
      node_count: graph.nodes.length,
      relation_count: graph.relations.length,
    },
  };

  return {
    ...baseGraph,
    resolved_model: resolveSpatialMassModel(baseGraph, options),
  };
}
