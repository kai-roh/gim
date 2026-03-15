"use client";

import React, { createContext, useContext, useReducer, useCallback, useRef } from "react";
import type {
  MassNode,
  QuantitativeScenarioMetrics,
  ResolvedMassModel,
  SpatialMassGraph,
} from "@gim/core";
import {
  resolveSpatialMassModel,
  withResolvedMassModel,
} from "@gim/core/graph/resolved-model";
import { evaluateQuantitativeScenario } from "@gim/core/graph/scenario-metrics";

function coreAddNode(graph: SpatialMassGraph, node: MassNode): SpatialMassGraph {
  return withResolvedMassModel({
    ...graph,
    nodes: [...graph.nodes, node],
  });
}

function coreRemoveNode(graph: SpatialMassGraph, nodeId: string): SpatialMassGraph {
  const nodes = graph.nodes.filter((node) => node.id !== nodeId);
  const relations = graph.relations.filter(
    (relation) => relation.source !== nodeId && relation.target !== nodeId
  );

  return withResolvedMassModel({
    ...graph,
    nodes,
    relations,
  });
}

function coreUpdateNode(
  graph: SpatialMassGraph,
  nodeId: string,
  updates: Partial<MassNode>
): SpatialMassGraph {
  return withResolvedMassModel({
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === nodeId ? { ...node, ...updates, id: node.id } : node
    ),
  });
}

export interface ModelVariantSnapshot {
  id: string;
  label: string;
  seed: number;
  generatedAt: string;
  previewDataUrl: string | null;
  resolvedModel: ResolvedMassModel;
  scenarioMetrics: QuantitativeScenarioMetrics;
}

function withCurrentResolvedModel(
  graph: SpatialMassGraph,
  resolvedModel: ResolvedMassModel
): SpatialMassGraph {
  return {
    ...graph,
    resolved_model: resolvedModel,
  };
}

function createVariantSnapshot(
  graph: SpatialMassGraph,
  resolvedModel: ResolvedMassModel
): ModelVariantSnapshot {
  return {
    id: resolvedModel.variant_id,
    label: resolvedModel.variant_label,
    seed: resolvedModel.seed,
    generatedAt: resolvedModel.generated_at,
    previewDataUrl: null,
    resolvedModel,
    scenarioMetrics: evaluateQuantitativeScenario(
      withCurrentResolvedModel(graph, resolvedModel)
    ),
  };
}

function initializeVariantState(graph: SpatialMassGraph) {
  const snapshot = createVariantSnapshot(graph, graph.resolved_model);
  return {
    graph,
    variantHistory: [snapshot],
    activeVariantId: snapshot.id,
  };
}

export interface GraphState {
  graph: SpatialMassGraph | null;
  selectedNodeId: string | null;
  activeRelationFamilies: Set<string>;
  loading: boolean;
  error: string | null;
  editMode: boolean;
  variantHistory: ModelVariantSnapshot[];
  activeVariantId: string | null;
}

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
  selectedNodeId: null,
  activeRelationFamilies: DEFAULT_ACTIVE_RELATIONS,
  loading: false,
  error: null,
  editMode: false,
  variantHistory: [],
  activeVariantId: null,
};

export type GraphAction =
  | { type: "LOAD_GRAPH_START" }
  | { type: "LOAD_GRAPH_SUCCESS"; graph: SpatialMassGraph }
  | { type: "LOAD_GRAPH_ERROR"; error: string }
  | { type: "SELECT_NODE"; nodeId: string | null }
  | { type: "TOGGLE_RELATION_FAMILY"; family: string }
  | { type: "SET_RELATION_FAMILIES"; families: Set<string> }
  | { type: "TOGGLE_EDIT_MODE" }
  | { type: "UPDATE_NODE"; nodeId: string; updates: Partial<MassNode> }
  | { type: "REMOVE_NODE"; nodeId: string }
  | { type: "ADD_NODE"; node: MassNode }
  | { type: "SET_GRAPH"; graph: SpatialMassGraph }
  | { type: "ADD_MODEL_VARIANT"; resolvedModel: ResolvedMassModel }
  | { type: "SET_ACTIVE_VARIANT"; variantId: string }
  | { type: "SET_VARIANT_PREVIEW"; variantId: string; previewDataUrl: string };

