"use client";

import React, { createContext, useContext, useReducer, useCallback, useRef } from "react";
import type { ArchitectResponse, DiscussionPhase, SpatialMassGraph } from "@gim/core";

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
      const phaseIdx = state.phases.findIndex((phase) => phase.phase === state.currentPhase);
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
      return {
        ...state,
        status: "phase_complete",
        streamingArchitectId: null,
        streamingTokens: "",
      };
    case "ALL_COMPLETE":
      return { ...state, status: "all_complete", autoRunning: false };
    case "SET_AUTO_RUNNING":
      return { ...state, autoRunning: action.running };
    case "ERROR":
      return {
        ...state,
        error: action.error,
        status: "idle",
        autoRunning: false,
        currentPhase: null,
        streamingArchitectId: null,
        streamingTokens: "",
      };
    case "RESET":
      return { ...initialState, architects: state.architects };
    default:
      return state;
  }
}

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
const PHASE_LABELS: Record<DiscussionPhase, string> = {
  proposal: "발제",
  cross_critique: "교차 비평",
  convergence: "수렴",
  expert_review: "전문가 검토",
  finalization: "최종 정리",
};

interface ForumProviderProps {
  children: React.ReactNode;
  onGraphGenerated?: (graph: SpatialMassGraph) => void;
}

function summarizeArchitectResponse(response: ArchitectResponse): string {
  const nodes = response.proposal.mass_entities
    .slice(0, 4)
    .map((node) => `- ${node.name} (${node.kind}, ${node.spatial_role})`)
    .join("\n");
  const relations = response.proposal.mass_relations
    .slice(0, 4)
    .map((relation) => `- ${relation.source_id} ${relation.rule} ${relation.target_id}`)
    .join("\n");

  return `${response.stance}\n\n주요 masses:\n${nodes || "- 없음"}\n\n주요 relations:\n${
    relations || "- 없음"
  }`;
}

function summarizePhaseCompletion(phase: DiscussionPhase, responses: ArchitectResponse[]): string {
  const nodeCount = responses.reduce(
    (count, response) => count + response.proposal.mass_entities.length,
    0
  );
  const relationCount = responses.reduce(
    (count, response) => count + response.proposal.mass_relations.length,
    0
  );

  return `${PHASE_LABELS[phase]} 단계 정리 완료. ${responses.length}명의 건축가가 ${nodeCount}개 mass와 ${relationCount}개 관계를 제안했습니다.`;
}

function summarizeGraphResult(graph: SpatialMassGraph, phase: DiscussionPhase): string {
  const title = phase === "convergence" ? "최종 합의 그래프" : "현재 합의 그래프";
  const masses = graph.nodes
    .slice(0, 5)
    .map((node) => `- ${node.name}: ${node.spatial_role}`)
    .join("\n");
  const relations = graph.relations
    .filter((relation) => !relation.id.includes("__inverse"))
    .slice(0, 5)
    .map((relation) => `- ${relation.source} ${relation.rule} ${relation.target}`)
    .join("\n");
  const contributors = graph.provenance.architect_contributions
    .slice(0, 4)
    .map((contribution) => `- ${contribution.architect_id}: ${contribution.emphasis}`)
    .join("\n");

  return `${title}\n\n개념: ${graph.narrative.overall_architectural_concept}\n전략: ${
    graph.narrative.massing_strategy_summary
  }\n\n주요 masses:\n${masses || "- 없음"}\n\n주요 relations:\n${
    relations || "- 없음"
  }\n\n주요 판단:\n${contributors || "- 없음"}`;
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

  const startSession = useCallback(
    async (brief?: string) => {
      const current = stateRef.current;
      try {
        const response = await fetch("/api/forum/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            panelIds: current.selectedArchitects,
            brief: brief || current.brief || undefined,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        dispatch({ type: "SESSION_CREATED", sessionId: data.sessionId });
        addMessage(
          "system",
          `Session created. Panel: ${current.selectedArchitects
            .map((architectId) => architectId.replace(/_/g, " "))
            .join(", ")}`
        );
      } catch (error) {
        dispatch({
          type: "ERROR",
          error: error instanceof Error ? error.message : "Failed to create session",
        });
      }
    },
    [addMessage]
  );

  const runPhase = useCallback(
    (phase: DiscussionPhase): Promise<void> => {
      const current = stateRef.current;
      if (!current.sessionId) return Promise.resolve();

      dispatch({ type: "PHASE_STARTED", phase });

      addMessage("phase", `── ${PHASE_LABELS[phase] || phase} ──`, { phase });

      return new Promise<void>((resolve) => {
        const eventSource = new EventSource(
          `/api/forum/stream?sessionId=${current.sessionId}&phase=${phase}`
        );

        eventSource.addEventListener("forum:architect_started", (event) => {
          const data = JSON.parse(event.data);
          dispatch({ type: "ARCHITECT_STARTED", architectId: data.architectId });
        });

        eventSource.addEventListener("forum:token", (event) => {
          const data = JSON.parse(event.data);
          dispatch({
            type: "TOKEN_RECEIVED",
            architectId: data.architectId,
            token: data.token,
          });
        });

        eventSource.addEventListener("forum:architect_complete", (event) => {
          const data = JSON.parse(event.data);
          const response = data.response as ArchitectResponse;
          dispatch({
            type: "ARCHITECT_COMPLETE",
            architectId: data.architectId,
            response,
          });
          addMessage("architect", summarizeArchitectResponse(response), {
            architectId: data.architectId,
            phase,
          });
        });

        eventSource.addEventListener("forum:phase_complete", (event) => {
          const data = JSON.parse(event.data) as {
            phase: DiscussionPhase;
            responses: ArchitectResponse[];
          };
          dispatch({ type: "PHASE_COMPLETE", phase: data.phase });
          addMessage("system", summarizePhaseCompletion(data.phase, data.responses), {
            phase: data.phase,
          });
        });

        eventSource.addEventListener("forum:graph_generated", (event) => {
          const data = JSON.parse(event.data);
          const graph = data.graph as SpatialMassGraph;
          onGraphRef.current?.(graph);
          addMessage("graph", summarizeGraphResult(graph, phase), { phase });
        });

        eventSource.addEventListener("forum:graph_error", (event) => {
          const data = JSON.parse(event.data);
          addMessage("system", `그래프 정리 실패: ${data.error}`, { phase });
        });

        eventSource.addEventListener("forum:saved", (event) => {
          const data = JSON.parse(event.data);
          if (data.forumPath || data.graphPath) {
            addMessage(
              "system",
              `Saved: ${[data.forumPath, data.graphPath].filter(Boolean).join(", ")}`
            );
          }
        });

        eventSource.addEventListener("forum:done", () => {
          dispatch({ type: "PHASE_COMPLETE", phase });
          if (phase === "convergence") {
            addMessage(
              "system",
              "최종 합의안이 그래프와 서술 메타데이터로 정리되었습니다. 좌우 패널에서 mass와 관계를 확인할 수 있습니다.",
              { phase }
            );
          }
          eventSource.close();
          resolve();
        });

        eventSource.addEventListener("forum:error", (event) => {
          const data = JSON.parse(event.data);
          addMessage("system", `포럼 실행 실패: ${data.error}`, { phase });
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
    <ForumContext.Provider
      value={{ state, dispatch, startSession, runPhase, runAllPhases, addMessage }}
    >
      {children}
    </ForumContext.Provider>
  );
}

export function useForum() {
  const context = useContext(ForumContext);
  if (!context) throw new Error("useForum must be used within ForumProvider");
  return context;
}
