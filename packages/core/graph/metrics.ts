// ============================================================
// Spatial Mass Graph Metrics
// ============================================================

import type { SpatialMassGraph } from "./types";

export interface GraphMetrics {
  relation_clarity: number;
  geometry_readiness: number;
  narrative_coverage: number;
  provenance_traceability: number;
  consensus_strength: number;
  overall: number;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function relationClarity(graph: SpatialMassGraph): number {
  if (graph.nodes.length === 0) return 0;
  const linkedNodes = new Set<string>();
  let relationScore = 0;

  for (const relation of graph.relations) {
    linkedNodes.add(relation.source);
    linkedNodes.add(relation.target);
    if (relation.rationale.trim()) relationScore += 1;
    if (relation.weight > 0) relationScore += 0.5;
  }

  const nodeCoverage = linkedNodes.size / graph.nodes.length;
  const relationCoverage =
    graph.relations.length > 0 ? relationScore / (graph.relations.length * 1.5) : 0;
  return round3(nodeCoverage * 0.6 + relationCoverage * 0.4);
}

export function geometryReadiness(graph: SpatialMassGraph): number {
  if (graph.nodes.length === 0) return 0;
  let score = 0;

  for (const node of graph.nodes) {
    const geometry = node.geometry;
    const complete =
      geometry.primitive &&
      geometry.width &&
      geometry.depth &&
      geometry.height &&
      geometry.proportion &&
      geometry.skin &&
      geometry.porosity &&
      geometry.vertical_placement &&
      geometry.span_character &&
      geometry.orientation;
    if (complete) score += 1;
  }

  return round3(score / graph.nodes.length);
}

export function narrativeCoverage(graph: SpatialMassGraph): number {
  if (graph.nodes.length === 0) return 0;
  const nodeScore = graph.nodes.reduce((sum, node) => {
    const parts = [
      node.narrative.role,
      node.narrative.intent,
      node.narrative.spatial_character,
      node.narrative.facade_material_light,
      node.narrative.image_prompt_notes,
    ];
    const filled = parts.filter((part) => part.trim()).length / parts.length;
    const keywordBonus = node.narrative.keywords.length > 0 ? 0.15 : 0;
    return sum + Math.min(1, filled + keywordBonus);
  }, 0) / graph.nodes.length;

  const globalNarrative = graph.narrative;
  const globalParts = [
    globalNarrative.project_intro,
    globalNarrative.overall_architectural_concept,
    globalNarrative.massing_strategy_summary,
    globalNarrative.facade_and_material_summary,
    globalNarrative.public_to_private_sequence,
    globalNarrative.spatial_character_summary,
    globalNarrative.image_direction,
  ];
  const globalScore = globalParts.filter((part) => part.trim()).length / globalParts.length;

  return round3(nodeScore * 0.7 + globalScore * 0.3);
}

export function provenanceTraceability(graph: SpatialMassGraph): number {
  if (graph.nodes.length === 0) return 0;
  const nodeCoverage =
    graph.nodes.filter(
      (node) => node.architect_influences.length > 0 && node.discussion_trace.length > 0
    ).length / graph.nodes.length;

  const relationCoverage =
    graph.relations.length > 0
      ? graph.relations.filter((relation) => relation.evidence.length > 0).length /
        graph.relations.length
      : 0;

  const architectCoverage =
    graph.provenance.architect_contributions.length > 0
      ? 1
      : 0;

  return round3(nodeCoverage * 0.5 + relationCoverage * 0.35 + architectCoverage * 0.15);
}

export function consensusStrength(graph: SpatialMassGraph): number {
  if (graph.relations.length === 0) return 0;
  const relationScore =
    graph.relations.reduce((sum, relation) => sum + Math.min(1, relation.weight), 0) /
    graph.relations.length;

  const influenceScore =
    graph.nodes.reduce((sum, node) => {
      const topWeight = node.architect_influences[0]?.weight ?? 0;
      return sum + topWeight;
    }, 0) / Math.max(graph.nodes.length, 1);

  return round3(relationScore * 0.6 + influenceScore * 0.4);
}

export function evaluateGraph(graph: SpatialMassGraph): GraphMetrics {
  const relation = relationClarity(graph);
  const geometry = geometryReadiness(graph);
  const narrative = narrativeCoverage(graph);
  const provenance = provenanceTraceability(graph);
  const consensus = consensusStrength(graph);

  return {
    relation_clarity: relation,
    geometry_readiness: geometry,
    narrative_coverage: narrative,
    provenance_traceability: provenance,
    consensus_strength: consensus,
    overall: round3((relation + geometry + narrative + provenance + consensus) / 5),
  };
}
