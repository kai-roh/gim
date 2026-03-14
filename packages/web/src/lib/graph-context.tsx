"use client";

import React, { createContext, useContext, useReducer, useCallback, useRef } from "react";
import type {
  VerticalNodeGraph,
  FloorNode,
  FloorZone,
  SpatialMassGraph,
  MassNode,
  MassRelation,
} from "@gim/core";

// Inline immutable graph operations (from @gim/core/graph/operations)
// to avoid pulling in the full barrel export which includes Node.js-only modules

// ---- VerticalNodeGraph ops (legacy) ----

function coreAddNode(graph: VerticalNodeGraph, node: FloorNode): VerticalNodeGraph {
  return {
    ...graph,
    nodes: [...graph.nodes, node],
    metadata: { ...graph.metadata, total_nodes: graph.metadata.total_nodes + 1 },
  };
}

function coreRemoveNode(graph: VerticalNodeGraph, nodeId: string): VerticalNodeGraph {
  const newNodes = graph.nodes.filter((n) => n.id !== nodeId);
  const newEdges = graph.edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
  return {
    ...graph,
    nodes: newNodes,
    edges: newEdges,
    metadata: { ...graph.metadata, total_nodes: newNodes.length, total_edges: newEdges.length },
  };
}

function coreUpdateNode(graph: VerticalNodeGraph, nodeId: string, updates: Partial<FloorNode>): VerticalNodeGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, ...updates, id: n.id } : n)),
  };
}

function coreMoveNode(graph: VerticalNodeGraph, nodeId: string, newFloorLevel: number, newZone?: FloorZone): VerticalNodeGraph {
  return coreUpdateNode(graph, nodeId, {
    floor_level: newFloorLevel,
    ...(newZone ? { floor_zone: newZone } : {}),
  });
}

// ---- SpatialMassGraph ops ----

function massAddNode(graph: SpatialMassGraph, node: MassNode): SpatialMassGraph {
  return {
    ...graph,
    nodes: [...graph.nodes, node],
    metadata: { ...graph.metadata, total_nodes: graph.metadata.total_nodes + 1 },
  };
}

function massRemoveNode(graph: SpatialMassGraph, nodeId: string): SpatialMassGraph {
  const newNodes = graph.nodes.filter((n) => n.id !== nodeId);
  const newRelations = graph.relations.filter((r) => r.source !== nodeId && r.target !== nodeId);
  return {
    ...graph,
    nodes: newNodes,
    relations: newRelations,
    metadata: { ...graph.metadata, total_nodes: newNodes.length, total_relations: newRelations.length },
  };
}

function massUpdateNode(graph: SpatialMassGraph, nodeId: string, updates: Partial<MassNode>): SpatialMassGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, ...updates, id: n.id } : n)),
  };
}

function massAddRelation(graph: SpatialMassGraph, relation: MassRelation): SpatialMassGraph {
  return {
    ...graph,
    relations: [...graph.relations, relation],
    metadata: { ...graph.metadata, total_relations: graph.metadata.total_relations + 1 },
  };
}

function massRemoveRelation(graph: SpatialMassGraph, relationId: string): SpatialMassGraph {
  const newRelations = graph.relations.filter((r) => r.id !== relationId);
  return {
    ...graph,
    relations: newRelations,
    metadata: { ...graph.metadata, total_relations: newRelations.length },
  };
}

// ============================================================
// Graph State — supports both VerticalNodeGraph (v1) and SpatialMassGraph (v2)
// ============================================================

export interface GraphState {
  // v1 (legacy)
  graph: VerticalNodeGraph | null;
  // v2
  massGraph: SpatialMassGraph | null;
  graphVersion: 1 | 2;

  selectedNodeId: string | null;
  selectedFloor: number | null;
  activeEdgeTypes: Set<string>;
  loading: boolean;
  error: string | null;
  editMode: boolean;
}

