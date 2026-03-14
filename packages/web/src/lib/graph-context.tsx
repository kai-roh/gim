"use client";

import React, { createContext, useContext, useReducer, useCallback } from "react";
import type { VerticalNodeGraph, FloorNode } from "@gim/core";

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
  | { type: "SET_EDGE_TYPES"; edgeTypes: Set<string> };

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
}

const GraphContext = createContext<GraphContextValue | null>(null);

export function GraphProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(graphReducer, initialState);

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
    } catch (e) {
      dispatch({
        type: "LOAD_GRAPH_ERROR",
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }, []);

  return (
    <GraphContext.Provider
      value={{ state, dispatch, selectedNode, floorNodes, loadGraph }}
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
