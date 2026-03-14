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

// ============================================================
// SpatialMassGraph Operations (immutable)
// ============================================================

import type { SpatialMassGraph, MassNode, MassRelation } from "./types";

export function addMassNode(graph: SpatialMassGraph, node: MassNode): SpatialMassGraph {
  return {
    ...graph,
    nodes: [...graph.nodes, node],
    metadata: { ...graph.metadata, total_nodes: graph.metadata.total_nodes + 1 },
  };
}

export function removeMassNode(graph: SpatialMassGraph, nodeId: string): SpatialMassGraph {
  const newNodes = graph.nodes.filter((n) => n.id !== nodeId);
  const newRelations = graph.relations.filter(
    (r) => r.source !== nodeId && r.target !== nodeId
  );
  return {
    ...graph,
    nodes: newNodes,
    relations: newRelations,
    metadata: {
      ...graph.metadata,
      total_nodes: newNodes.length,
      total_relations: newRelations.length,
    },
  };
}

export function updateMassNode(
  graph: SpatialMassGraph,
  nodeId: string,
  updates: Partial<MassNode>
): SpatialMassGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.id === nodeId ? { ...n, ...updates, id: n.id } : n
    ),
  };
}

export function addMassRelation(
  graph: SpatialMassGraph,
  relation: MassRelation
): SpatialMassGraph {
  return {
    ...graph,
    relations: [...graph.relations, relation],
    metadata: { ...graph.metadata, total_relations: graph.metadata.total_relations + 1 },
  };
}

export function removeMassRelation(
  graph: SpatialMassGraph,
  relationId: string
): SpatialMassGraph {
  const newRelations = graph.relations.filter((r) => r.id !== relationId);
  return {
    ...graph,
    relations: newRelations,
    metadata: { ...graph.metadata, total_relations: newRelations.length },
  };
}

export function getMassNodesByType(
  graph: SpatialMassGraph,
  type: MassNode["type"]
): MassNode[] {
  return graph.nodes.filter((n) => n.type === type);
}

export function getMassNeighbors(
  graph: SpatialMassGraph,
  nodeId: string
): MassNode[] {
  const neighborIds = new Set<string>();
  for (const rel of graph.relations) {
    if (rel.source === nodeId) neighborIds.add(rel.target);
    if (rel.target === nodeId) neighborIds.add(rel.source);
  }
  return graph.nodes.filter((n) => neighborIds.has(n.id));
}

export function getMassRelationsBetween(
  graph: SpatialMassGraph,
  nodeA: string,
  nodeB: string
): MassRelation[] {
  return graph.relations.filter(
    (r) =>
      (r.source === nodeA && r.target === nodeB) ||
      (r.source === nodeB && r.target === nodeA)
  );
}

export function massGraphToJSON(graph: SpatialMassGraph): string {
  return JSON.stringify(graph, null, 2);
}

export function massGraphFromJSON(json: string): SpatialMassGraph {
  return JSON.parse(json) as SpatialMassGraph;
}
