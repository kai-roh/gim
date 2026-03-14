// ============================================================
// Spatial Mass Graph Operations
// ============================================================

import type { MassNode, MassRelation, SpatialMassGraph } from "./types";
import { withResolvedMassModel } from "./resolved-model";

function refreshMetadata(graph: SpatialMassGraph): SpatialMassGraph {
  return withResolvedMassModel(graph);
}

export function addNode(graph: SpatialMassGraph, node: MassNode): SpatialMassGraph {
  return refreshMetadata({
    ...graph,
    nodes: [...graph.nodes, node],
  });
}

export function removeNode(graph: SpatialMassGraph, nodeId: string): SpatialMassGraph {
  return refreshMetadata({
    ...graph,
    nodes: graph.nodes.filter((node) => node.id !== nodeId),
    relations: graph.relations.filter(
      (relation) => relation.source !== nodeId && relation.target !== nodeId
    ),
  });
}

export function updateNode(
  graph: SpatialMassGraph,
  nodeId: string,
  updates: Partial<MassNode>
): SpatialMassGraph {
  return refreshMetadata({
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === nodeId ? { ...node, ...updates, id: node.id } : node
    ),
  });
}

export function addRelation(
  graph: SpatialMassGraph,
  relation: MassRelation
): SpatialMassGraph {
  return refreshMetadata({
    ...graph,
    relations: [...graph.relations, relation],
  });
}

export function removeRelation(
  graph: SpatialMassGraph,
  relationId: string
): SpatialMassGraph {
  return refreshMetadata({
    ...graph,
    relations: graph.relations.filter((relation) => relation.id !== relationId),
  });
}

export function getNeighbors(graph: SpatialMassGraph, nodeId: string): MassNode[] {
  const neighborIds = new Set<string>();
  for (const relation of graph.relations) {
    if (relation.source === nodeId) neighborIds.add(relation.target);
    if (relation.target === nodeId) neighborIds.add(relation.source);
  }
  return graph.nodes.filter((node) => neighborIds.has(node.id));
}

export function toJSON(graph: SpatialMassGraph): string {
  return JSON.stringify(graph, null, 2);
}

export function fromJSON(json: string): SpatialMassGraph {
  return withResolvedMassModel(JSON.parse(json) as SpatialMassGraph);
}
