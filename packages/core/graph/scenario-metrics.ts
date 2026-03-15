import type {
  MassNode,
  QuantitativeNodeMetric,
  QuantitativeProgramMetric,
  QuantitativeScenarioMetrics,
  SpatialMassGraph,
} from "./types";

const DEFAULT_FLOOR_TO_FLOOR_METERS: Record<MassNode["kind"], number> = {
  solid: 4.2,
  void: 4.8,
  core: 4.1,
  connector: 4.2,
};

const COVERAGE_CELL_SIZE_METERS = 1;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveSiteArea(graph: SpatialMassGraph) {
  const explicit = graph.project.site.site_area_m2;
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }

  const [width, depth] = graph.project.site.dimensions;
  if (width > 0 && depth > 0) {
    return width * depth;
  }

  return null;
}

function resolveStoryCount(node: MassNode, resolvedHeight: number) {
  const span = node.geometry.story_span;
  if (
    typeof span.start === "number" &&
    typeof span.end === "number" &&
    Number.isFinite(span.start) &&
    Number.isFinite(span.end) &&
    span.end >= span.start
  ) {
    return Math.max(1, Math.round(span.end - span.start + 1));
  }

  if (
    typeof node.geometry.story_count === "number" &&
    Number.isFinite(node.geometry.story_count) &&
    node.geometry.story_count > 0
  ) {
    return Math.max(1, Math.round(node.geometry.story_count));
  }

  const floorToFloor =
    typeof node.geometry.floor_to_floor_m === "number" &&
    Number.isFinite(node.geometry.floor_to_floor_m) &&
    node.geometry.floor_to_floor_m > 0
      ? node.geometry.floor_to_floor_m
      : DEFAULT_FLOOR_TO_FLOOR_METERS[node.kind];

  return Math.max(1, Math.round(resolvedHeight / floorToFloor));
}

function nodeProgramName(node: MassNode) {
  if (node.program_label?.trim()) return node.program_label.trim();
  return null;
}

function nodeTextCorpus(node: MassNode) {
  return normalizeText(
    [
      node.program_label,
      node.name,
      node.spatial_role,
      node.narrative.role,
      node.narrative.intent,
      ...(node.narrative.keywords ?? []),
    ].join(" ")
  );
}

function scoreAgainstTarget(actual: number, target: number | null) {
  if (!(typeof target === "number" && Number.isFinite(target) && target > 0)) return null;
  return clamp01(1 - Math.abs(actual - target) / target);
}

function pointInsideResolvedFootprint(
  x: number,
  z: number,
  node: SpatialMassGraph["resolved_model"]["nodes"][number]
) {
  const dx = x - node.transform.x;
  const dz = z - node.transform.z;
  const cos = Math.cos(-node.transform.rotation_y);
  const sin = Math.sin(-node.transform.rotation_y);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;

  return (
    Math.abs(localX) <= node.dimensions.width / 2 &&
    Math.abs(localZ) <= node.dimensions.depth / 2
  );
}

function estimateBuildingArea(graph: SpatialMassGraph) {
  const solids = graph.resolved_model.nodes.filter((node) => node.kind !== "void");
  const voids = graph.resolved_model.nodes.filter((node) => node.kind === "void");
  if (solids.length === 0) return 0;

  const minX = Math.min(
    ...solids.map((node) => node.transform.x - node.dimensions.width / 2)
  );
  const maxX = Math.max(
    ...solids.map((node) => node.transform.x + node.dimensions.width / 2)
  );
  const minZ = Math.min(
    ...solids.map((node) => node.transform.z - node.dimensions.depth / 2)
  );
  const maxZ = Math.max(
    ...solids.map((node) => node.transform.z + node.dimensions.depth / 2)
  );

  let occupiedCells = 0;
  for (let x = minX; x < maxX; x += COVERAGE_CELL_SIZE_METERS) {
    for (let z = minZ; z < maxZ; z += COVERAGE_CELL_SIZE_METERS) {
      const cellX = x + COVERAGE_CELL_SIZE_METERS / 2;
      const cellZ = z + COVERAGE_CELL_SIZE_METERS / 2;
      const insideSolid = solids.some((node) =>
        pointInsideResolvedFootprint(cellX, cellZ, node)
      );
      const insideVoid = voids.some((node) =>
        pointInsideResolvedFootprint(cellX, cellZ, node)
      );
      if (insideSolid && !insideVoid) {
        occupiedCells += 1;
      }
    }
  }

  return occupiedCells * COVERAGE_CELL_SIZE_METERS * COVERAGE_CELL_SIZE_METERS;
}

