"use client";

import React, { createContext, useContext, useReducer, useCallback } from "react";
import type { ArchitectResponse, DiscussionPhase } from "@gim/core";

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

export interface ForumState {
  sessionId: string | null;
  selectedArchitects: string[];
  architects: ArchitectSummary[];
  currentPhase: DiscussionPhase | null;
  phases: {
    phase: DiscussionPhase;
    responses: { architectId: string; response: ArchitectResponse }[];
  }[];
  streamingArchitectId: string | null;
  streamingTokens: string;
  status: "idle" | "selecting" | "streaming" | "phase_complete" | "all_complete";
  error: string | null;
}

const initialState: ForumState = {
  sessionId: null,
  selectedArchitects: [],
  architects: [],
  currentPhase: null,
  phases: [],
  streamingArchitectId: null,
  streamingTokens: "",
  status: "selecting",
  error: null,
};

// ============================================================
// Actions
// ============================================================

export type ForumAction =
  | { type: "SET_ARCHITECTS"; architects: ArchitectSummary[] }
  | { type: "TOGGLE_ARCHITECT"; id: string }
  | { type: "SESSION_CREATED"; sessionId: string }
  | { type: "PHASE_STARTED"; phase: DiscussionPhase }
  | { type: "ARCHITECT_STARTED"; architectId: string }
  | { type: "TOKEN_RECEIVED"; architectId: string; token: string }
  | { type: "ARCHITECT_COMPLETE"; architectId: string; response: ArchitectResponse }
  | { type: "PHASE_COMPLETE"; phase: DiscussionPhase }
  | { type: "ALL_COMPLETE" }
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
      return { ...state, status: "all_complete" };

    case "ERROR":
      return { ...state, error: action.error, status: "idle" };

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
  startSession: () => Promise<void>;
  runPhase: (phase: DiscussionPhase) => Promise<void>;
}

const ForumContext = createContext<ForumContextValue | null>(null);

export function ForumProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(forumReducer, initialState);

  const startSession = useCallback(async () => {
    try {
      const resp = await fetch("/api/forum/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ panelIds: state.selectedArchitects }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      dispatch({ type: "SESSION_CREATED", sessionId: data.sessionId });
    } catch (e) {
      dispatch({ type: "ERROR", error: e instanceof Error ? e.message : "Failed to create session" });
    }
  }, [state.selectedArchitects]);

  const runPhase = useCallback(
    async (phase: DiscussionPhase) => {
      if (!state.sessionId) return;

      dispatch({ type: "PHASE_STARTED", phase });

      try {
        const eventSource = new EventSource(
          `/api/forum/stream?sessionId=${state.sessionId}&phase=${phase}`
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
        });

        eventSource.addEventListener("forum:phase_complete", () => {
          dispatch({ type: "PHASE_COMPLETE", phase });
          eventSource.close();
        });

        eventSource.addEventListener("forum:done", () => {
          dispatch({ type: "PHASE_COMPLETE", phase });
          eventSource.close();
        });

        eventSource.addEventListener("forum:error", (e) => {
          const data = JSON.parse(e.data);
          dispatch({ type: "ERROR", error: data.error });
          eventSource.close();
        });

        eventSource.onerror = () => {
          dispatch({ type: "PHASE_COMPLETE", phase });
          eventSource.close();
        };
      } catch (e) {
        dispatch({ type: "ERROR", error: e instanceof Error ? e.message : "Streaming error" });
      }
    },
    [state.sessionId]
  );

  return (
    <ForumContext.Provider value={{ state, dispatch, startSession, runPhase }}>
      {children}
    </ForumContext.Provider>
  );
}

export function useForum() {
  const ctx = useContext(ForumContext);
  if (!ctx) throw new Error("useForum must be used within ForumProvider");
  return ctx;
}
