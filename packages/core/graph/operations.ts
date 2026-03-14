// ============================================================
// CRUD Utilities for Vertical Node Graph
// All operations are immutable (return new objects)
// ============================================================

import type {
  VerticalNodeGraph,
  FloorNode,
  VoxelEdge,
  FloorZone,
  NodeFunction,
} from "./types";

// ============================================================
// Node Operations
// ============================================================

export function addNode(graph: VerticalNodeGraph, node: FloorNode): VerticalNodeGraph {
  return {
    ...graph,
    nodes: [...graph.nodes, node],
    metadata: {
      ...graph.metadata,
      total_nodes: graph.metadata.total_nodes + 1,
    },
  };
}

export function removeNode(graph: VerticalNodeGraph, nodeId: string): VerticalNodeGraph {
  const newNodes = graph.nodes.filter((n) => n.id !== nodeId);
  const newEdges = graph.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
  return {
    ...graph,
    nodes: newNodes,
    edges: newEdges,
    metadata: {
      ...graph.metadata,
      total_nodes: newNodes.length,
      total_edges: newEdges.length,
    },
  };
}

export function updateNode(
  graph: VerticalNodeGraph,
  nodeId: string,
  updates: Partial<FloorNode>
): VerticalNodeGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) =>
      n.id === nodeId ? { ...n, ...updates, id: n.id } : n
    ),
  };
}

export function moveNode(
  graph: VerticalNodeGraph,
  nodeId: string,
  newFloorLevel: number,
  newZone?: FloorZone
): VerticalNodeGraph {
  return updateNode(graph, nodeId, {
    floor_level: newFloorLevel,
    ...(newZone ? { floor_zone: newZone } : {}),
  });
}

// ============================================================
// Edge Operations
// ============================================================

export function addEdge(graph: VerticalNodeGraph, edge: VoxelEdge): VerticalNodeGraph {
  return {
    ...graph,
    edges: [...graph.edges, edge],
    metadata: {
      ...graph.metadata,
      total_edges: graph.metadata.total_edges + 1,
    },
  };
}

export function removeEdge(
  graph: VerticalNodeGraph,
  source: string,
  target: string
): VerticalNodeGraph {
  const newEdges = graph.edges.filter(
    (e) => !(e.source === source && e.target === target)
  );
  return {
    ...graph,
    edges: newEdges,
    metadata: {
      ...graph.metadata,
      total_edges: newEdges.length,
    },
  };
}

// ============================================================
// Query Operations
// ============================================================

export function getNodesByFloor(graph: VerticalNodeGraph, floor: number): FloorNode[] {
  return graph.nodes.filter((n) => n.floor_level === floor);
}

export function getNodesByZone(graph: VerticalNodeGraph, zone: FloorZone): FloorNode[] {
  return graph.nodes.filter((n) => n.floor_zone === zone);
}

export function getNodesByFunction(graph: VerticalNodeGraph, func: NodeFunction): FloorNode[] {
  return graph.nodes.filter((n) => n.function === func);
}

export function getNeighbors(graph: VerticalNodeGraph, nodeId: string): FloorNode[] {
  const neighborIds = new Set<string>();

  for (const edge of graph.edges) {
    if (edge.source === nodeId) neighborIds.add(edge.target);
    if (edge.target === nodeId) neighborIds.add(edge.source);
  }

  return graph.nodes.filter((n) => neighborIds.has(n.id));
}

// ============================================================
// Serialization
// ============================================================

export function toJSON(graph: VerticalNodeGraph): string {
  return JSON.stringify(graph, null, 2);
}

export function fromJSON(json: string): VerticalNodeGraph {
  return JSON.parse(json) as VerticalNodeGraph;
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
