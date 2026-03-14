// ============================================================
// Spatial Mass Graph Evaluation
// ============================================================

import type { SpatialMassGraph } from "./types";
import {
  consensusStrength,
  evaluateGraph,
  geometryReadiness,
  narrativeCoverage,
  provenanceTraceability,
  relationClarity,
} from "./metrics";

export interface EvaluationIssue {
  severity: "critical" | "warning" | "info";
  metric: string;
  message: string;
  nodeIds?: string[];
}

export interface EvaluationResult {
  relation_clarity: number;
  geometry_readiness: number;
  narrative_completeness: number;
  provenance_traceability: number;
  consensus_strength: number;
  model_readiness: number;
  image_prompt_readiness: number;
  overall: number;
  issues: EvaluationIssue[];
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function collectIssues(graph: SpatialMassGraph): EvaluationIssue[] {
  const issues: EvaluationIssue[] = [];
  const resolvedModel = graph.resolved_model;

  const hardRelations = graph.relations.filter((relation) => relation.strength === "hard");
  if (hardRelations.length === 0) {
    issues.push({
      severity: "critical",
      metric: "model_readiness",
      message: "Hard constraint relation이 없습니다. 중앙 모델 해석기가 공간 관계를 안정적으로 고정하기 어렵습니다.",
    });
  }

  for (const node of graph.nodes) {
    const nodeRelations = graph.relations.filter(
      (relation) => relation.source === node.id || relation.target === node.id
    );

    if (nodeRelations.length === 0) {
      issues.push({
        severity: "warning",
        metric: "relation_clarity",
        message: `${node.name} 노드에 연결된 관계가 없습니다.`,
        nodeIds: [node.id],
      });
    }

    if (!node.narrative.image_prompt_notes.trim()) {
      issues.push({
        severity: "warning",
        metric: "image_prompt_readiness",
        message: `${node.name} 노드에 이미지 생성용 메모가 없습니다.`,
        nodeIds: [node.id],
      });
    }

    if (node.architect_influences.length === 0) {
      issues.push({
        severity: "info",
        metric: "provenance_traceability",
        message: `${node.name} 노드의 건축가 영향 정보가 비어 있습니다.`,
        nodeIds: [node.id],
      });
    }
  }

  if (!graph.narrative.project_intro.trim() || !graph.narrative.image_direction.trim()) {
    issues.push({
      severity: "warning",
      metric: "narrative_completeness",
      message: "프로젝트 소개 또는 이미지 방향 메타데이터가 부족합니다.",
    });
  }

  for (const relation of resolvedModel.relations) {
    if (!relation.satisfied) {
      issues.push({
        severity: "warning",
        metric: "model_readiness",
        message: `${relation.source_id} -> ${relation.target_id} 관계(${relation.rule})가 현재 3D 모델에서 충분히 반영되지 않았습니다.`,
        nodeIds: [relation.source_id, relation.target_id],
      });
    }
  }

  for (const node of resolvedModel.nodes) {
    if (node.kind !== "void" && node.boolean_operations.length === 0) continue;
    if (node.kind === "void") {
      issues.push({
        severity: "info",
        metric: "model_readiness",
        message: `${node.node_id} void는 현재 subtraction candidate로 유지됩니다.`,
        nodeIds: [node.node_id],
      });
    }
  }

  return issues;
}

function modelReadiness(graph: SpatialMassGraph): number {
  const resolved = graph.resolved_model;
  if (resolved.nodes.length === 0) return 0;

  const satisfiedRelations =
    resolved.relations.length > 0
      ? resolved.relations.filter((relation) => relation.satisfied).length /
        resolved.relations.length
      : 0;
  const resolvedNodes =
    resolved.nodes.filter(
      (node) =>
        node.dimensions.width > 0 &&
        node.dimensions.depth > 0 &&
        node.dimensions.height > 0
    ).length / resolved.nodes.length;

  return round3(satisfiedRelations * 0.65 + resolvedNodes * 0.35);
}

export function evaluateGraphFull(graph: SpatialMassGraph): EvaluationResult {
  const base = evaluateGraph(graph);
  const narrative = narrativeCoverage(graph);
  const provenance = provenanceTraceability(graph);
  const consensus = consensusStrength(graph);
  const relation = relationClarity(graph);
  const geometry = geometryReadiness(graph);
  const model = modelReadiness(graph);

  const imagePromptReadiness = round3((narrative * 0.7 + provenance * 0.3));

  return {
    relation_clarity: relation,
    geometry_readiness: geometry,
    narrative_completeness: narrative,
    provenance_traceability: provenance,
    consensus_strength: consensus,
    model_readiness: model,
    image_prompt_readiness: imagePromptReadiness,
    overall: round3(
      (
        base.overall +
        narrative +
        provenance +
        consensus +
        model +
        imagePromptReadiness
      ) / 6
    ),
    issues: collectIssues(graph),
  };
}
