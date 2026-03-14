"use client";

import React, { createContext, useContext, useReducer, useCallback, useRef } from "react";
import type { ArchitectResponse, DiscussionPhase, VerticalNodeGraph } from "@gim/core";

// ============================================================
// State
// ============================================================

export interface ArchitectSummary {
  id: string;
  reference: string;
  category: string;
  assertiveness: number;
  compromise_willingness: number;
  focus_priority: string[];
  representative_buildings: string[];
}

export interface ForumMessage {
  id: string;
  type: "user" | "system" | "architect" | "phase" | "graph";
  content: string;
  architectId?: string;
  phase?: DiscussionPhase;
  timestamp: number;
}

export interface ForumState {
  sessionId: string | null;
  selectedArchitects: string[];
  architects: ArchitectSummary[];
  currentPhase: DiscussionPhase | null;
  phases: {
    phase: DiscussionPhase;
    responses: { architectId: string; response: ArchitectResponse }[];
  }[];
  messages: ForumMessage[];
  streamingArchitectId: string | null;
  streamingTokens: string;
  status: "idle" | "selecting" | "streaming" | "phase_complete" | "all_complete";
  error: string | null;
  brief: string | null;
  autoRunning: boolean;
}

const initialState: ForumState = {
  sessionId: null,
  selectedArchitects: [],
  architects: [],
  currentPhase: null,
  phases: [],
  messages: [],
  streamingArchitectId: null,
  streamingTokens: "",
  status: "selecting",
  error: null,
  brief: null,
  autoRunning: false,
};

// ============================================================
// Actions
// ============================================================

export type ForumAction =
  | { type: "SET_ARCHITECTS"; architects: ArchitectSummary[] }
  | { type: "TOGGLE_ARCHITECT"; id: string }
  | { type: "SET_BRIEF"; brief: string }
  | { type: "ADD_MESSAGE"; message: ForumMessage }
  | { type: "SESSION_CREATED"; sessionId: string }
  | { type: "PHASE_STARTED"; phase: DiscussionPhase }
  | { type: "ARCHITECT_STARTED"; architectId: string }
  | { type: "TOKEN_RECEIVED"; architectId: string; token: string }
  | { type: "ARCHITECT_COMPLETE"; architectId: string; response: ArchitectResponse }
  | { type: "PHASE_COMPLETE"; phase: DiscussionPhase }
  | { type: "ALL_COMPLETE" }
  | { type: "SET_AUTO_RUNNING"; running: boolean }
  | { type: "ERROR"; error: string }
  | { type: "RESET" };

// ============================================================
// Reducer
// ============================================================

function forumReducer(state: ForumState, action: ForumAction): ForumState {
  switch (action.type) {
    case "SET_ARCHITECTS":
      return { ...state, architects: action.architects };

    case "TOGGLE_ARCHITECT": {
      const selected = state.selectedArchitects.includes(action.id)
        ? state.selectedArchitects.filter((id) => id !== action.id)
        : [...state.selectedArchitects, action.id].slice(0, 5);
      return { ...state, selectedArchitects: selected };
    }

    case "SET_BRIEF":
      return { ...state, brief: action.brief };

    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };

    case "SESSION_CREATED":
      return { ...state, sessionId: action.sessionId, status: "idle" };

    case "PHASE_STARTED":
      return {
        ...state,
        currentPhase: action.phase,
        status: "streaming",
        streamingTokens: "",
        streamingArchitectId: null,
      };

    case "ARCHITECT_STARTED":
      return {
        ...state,
        streamingArchitectId: action.architectId,
        streamingTokens: "",
      };

    case "TOKEN_RECEIVED":
      return {
        ...state,
        streamingTokens: state.streamingTokens + action.token,
      };

    case "ARCHITECT_COMPLETE": {
      const phaseIdx = state.phases.findIndex((p) => p.phase === state.currentPhase);
      const phases = [...state.phases];
      if (phaseIdx >= 0) {
        phases[phaseIdx] = {
          ...phases[phaseIdx],
          responses: [
            ...phases[phaseIdx].responses,
            { architectId: action.architectId, response: action.response },
          ],
        };
      } else {
        phases.push({
          phase: state.currentPhase!,
          responses: [{ architectId: action.architectId, response: action.response }],
        });
      }
      return {
        ...state,
        phases,
        streamingArchitectId: null,
        streamingTokens: "",
      };
    }

    case "PHASE_COMPLETE":
      return { ...state, status: "phase_complete" };

    case "ALL_COMPLETE":
      return { ...state, status: "all_complete", autoRunning: false };

    case "SET_AUTO_RUNNING":
      return { ...state, autoRunning: action.running };

    case "ERROR":
      return { ...state, error: action.error, status: "idle", autoRunning: false };

    case "RESET":
      return { ...initialState, architects: state.architects };

    default:
      return state;
  }
}

// ============================================================
// Context
// ============================================================

interface ForumContextValue {
  state: ForumState;
  dispatch: React.Dispatch<ForumAction>;
  startSession: (brief?: string) => Promise<void>;
  runPhase: (phase: DiscussionPhase) => Promise<void>;
  runAllPhases: () => Promise<void>;
  addMessage: (type: ForumMessage["type"], content: string, extra?: Partial<ForumMessage>) => void;
}

const ForumContext = createContext<ForumContextValue | null>(null);