const MAX_HISTORY = 50;
const MAX_VARIANTS = 12;

interface UndoState {
  past: SpatialMassGraph[];
  future: SpatialMassGraph[];
}

function graphReducer(state: GraphState, action: GraphAction): GraphState {
  switch (action.type) {
    case "LOAD_GRAPH_START":
      return { ...state, loading: true, error: null };
    case "LOAD_GRAPH_SUCCESS": {
      const graph = withResolvedMassModel(action.graph);
      return { ...state, ...initializeVariantState(graph), loading: false, error: null };
    }
    case "LOAD_GRAPH_ERROR":
      return { ...state, loading: false, error: action.error };
    case "SELECT_NODE":
      return { ...state, selectedNodeId: action.nodeId };
    case "TOGGLE_RELATION_FAMILY": {
      const next = new Set(state.activeRelationFamilies);
      if (next.has(action.family)) next.delete(action.family);
      else next.add(action.family);
      return { ...state, activeRelationFamilies: next };
    }
    case "SET_RELATION_FAMILIES":
      return { ...state, activeRelationFamilies: action.families };
    case "TOGGLE_EDIT_MODE":
      return { ...state, editMode: !state.editMode };
    case "UPDATE_NODE":
      return state.graph
        ? {
            ...state,
            ...initializeVariantState(coreUpdateNode(state.graph, action.nodeId, action.updates)),
          }
        : state;
    case "REMOVE_NODE":
      return state.graph
        ? {
            ...state,
            ...initializeVariantState(coreRemoveNode(state.graph, action.nodeId)),
            selectedNodeId:
              state.selectedNodeId === action.nodeId ? null : state.selectedNodeId,
          }
        : state;
    case "ADD_NODE":
      return state.graph
        ? {
            ...state,
            ...initializeVariantState(coreAddNode(state.graph, action.node)),
            selectedNodeId: action.node.id,
          }
        : state;
    case "SET_GRAPH": {
      const graph = withResolvedMassModel(action.graph);
      return { ...state, ...initializeVariantState(graph) };
    }
    case "ADD_MODEL_VARIANT":
      return state.graph
        ? (() => {
            const snapshot = createVariantSnapshot(state.graph, action.resolvedModel);
            const history = [
              ...state.variantHistory.filter((item) => item.id !== snapshot.id),
              snapshot,
            ].slice(-MAX_VARIANTS);

            return {
              ...state,
              graph: withCurrentResolvedModel(state.graph, action.resolvedModel),
              variantHistory: history,
              activeVariantId: snapshot.id,
            };
          })()
        : state;
    case "SET_ACTIVE_VARIANT": {
      if (!state.graph) return state;
      const snapshot = state.variantHistory.find((item) => item.id === action.variantId);
      if (!snapshot) return state;
      return {
        ...state,
        graph: withCurrentResolvedModel(state.graph, snapshot.resolvedModel),
        activeVariantId: snapshot.id,
      };
    }
    case "SET_VARIANT_PREVIEW":
      return {
        ...state,
        variantHistory: state.variantHistory.map((item) =>
          item.id === action.variantId
            ? { ...item, previewDataUrl: action.previewDataUrl }
            : item
        ),
      };
    default:
      return state;
  }
}

interface GraphContextValue {
  state: GraphState;
  dispatch: React.Dispatch<GraphAction>;
  selectedNode: MassNode | null;
  loadGraph: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  editDispatch: (action: GraphAction) => void;
  variantHistory: ModelVariantSnapshot[];
  activeVariantId: string | null;
  regenerateVariant: () => void;
  activateVariant: (variantId: string) => void;
  setVariantPreview: (variantId: string, previewDataUrl: string) => void;
}

