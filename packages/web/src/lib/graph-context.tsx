"use client";

import React, { createContext, useContext, useReducer, useCallback, useRef } from "react";
import type { VerticalNodeGraph, FloorNode, FloorZone } from "@gim/core";

// Inline immutable graph operations (from @gim/core/graph/operations)
// to avoid pulling in the full barrel export which includes Node.js-only modules

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

// ============================================================
// Graph State
// ============================================================

export interface GraphState {
  graph: VerticalNodeGraph | null;
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
]);

const initialState: GraphState = {
  graph: null,
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
  | { type: "LOAD_GRAPH_START" }
  | { type: "LOAD_GRAPH_SUCCESS"; graph: VerticalNodeGraph }
  | { type: "LOAD_GRAPH_ERROR"; error: string }
  | { type: "SELECT_NODE"; nodeId: string | null }
  | { type: "SELECT_FLOOR"; floor: number | null }
  | { type: "TOGGLE_EDGE_TYPE"; edgeType: string }
  | { type: "SET_EDGE_TYPES"; edgeTypes: Set<string> }
  | { type: "TOGGLE_EDIT_MODE" }
  | { type: "UPDATE_NODE"; nodeId: string; updates: Partial<FloorNode> }
  | { type: "REMOVE_NODE"; nodeId: string }
  | { type: "ADD_NODE"; node: FloorNode }
  | { type: "MOVE_NODE"; nodeId: string; floorLevel: number; zone?: FloorZone }
  | { type: "SET_GRAPH"; graph: VerticalNodeGraph };

// ============================================================
// Undo/Redo History
// ============================================================

const MAX_HISTORY = 50;

interface UndoState {
  past: VerticalNodeGraph[];
  future: VerticalNodeGraph[];
}

// ============================================================
// Reducer
// ============================================================

function graphReducer(state: GraphState, action: GraphAction): GraphState {
  switch (action.type) {
    case "LOAD_GRAPH_START":
      return { ...state, loading: true, error: null };

    case "LOAD_GRAPH_SUCCESS":
      return { ...state, graph: action.graph, loading: false, error: null };

    case "LOAD_GRAPH_ERROR":
      return { ...state, loading: false, error: action.error };

    case "SELECT_NODE": {
      if (action.nodeId === null) {
        return { ...state, selectedNodeId: null };
      }
      const node = state.graph?.nodes.find((n) => n.id === action.nodeId);
      return {
        ...state,
        selectedNodeId: action.nodeId,
        selectedFloor: node?.floor_level ?? state.selectedFloor,
      };
    }

    case "SELECT_FLOOR":
      return { ...state, selectedFloor: action.floor };

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

    case "UPDATE_NODE": {
      if (!state.graph) return state;
      const newGraph = coreUpdateNode(state.graph, action.nodeId, action.updates);
      return { ...state, graph: newGraph };
    }

    case "REMOVE_NODE": {
      if (!state.graph) return state;
      const newGraph = coreRemoveNode(state.graph, action.nodeId);
      return {
        ...state,
        graph: newGraph,
        selectedNodeId: state.selectedNodeId === action.nodeId ? null : state.selectedNodeId,
      };
    }

    case "ADD_NODE": {
      if (!state.graph) return state;
      const newGraph = coreAddNode(state.graph, action.node);
      return { ...state, graph: newGraph, selectedNodeId: action.node.id };
    }

    case "MOVE_NODE": {
      if (!state.graph) return state;
      const newGraph = coreMoveNode(state.graph, action.nodeId, action.floorLevel, action.zone);
      return { ...state, graph: newGraph };
    }

    case "SET_GRAPH":
      return { ...state, graph: action.graph };

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
  selectedNode: FloorNode | null;
  floorNodes: FloorNode[];
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

  const selectedNode =
    state.graph?.nodes.find((n) => n.id === state.selectedNodeId) ?? null;

  const floorNodes =
    state.selectedFloor !== null
      ? state.graph?.nodes.filter((n) => n.floor_level === state.selectedFloor) ?? []
      : [];

  const loadGraph = useCallback(async () => {
    dispatch({ type: "LOAD_GRAPH_START" });
    try {
      const resp = await fetch("/api/graph");
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
      const editActions = ["UPDATE_NODE", "REMOVE_NODE", "ADD_NODE", "MOVE_NODE"];
      if (editActions.includes(action.type) && state.graph) {
        const undo = undoRef.current;
        undo.past = [...undo.past.slice(-(MAX_HISTORY - 1)), state.graph];
        undo.future = [];
      }
      dispatch(action);
    },
    [state.graph]
  );

  const undo = useCallback(() => {
    const h = undoRef.current;
    if (h.past.length === 0 || !state.graph) return;
    const prev = h.past[h.past.length - 1];
    h.past = h.past.slice(0, -1);
    h.future = [...h.future, state.graph];
    dispatch({ type: "SET_GRAPH", graph: prev });
  }, [state.graph]);

  const redo = useCallback(() => {
    const h = undoRef.current;
    if (h.future.length === 0 || !state.graph) return;
    const next = h.future[h.future.length - 1];
    h.future = h.future.slice(0, -1);
    h.past = [...h.past, state.graph];
    dispatch({ type: "SET_GRAPH", graph: next });
  }, [state.graph]);

  const canUndo = undoRef.current.past.length > 0;
  const canRedo = undoRef.current.future.length > 0;

  return (
    <GraphContext.Provider
      value={{
        state,
        dispatch,
        selectedNode,
        floorNodes,
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