const PHASE_ORDER: DiscussionPhase[] = ["proposal", "cross_critique", "convergence"];

interface ForumProviderProps {
  children: React.ReactNode;
  onGraphGenerated?: (graph: VerticalNodeGraph) => void;
}

export function ForumProvider({ children, onGraphGenerated }: ForumProviderProps) {
  const [state, dispatch] = useReducer(forumReducer, initialState);
  const onGraphRef = useRef(onGraphGenerated);
  onGraphRef.current = onGraphGenerated;
  const stateRef = useRef(state);
  stateRef.current = state;

  const addMessage = useCallback(
    (type: ForumMessage["type"], content: string, extra?: Partial<ForumMessage>) => {
      dispatch({
        type: "ADD_MESSAGE",
        message: {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type,
          content,
          timestamp: Date.now(),
          ...extra,
        },
      });
    },
    []
  );

  const startSession = useCallback(async (brief?: string) => {
    const s = stateRef.current;
    try {
      const resp = await fetch("/api/forum/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          panelIds: s.selectedArchitects,
          brief: brief || s.brief || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      dispatch({ type: "SESSION_CREATED", sessionId: data.sessionId });
      addMessage("system", `Session created. Panel: ${s.selectedArchitects.map((a) => a.replace(/_/g, " ")).join(", ")}`);
    } catch (e) {
      dispatch({ type: "ERROR", error: e instanceof Error ? e.message : "Failed to create session" });
    }
  }, [addMessage]);

  const runPhase = useCallback(
    (phase: DiscussionPhase): Promise<void> => {
      const s = stateRef.current;
      if (!s.sessionId) return Promise.resolve();

      dispatch({ type: "PHASE_STARTED", phase });

      const PHASE_NAMES: Record<string, string> = {
        proposal: "발제 (Proposal)",
        cross_critique: "교차 비평 (Cross Critique)",
        convergence: "수렴 (Convergence)",
      };
      addMessage("phase", `── ${PHASE_NAMES[phase] || phase} ──`, { phase });

      return new Promise<void>((resolve) => {
        const eventSource = new EventSource(
          `/api/forum/stream?sessionId=${s.sessionId}&phase=${phase}`
        );

        eventSource.addEventListener("forum:architect_started", (e) => {
          const data = JSON.parse(e.data);
          dispatch({ type: "ARCHITECT_STARTED", architectId: data.architectId });
        });

        eventSource.addEventListener("forum:token", (e) => {
          const data = JSON.parse(e.data);
          dispatch({ type: "TOKEN_RECEIVED", architectId: data.architectId, token: data.token });
        });

        eventSource.addEventListener("forum:architect_complete", (e) => {
          const data = JSON.parse(e.data);
          dispatch({
            type: "ARCHITECT_COMPLETE",
            architectId: data.architectId,
            response: data.response,
          });
          // Add architect response as a chat message
          const r = data.response as ArchitectResponse;
          const zoningText = r.proposal?.vertical_zoning
            ?.slice(0, 5)
            .map((z: any) => `  ${z.zone}: ${z.floors[0]}~${z.floors[1]}F — ${z.primary_function}`)
            .join("\n") || "";
          addMessage("architect", `${r.stance}\n\n${r.reasoning.slice(0, 300)}${r.reasoning.length > 300 ? "..." : ""}${zoningText ? "\n\n" + zoningText : ""}`, {
            architectId: data.architectId,
            phase,
          });
        });

        eventSource.addEventListener("forum:phase_complete", () => {
          dispatch({ type: "PHASE_COMPLETE", phase });
        });

        eventSource.addEventListener("forum:graph_generated", (e) => {
          const data = JSON.parse(e.data);
          onGraphRef.current?.(data.graph);
          const g = data.graph;
          addMessage("graph", `Graph generated: ${g.nodes.length} nodes, ${g.edges.length} edges (F${g.metadata.floor_range[0]}~${g.metadata.floor_range[1]})`);
        });

        eventSource.addEventListener("forum:saved", (e) => {
          const data = JSON.parse(e.data);
          if (data.forumPath || data.graphPath) {
            addMessage("system", `Saved: ${[data.forumPath, data.graphPath].filter(Boolean).join(", ")}`);
          }
        });

        eventSource.addEventListener("forum:done", () => {
          dispatch({ type: "PHASE_COMPLETE", phase });
          eventSource.close();
          resolve();
        });

        eventSource.addEventListener("forum:error", (e) => {
          const data = JSON.parse(e.data);
          dispatch({ type: "ERROR", error: data.error });
          eventSource.close();
          resolve();
        });

        eventSource.onerror = () => {
          dispatch({ type: "PHASE_COMPLETE", phase });
          eventSource.close();
          resolve();
        };
      });
    },
    [addMessage]
  );

  const runAllPhases = useCallback(async () => {
    dispatch({ type: "SET_AUTO_RUNNING", running: true });
    for (const phase of PHASE_ORDER) {
      if (stateRef.current.error) break;
      await runPhase(phase);
    }
    dispatch({ type: "ALL_COMPLETE" });
  }, [runPhase]);

  return (
    <ForumContext.Provider value={{ state, dispatch, startSession, runPhase, runAllPhases, addMessage }}>
      {children}
    </ForumContext.Provider>
  );
}

export function useForum() {
  const ctx = useContext(ForumContext);
  if (!ctx) throw new Error("useForum must be used within ForumProvider");
  return ctx;
}