const DEFAULT_ACTIVE_EDGES = new Set([
  "STACKED_ON",
  "ADJACENT_TO",
  "ZONE_BOUNDARY",
  "STRUCTURAL_TRANSFER",
  "STYLE_BOUNDARY",
]);

const DEFAULT_ACTIVE_RELATIONS = new Set([
  "stack",
  "contact",
  "enclosure",
  "intersection",
  "connection",
  "alignment",
]);

const initialState: GraphState = {
  graph: null,
  massGraph: null,
  graphVersion: 1,
  selectedNodeId: null,
  selectedFloor: null,
  activeEdgeTypes: DEFAULT_ACTIVE_EDGES,
  loading: false,
  error: null,
  editMode: false,
};

// ============================================================
// Actions
// ============================================================

export type GraphAction =
  // Shared
  | { type: "LOAD_GRAPH_START" }
  | { type: "LOAD_GRAPH_ERROR"; error: string }
  | { type: "SELECT_NODE"; nodeId: string | null }
  | { type: "SELECT_FLOOR"; floor: number | null }
  | { type: "TOGGLE_EDGE_TYPE"; edgeType: string }
  | { type: "SET_EDGE_TYPES"; edgeTypes: Set<string> }
  | { type: "TOGGLE_EDIT_MODE" }
  // v1 (legacy VerticalNodeGraph)
  | { type: "LOAD_GRAPH_SUCCESS"; graph: VerticalNodeGraph }
  | { type: "UPDATE_NODE"; nodeId: string; updates: Partial<FloorNode> }
  | { type: "REMOVE_NODE"; nodeId: string }
  | { type: "ADD_NODE"; node: FloorNode }
  | { type: "MOVE_NODE"; nodeId: string; floorLevel: number; zone?: FloorZone }
  | { type: "SET_GRAPH"; graph: VerticalNodeGraph }
  // v2 (SpatialMassGraph)
  | { type: "LOAD_MASS_GRAPH_SUCCESS"; massGraph: SpatialMassGraph }
  | { type: "UPDATE_MASS_NODE"; nodeId: string; updates: Partial<MassNode> }
  | { type: "REMOVE_MASS_NODE"; nodeId: string }
  | { type: "ADD_MASS_NODE"; node: MassNode }
  | { type: "ADD_MASS_RELATION"; relation: MassRelation }
  | { type: "REMOVE_MASS_RELATION"; relationId: string }
  | { type: "SET_MASS_GRAPH"; massGraph: SpatialMassGraph };

// ============================================================
// Undo/Redo History
// ============================================================

const MAX_HISTORY = 50;

interface UndoState {
  past: (VerticalNodeGraph | SpatialMassGraph)[];
  future: (VerticalNodeGraph | SpatialMassGraph)[];
}

// ============================================================
// Reducer
// ============================================================