const GraphContext = createContext<GraphContextValue | null>(null);

export function GraphProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(graphReducer, initialState);
  const undoRef = useRef<UndoState>({ past: [], future: [] });

  const selectedNode =
    state.graph?.nodes.find((node) => node.id === state.selectedNodeId) ?? null;

  const loadGraph = useCallback(async () => {
    dispatch({ type: "LOAD_GRAPH_START" });
    try {
      const response = await fetch("/api/graph");
      if (!response.ok) throw new Error("Failed to load graph");
      const graph = withResolvedMassModel((await response.json()) as SpatialMassGraph);
      dispatch({ type: "LOAD_GRAPH_SUCCESS", graph });
      undoRef.current = { past: [], future: [] };
    } catch (error) {
      dispatch({
        type: "LOAD_GRAPH_ERROR",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, []);

  const editDispatch = useCallback(
    (action: GraphAction) => {
      if (
        ["UPDATE_NODE", "REMOVE_NODE", "ADD_NODE"].includes(action.type) &&
        state.graph
      ) {
        const undo = undoRef.current;
        undo.past = [...undo.past.slice(-(MAX_HISTORY - 1)), state.graph];
        undo.future = [];
      }
      dispatch(action);
    },
    [state.graph]
  );

  const undo = useCallback(() => {
    const history = undoRef.current;
    if (history.past.length === 0 || !state.graph) return;
    const previous = history.past[history.past.length - 1];
    history.past = history.past.slice(0, -1);
    history.future = [...history.future, state.graph];
    dispatch({ type: "SET_GRAPH", graph: previous });
  }, [state.graph]);

  const redo = useCallback(() => {
    const history = undoRef.current;
    if (history.future.length === 0 || !state.graph) return;
    const next = history.future[history.future.length - 1];
    history.future = history.future.slice(0, -1);
    history.past = [...history.past, state.graph];
    dispatch({ type: "SET_GRAPH", graph: next });
  }, [state.graph]);

  const canUndo = undoRef.current.past.length > 0;
  const canRedo = undoRef.current.future.length > 0;

  const regenerateVariant = useCallback(() => {
    if (!state.graph) return;
    const nextIndex = state.variantHistory.length + 1;
    const seed =
      Math.floor(Date.now() % 2147483647) +
      nextIndex * 7919 +
      state.graph.nodes.length * 97 +
      state.graph.relations.length * 193;
    const variantLabel = `V${String(nextIndex).padStart(2, "0")}`;
    const resolvedModel = resolveSpatialMassModel(state.graph, {
      seed,
      variant_id: `variant-${seed}`,
      variant_label: variantLabel,
    });
    dispatch({ type: "ADD_MODEL_VARIANT", resolvedModel });
  }, [state.graph, state.variantHistory.length]);

  const activateVariant = useCallback((variantId: string) => {
    dispatch({ type: "SET_ACTIVE_VARIANT", variantId });
  }, []);

  const setVariantPreview = useCallback((variantId: string, previewDataUrl: string) => {
    dispatch({ type: "SET_VARIANT_PREVIEW", variantId, previewDataUrl });
  }, []);

  return (
    <GraphContext.Provider
      value={{
        state,
        dispatch,
        selectedNode,
        loadGraph,
        undo,
        redo,
        canUndo,
        canRedo,
        editDispatch,
        variantHistory: state.variantHistory,
        activeVariantId: state.activeVariantId,
        regenerateVariant,
        activateVariant,
        setVariantPreview,
      }}
    >
      {children}
    </GraphContext.Provider>
  );
}

export function useGraph() {
  const context = useContext(GraphContext);
  if (!context) throw new Error("useGraph must be used within GraphProvider");
  return context;
}