export function evaluateQuantitativeScenario(
  graph: SpatialMassGraph
): QuantitativeScenarioMetrics {
  const nodeMetrics: QuantitativeNodeMetric[] = graph.nodes.map((node) => {
    const resolvedNode = graph.resolved_model.nodes.find(
      (candidate) => candidate.node_id === node.id
    );

    const floorplateArea =
      resolvedNode && node.kind !== "void"
        ? resolvedNode.dimensions.width * resolvedNode.dimensions.depth
        : 0;
    const storyCount = resolvedNode ? resolveStoryCount(node, resolvedNode.dimensions.height) : 0;
    const grossArea = node.kind === "void" ? 0 : floorplateArea * storyCount;

    return {
      node_id: node.id,
      node_name: node.name,
      kind: node.kind,
      program_label: nodeProgramName(node),
      floorplate_area_m2: round2(floorplateArea),
      story_count: storyCount,
      gross_area_m2: round2(grossArea),
    };
  });

  const totalGfa = round2(
    nodeMetrics.reduce((sum, metric) => sum + metric.gross_area_m2, 0)
  );
  const siteArea = resolveSiteArea(graph);
  const buildingArea = round2(estimateBuildingArea(graph));
  const targetFar = graph.project.site.far > 0 ? graph.project.site.far : null;
  const targetBcr = graph.project.site.bcr > 0 ? graph.project.site.bcr : null;
  const targetTotalGfa =
    graph.project.program.total_gfa > 0
      ? graph.project.program.total_gfa
      : siteArea && targetFar
        ? (siteArea * targetFar) / 100
        : null;

  const farPercent = siteArea ? round2((totalGfa / siteArea) * 100) : null;
  const bcrPercent = siteArea ? round2((buildingArea / siteArea) * 100) : null;

  const programTargets = graph.project.program.uses.filter(
    (use) =>
      use.type.trim() &&
      typeof use.target_area_m2 === "number" &&
      Number.isFinite(use.target_area_m2) &&
      use.target_area_m2 > 0
  );

  const actualByProgram = new Map<string, { area: number; nodeIds: string[] }>();
  for (const metric of nodeMetrics) {
    if (!metric.program_label || metric.gross_area_m2 <= 0) continue;
    const key = normalizeText(metric.program_label);
    const current = actualByProgram.get(key) ?? { area: 0, nodeIds: [] };
    current.area += metric.gross_area_m2;
    current.nodeIds.push(metric.node_id);
    actualByProgram.set(key, current);
  }

  const programMetrics: QuantitativeProgramMetric[] = programTargets.map((target) => {
    const key = normalizeText(target.type);
    const matched =
      actualByProgram.get(key) ??
      (() => {
        const fuzzy = nodeMetrics.filter((metric) => {
          const node = graph.nodes.find((candidate) => candidate.id === metric.node_id);
          if (!node) return false;
          const label = nodeTextCorpus(node);
          return label.includes(key) || key.includes(label);
        });
        return {
          area: fuzzy.reduce((sum, metric) => sum + metric.gross_area_m2, 0),
          nodeIds: fuzzy.map((metric) => metric.node_id),
        };
      })();

    const actualArea = round2(matched.area);
    const deltaArea = round2(actualArea - (target.target_area_m2 ?? 0));

    return {
      program: target.type,
      target_area_m2: round2(target.target_area_m2 ?? 0),
      actual_area_m2: actualArea,
      delta_area_m2: deltaArea,
      satisfaction: scoreAgainstTarget(actualArea, target.target_area_m2 ?? null) ?? 0,
      matched_node_ids: matched.nodeIds,
    };
  });

  const scoreParts = [
    farPercent !== null ? scoreAgainstTarget(farPercent, targetFar) : null,
    bcrPercent !== null ? scoreAgainstTarget(bcrPercent, targetBcr) : null,
    programMetrics.length > 0
      ? programMetrics.reduce((sum, metric) => sum + metric.satisfaction, 0) /
        programMetrics.length
      : null,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const satisfaction =
    scoreParts.length > 0
      ? round2(scoreParts.reduce((sum, value) => sum + value, 0) / scoreParts.length)
      : 0;

  return {
    site_area_m2: siteArea ? round2(siteArea) : null,
    total_gfa_m2: totalGfa,
    target_total_gfa_m2: targetTotalGfa ? round2(targetTotalGfa) : null,
    building_area_m2: buildingArea,
    far_percent: farPercent,
    target_far_percent: targetFar,
    bcr_percent: bcrPercent,
    target_bcr_percent: targetBcr,
    satisfaction,
    node_metrics: nodeMetrics,
    program_metrics: programMetrics,
  };
}