function graphReducer(state: GraphState, action: GraphAction): GraphState {
  switch (action.type) {
    case "LOAD_GRAPH_START":
      return { ...state, loading: true, error: null };

    case "LOAD_GRAPH_SUCCESS":
      return { ...state, graph: action.graph, graphVersion: 1, loading: false, error: null };

    case "LOAD_MASS_GRAPH_SUCCESS":
      return { ...state, massGraph: action.massGraph, graphVersion: 2, loading: false, error: null };

    case "LOAD_GRAPH_ERROR":
      return { ...state, loading: false, error: action.error };

    case "SELECT_NODE": {
      if (action.nodeId === null) {
        return { ...state, selectedNodeId: null, selectedFloor: null };
      }
      if (state.graphVersion === 2 && state.massGraph) {
        const massNode = state.massGraph.nodes.find((n) => n.id === action.nodeId);
        return {
          ...state,
          selectedNodeId: action.nodeId,
          selectedFloor: massNode?.floor_range[0] ?? state.selectedFloor,
        };
      }
      const node = state.graph?.nodes.find((n) => n.id === action.nodeId);
      return {
        ...state,
        selectedNodeId: action.nodeId,
        selectedFloor: node?.floor_level ?? state.selectedFloor,
      };
    }

    case "SELECT_FLOOR":
      return { ...state, selectedFloor: action.floor, selectedNodeId: null };

    case "TOGGLE_EDGE_TYPE": {
      const next = new Set(state.activeEdgeTypes);
      if (next.has(action.edgeType)) {
        next.delete(action.edgeType);
      } else {
        next.add(action.edgeType);
      }
      return { ...state, activeEdgeTypes: next };
    }

    case "SET_EDGE_TYPES":
      return { ...state, activeEdgeTypes: action.edgeTypes };

    case "TOGGLE_EDIT_MODE":
      return { ...state, editMode: !state.editMode };

    // ---- v1 (legacy) ----
    case "UPDATE_NODE": {
      if (!state.graph) return state;
      return { ...state, graph: coreUpdateNode(state.graph, action.nodeId, action.updates) };
    }

    case "REMOVE_NODE": {
      if (!state.graph) return state;
      return {
        ...state,
        graph: coreRemoveNode(state.graph, action.nodeId),
        selectedNodeId: state.selectedNodeId === action.nodeId ? null : state.selectedNodeId,
      };
    }

    case "ADD_NODE": {
      if (!state.graph) return state;
      return { ...state, graph: coreAddNode(state.graph, action.node), selectedNodeId: action.node.id };
    }

    case "MOVE_NODE": {
      if (!state.graph) return state;
      return { ...state, graph: coreMoveNode(state.graph, action.nodeId, action.floorLevel, action.zone) };
    }

    case "SET_GRAPH":
      return { ...state, graph: action.graph };

    // ---- v2 (SpatialMassGraph) ----
    case "UPDATE_MASS_NODE": {
      if (!state.massGraph) return state;
      return { ...state, massGraph: massUpdateNode(state.massGraph, action.nodeId, action.updates) };
    }

    case "REMOVE_MASS_NODE": {
      if (!state.massGraph) return state;
      return {
        ...state,
        massGraph: massRemoveNode(state.massGraph, action.nodeId),
        selectedNodeId: state.selectedNodeId === action.nodeId ? null : state.selectedNodeId,
      };
    }

    case "ADD_MASS_NODE": {
      if (!state.massGraph) return state;
      return { ...state, massGraph: massAddNode(state.massGraph, action.node), selectedNodeId: action.node.id };
    }

    case "ADD_MASS_RELATION": {
      if (!state.massGraph) return state;
      return { ...state, massGraph: massAddRelation(state.massGraph, action.relation) };
    }

    case "REMOVE_MASS_RELATION": {
      if (!state.massGraph) return state;
      return { ...state, massGraph: massRemoveRelation(state.massGraph, action.relationId) };
    }

    case "SET_MASS_GRAPH":
      return { ...state, massGraph: action.massGraph };

    default:
      return state;
  }
}

// ============================================================
// Context
// ============================================================

interface GraphContextValue {
  state: GraphState;
  dispatch: React.Dispatch<GraphAction>;
  // v1 helpers
  selectedNode: FloorNode | null;
  floorNodes: FloorNode[];
  // v2 helpers
  selectedMassNode: MassNode | null;
  massNodes: MassNode[];
  massRelations: MassRelation[];
  // shared
  loadGraph: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  editDispatch: (action: GraphAction) => void;
}

const GraphContext = createContext<GraphContextValue | null>(null);

export function GraphProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(graphReducer, initialState);
  const undoRef = useRef<UndoState>({ past: [], future: [] });

  // v1 derived
  const selectedNode =
    state.graph?.nodes.find((n) => n.id === state.selectedNodeId) ?? null;

  const floorNodes =
    state.selectedFloor !== null
      ? state.graph?.nodes.filter((n) => n.floor_level === state.selectedFloor) ?? []
      : [];

  // v2 derived
  const selectedMassNode =
    state.massGraph?.nodes.find((n) => n.id === state.selectedNodeId) ?? null;

  const massNodes = state.massGraph?.nodes ?? [];
  const massRelations = state.massGraph?.relations ?? [];

  const loadGraph = useCallback(async () => {
    dispatch({ type: "LOAD_GRAPH_START" });
    try {
      // Try v2 first, fall back to v1
      let resp = await fetch("/api/graph?version=2");
      if (resp.ok) {
        const data = await resp.json();
        if (data.metadata?.version === 2) {
          dispatch({ type: "LOAD_MASS_GRAPH_SUCCESS", massGraph: data });
          undoRef.current = { past: [], future: [] };
          return;
        }
      }
      // Fallback to v1
      resp = await fetch("/api/graph");
      if (!resp.ok) throw new Error("Failed to load graph");
      const data = await resp.json();
      dispatch({ type: "LOAD_GRAPH_SUCCESS", graph: data });
      undoRef.current = { past: [], future: [] };
    } catch (e) {
      dispatch({
        type: "LOAD_GRAPH_ERROR",
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }, []);

  // Editing actions that support undo
  const editDispatch = useCallback(
    (action: GraphAction) => {
      const v1EditActions = ["UPDATE_NODE", "REMOVE_NODE", "ADD_NODE", "MOVE_NODE"];
      const v2EditActions = ["UPDATE_MASS_NODE", "REMOVE_MASS_NODE", "ADD_MASS_NODE", "ADD_MASS_RELATION", "REMOVE_MASS_RELATION"];

      const currentGraph = state.graphVersion === 2 ? state.massGraph : state.graph;
      if ((v1EditActions.includes(action.type) || v2EditActions.includes(action.type)) && currentGraph) {
        const undo = undoRef.current;
        undo.past = [...undo.past.slice(-(MAX_HISTORY - 1)), currentGraph];
        undo.future = [];
      }
      dispatch(action);
    },
    [state.graph, state.massGraph, state.graphVersion]
  );

  const undo = useCallback(() => {
    const h = undoRef.current;
    if (h.past.length === 0) return;
    const prev = h.past[h.past.length - 1];
    h.past = h.past.slice(0, -1);

    if (state.graphVersion === 2 && state.massGraph) {
      h.future = [...h.future, state.massGraph];
      dispatch({ type: "SET_MASS_GRAPH", massGraph: prev as SpatialMassGraph });
    } else if (state.graph) {
      h.future = [...h.future, state.graph];
      dispatch({ type: "SET_GRAPH", graph: prev as VerticalNodeGraph });
    }
  }, [state.graph, state.massGraph, state.graphVersion]);

  const redo = useCallback(() => {
    const h = undoRef.current;
    if (h.future.length === 0) return;
    const next = h.future[h.future.length - 1];
    h.future = h.future.slice(0, -1);

    if (state.graphVersion === 2 && state.massGraph) {
      h.past = [...h.past, state.massGraph];
      dispatch({ type: "SET_MASS_GRAPH", massGraph: next as SpatialMassGraph });
    } else if (state.graph) {
      h.past = [...h.past, state.graph];
      dispatch({ type: "SET_GRAPH", graph: next as VerticalNodeGraph });
    }
  }, [state.graph, state.massGraph, state.graphVersion]);

  const canUndo = undoRef.current.past.length > 0;
  const canRedo = undoRef.current.future.length > 0;

  return (
    <GraphContext.Provider
      value={{
        state,
        dispatch,
        selectedNode,
        floorNodes,
        selectedMassNode,
        massNodes,
        massRelations,
        loadGraph,
        undo,
        redo,
        canUndo,
        canRedo,
        editDispatch,
      }}
    >
      {children}
    </GraphContext.Provider>
  );
}

export function useGraph() {
  const ctx = useContext(GraphContext);
  if (!ctx) throw new Error("useGraph must be used within GraphProvider");
  return ctx;
}
