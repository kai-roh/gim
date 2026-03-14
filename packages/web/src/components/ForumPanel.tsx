"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useForum, type ArchitectSummary, type ForumMessage } from "@/lib/forum-context";
import { useGraph } from "@/lib/graph-context";
import type { DiscussionPhase, SpatialMassGraph } from "@gim/core";
import { massColor } from "@/lib/graph-colors";

const PHASE_ORDER: DiscussionPhase[] = ["proposal", "cross_critique", "convergence"];
const PHASE_LABELS: Record<DiscussionPhase, string> = {
  proposal: "발제",
  cross_critique: "교차 비평",
  mass_consensus: "매스 합의",
  convergence: "수렴",
  expert_review: "전문가 검토",
  finalization: "최종 정리",
  feedback_opinion: "피드백 반영",
};

interface SessionSummary {
  id: string;
  timestamp: string;
  location: string;
  company: string;
  panel: string[];
  nodeCount: number;
  relationCount: number;
  hasGraph: boolean;
}

function triggerJsonDownload(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function withDisplayColorsInGraph(graph: SpatialMassGraph) {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      properties: {
        ...node.properties,
        display_color: massColor(node.id),
      },
    })),
  };
}

function withDisplayColorsInForumResult(result: any) {
  return {
    ...result,
    rounds: Array.isArray(result?.rounds)
      ? result.rounds.map((round: any) => ({
          ...round,
          responses: Array.isArray(round?.responses)
            ? round.responses.map((response: any) => ({
                ...response,
                proposal: {
                  ...response.proposal,
                  mass_entities: Array.isArray(response?.proposal?.mass_entities)
                    ? response.proposal.mass_entities.map((node: any) => ({
                        ...node,
                        properties: {
                          ...(node.properties ?? {}),
                          display_color: massColor(node.id),
                        },
                      }))
                    : response?.proposal?.mass_entities,
                },
              }))
            : round?.responses,
        }))
      : result?.rounds,
  };
}

export function ForumPanel() {
  const { state, dispatch, startSession, runPhase, runAllPhases, addMessage } = useForum();
  const graph = useGraph();
  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showArchitectSelector, setShowArchitectSelector] = useState(true);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/architects")
      .then((response) => response.json())
      .then((data) => dispatch({ type: "SET_ARCHITECTS", architects: data }))
      .catch(() => {});
  }, [dispatch]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.messages, state.streamingTokens]);

  useEffect(() => {
    if (state.sessionId) {
      setShowArchitectSelector(false);
      return;
    }
    if (state.selectedArchitects.length === 0) {
      setShowArchitectSelector(true);
    }
  }, [state.sessionId, state.selectedArchitects.length]);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const response = await fetch("/api/sessions");
      const data = await response.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      setSessions([]);
    }
    setLoadingSessions(false);
  }, []);

  useEffect(() => {
    if (showHistory) {
      loadSessions();
    }
  }, [showHistory, loadSessions]);

  const loadSessionGraph = useCallback(
    async (sessionId: string) => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/graph`);
        if (!response.ok) return;
        const graphData = await response.json();
        graph.dispatch({ type: "LOAD_GRAPH_SUCCESS", graph: graphData });
        const session = sessions.find((item) => item.id === sessionId);
        addMessage(
          "system",
          `Loaded: ${session?.company ?? "Unknown"} — ${session?.location ?? ""} (${graphData.nodes?.length ?? 0} masses)`
        );
        setShowHistory(false);
      } catch {
        addMessage("system", "Failed to load session.");
      }
    },
    [graph, sessions, addMessage]
  );

  const canStart = state.selectedArchitects.length >= 2 && !state.sessionId;
  const isStreaming = state.status === "streaming";
  const hasFinalGraph = !!graph.state.graph;
  const composerLabel = state.sessionId ? "Send" : "Run Forum";
  const composerDisabled = isStreaming || input.trim().length === 0 || (!state.sessionId && !canStart);

  const getNextPhase = (): DiscussionPhase | null => {
    if (state.phases.length === 0) return "proposal";
    const last = state.phases[state.phases.length - 1].phase;
    const index = PHASE_ORDER.indexOf(last);
    return index < PHASE_ORDER.length - 1 ? PHASE_ORDER[index + 1] : null;
  };

  const handlePrimaryAction = useCallback(async () => {
      const text = input.trim();
      if (!text) return;
      setInput("");

      if (!state.sessionId && canStart) {
        addMessage("user", text);
        dispatch({ type: "SET_BRIEF", brief: text });
        await startSession(text);
        await new Promise((resolve) => setTimeout(resolve, 100));
        await runAllPhases();
        return;
      }

      addMessage("user", text);

      if (text.startsWith("/")) {
        const [rawCommand, ...rest] = text.split(/\s+/);
        const command = rawCommand.toLowerCase();
        const arg = rest.join(" ");

        switch (command) {
          case "/history":
            setShowHistory((value) => !value);
            return;
          case "/select": {
            if (!arg) {
              graph.dispatch({ type: "SELECT_NODE", nodeId: null });
              addMessage("system", "Selection cleared.");
            } else {
              const node = graph.state.graph?.nodes.find(
                (item) => item.id === arg || item.id.includes(arg)
              );
              if (node) {
                graph.dispatch({ type: "SELECT_NODE", nodeId: node.id });
                addMessage("system", `Selected: ${node.id} (${node.kind}/${node.spatial_role})`);
              } else {
                addMessage("system", `Node "${arg}" not found.`);
              }
            }
            return;
          }
          case "/evaluate": {
            addMessage("system", "Running evaluation...");
            try {
              const response = await fetch("/api/graph/evaluate");
              if (response.ok) {
                const data = await response.json();
                addMessage(
                  "system",
                  `Overall: ${Math.round(data.overall * 100)}%\n` +
                    `  Relation: ${Math.round(data.relation_clarity * 100)}%\n` +
                    `  Geometry: ${Math.round(data.geometry_readiness * 100)}%\n` +
                    `  Narrative: ${Math.round(data.narrative_completeness * 100)}%\n` +
                    `  Model: ${Math.round(data.model_readiness * 100)}%\n` +
                    `  Image: ${Math.round(data.image_prompt_readiness * 100)}%`
                );
              } else {
                addMessage("system", "Evaluation failed.");
              }
            } catch {
              addMessage("system", "Evaluation failed.");
            }
            return;
          }
          case "/next": {
            const next = getNextPhase();
            if (next && !isStreaming) {
              await runPhase(next);
            } else {
              addMessage("system", isStreaming ? "Phase already running." : "All phases complete.");
            }
            return;
          }
          case "/save": {
            if (!graph.state.graph) return;
            try {
              const response = await fetch("/api/graph/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(graph.state.graph),
              });
              addMessage("system", response.ok ? "Graph saved." : "Save failed.");
            } catch {
              addMessage("system", "Save failed.");
            }
            return;
          }
          case "/stats": {
            if (!graph.state.graph) {
              addMessage("system", "No graph loaded.");
              return;
            }
            const currentGraph = graph.state.graph;
            addMessage(
              "system",
              `Masses: ${currentGraph.nodes.length} | Relations: ${currentGraph.relations.length}\n` +
                `Concept: ${currentGraph.narrative.overall_architectural_concept}`
            );
            return;
          }
          case "/reset":
            dispatch({ type: "RESET" });
            addMessage("system", "Forum reset. Select architects to start again.");
            return;
          default:
            addMessage("system", "Unknown command. Try /history, /select, /next, /evaluate, /save, /stats, /reset");
            return;
        }
      }

      if (state.sessionId) {
        try {
          await fetch(`/api/forum/${state.sessionId}/inject`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ feedback: text }),
          });
          addMessage("system", "Feedback injected into forum.");
        } catch {
          addMessage("system", "Failed to inject feedback.");
        }
      }
    },
    [input, state.sessionId, canStart, dispatch, addMessage, startSession, runAllPhases, runPhase, graph, isStreaming]
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      await handlePrimaryAction();
    },
    [handlePrimaryAction]
  );

  const handleDownloadGraph = useCallback(() => {
    const currentGraph = graph.state.graph;
    if (!currentGraph) return;

    const createdAt = currentGraph.metadata.created_at
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .replace("Z", "");
    triggerJsonDownload(
      withDisplayColorsInGraph(currentGraph),
      `spatial_mass_graph_${createdAt}.json`
    );
  }, [graph.state.graph]);

  const handleDownloadForumResult = useCallback(async () => {
    if (!state.sessionId) return;

    try {
      const response = await fetch(`/api/forum/${state.sessionId}/result`);
      const data = await response.json();
      if (!response.ok || !data?.session) {
        addMessage("system", data?.error ? `Forum result download failed: ${data.error}` : "Forum result download failed.");
        return;
      }

      const createdAt = graph.state.graph?.metadata.created_at
        ?.replace(/[:.]/g, "-")
        .replace("T", "_")
        .replace("Z", "") ?? Date.now().toString();
      triggerJsonDownload(
        withDisplayColorsInForumResult(data.session),
        `forum_result_${createdAt}.json`
      );
    } catch {
      addMessage("system", "Forum result download failed.");
    }
  }, [state.sessionId, graph.state.graph, addMessage]);

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h2 style={{ fontSize: 14, color: "#fff", margin: 0 }}>Architect Forum</h2>
        <button onClick={() => setShowHistory((value) => !value)} style={historyBtnStyle}>
          {showHistory ? "×" : "☰"}
        </button>
      </div>

      <ArchitectSelector
        architects={state.architects}
        selected={state.selectedArchitects}
        collapsed={!showArchitectSelector}
        sessionLocked={!!state.sessionId}
        onToggle={(id) => dispatch({ type: "TOGGLE_ARCHITECT", id })}
        onToggleCollapsed={() => setShowArchitectSelector((value) => !value)}
      />

      {showHistory && (
        <div style={historyPanelStyle}>
          <div style={sectionTitleStyle}>Past Sessions</div>
          {loadingSessions ? (
            <div style={mutedStyle}>Loading...</div>
          ) : sessions.length === 0 ? (
            <div style={mutedStyle}>No saved sessions yet.</div>
          ) : (
            sessions.map((session) => (
              <button key={session.id} onClick={() => loadSessionGraph(session.id)} style={historyItemStyle}>
                <div style={{ color: "#d6dce8", fontSize: 11 }}>{session.company}</div>
                <div style={{ color: "#7b8aa3", fontSize: 10 }}>
                  {session.location} · {session.nodeCount} masses · {session.relationCount} relations
                </div>
              </button>
            ))
          )}
        </div>
      )}

      <div ref={scrollRef} style={messagesStyle}>
        {state.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {state.status === "streaming" && state.streamingArchitectId && (
          <div style={streamingStyle}>
            <div style={streamingTitleStyle}>{state.streamingArchitectId}</div>
            <div style={streamingBodyStyle}>
              {state.currentPhase
                ? `${PHASE_LABELS[state.currentPhase]} 단계에서 매스 그래프와 서술 메타데이터를 정리하는 중입니다.`
                : "건축가 응답을 정리하는 중입니다."}
            </div>
            <div style={streamingMetaStyle}>
              Structured output hidden during streaming
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} style={inputBarStyle}>
        <div style={composerHintStyle}>
          {state.sessionId
            ? "피드백을 보내거나 /command를 실행할 수 있습니다."
            : "브리프를 입력하고 포럼을 실행하세요. 최소 2명의 건축가가 필요합니다."}
        </div>
        {hasFinalGraph && (
          <div style={downloadRowStyle}>
            <button type="button" onClick={handleDownloadGraph} style={downloadButtonStyle}>
              Download SpatialMassGraph
            </button>
            <button
              type="button"
              onClick={handleDownloadForumResult}
              style={downloadButtonStyle}
              disabled={!state.sessionId}
            >
              Download forum_result
            </button>
          </div>
        )}
        <div style={composerRowStyle}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              canStart
                ? "프로젝트 브리프를 입력하면 토론이 시작됩니다."
                : state.sessionId
                  ? "피드백 또는 /command 입력"
                  : "건축가를 2명 이상 선택하세요."
            }
            style={inputStyle}
          />
          <button
            type="submit"
            style={{
              ...composerButtonStyle,
              opacity: composerDisabled ? 0.45 : 1,
              cursor: composerDisabled ? "not-allowed" : "pointer",
            }}
            disabled={composerDisabled}
          >
            {isStreaming ? "Running..." : composerLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

function ArchitectSelector({
  architects,
  selected,
  collapsed,
  sessionLocked,
  onToggle,
  onToggleCollapsed,
}: {
  architects: ArchitectSummary[];
  selected: string[];
  collapsed: boolean;
  sessionLocked: boolean;
  onToggle: (id: string) => void;
  onToggleCollapsed: () => void;
}) {
  const selectedArchitects = architects.filter((architect) => selected.includes(architect.id));

  return (
    <div style={selectorStyle}>
      <div style={selectorHeaderStyle}>
        <div>
          <div style={sectionTitleStyle}>Panel</div>
          <div style={selectorCountStyle}>{selected.length}/5 selected</div>
        </div>
        <button type="button" onClick={onToggleCollapsed} style={collapseButtonStyle}>
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>

      {selectedArchitects.length > 0 && (
        <div style={selectedTagsStyle}>
          {selectedArchitects.map((architect) => (
            <div key={architect.id} style={selectedTagStyle}>
              {architect.reference}
            </div>
          ))}
        </div>
      )}

      {!collapsed && (
        <div style={architectListWrapStyle}>
          <div style={architectListStyle}>
            {architects.map((architect) => {
              const active = selected.includes(architect.id);
              return (
                <button
                  key={architect.id}
                  type="button"
                  disabled={sessionLocked}
                  onClick={() => onToggle(architect.id)}
                  style={{
                    ...architectButtonStyle,
                    borderColor: active ? "#5b8cff" : "#252a33",
                    background: active ? "rgba(91,140,255,0.08)" : "#111520",
                    opacity: sessionLocked ? 0.65 : 1,
                    cursor: sessionLocked ? "default" : "pointer",
                  }}
                >
                  <div style={{ color: "#d6dce8", fontSize: 11 }}>{architect.reference}</div>
                  <div style={{ color: "#7b8aa3", fontSize: 9 }}>{architect.id}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {sessionLocked && (
        <div style={lockedNoteStyle}>
          Session running. Reset the forum to change the panel.
        </div>
      )}
      {selectedArchitects.length === 0 && (
        <div style={selectorEmptyStateStyle}>Select 2-5 architects to begin.</div>
      )}
      {selectedArchitects.length > 0 && selectedArchitects.length < 2 && (
        <div style={selectorEmptyStateStyle}>Select at least one more architect.</div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ForumMessage }) {
  const color =
    message.type === "user"
      ? "#dce7ff"
      : message.type === "architect"
        ? "#d9e7c2"
        : message.type === "graph"
          ? "#ffd7a0"
          : "#8d98a7";
  const phaseLabel = message.phase ? PHASE_LABELS[message.phase] : null;
  const messageLabel =
    message.type === "architect"
      ? `${message.architectId ?? "architect"}${phaseLabel ? ` · ${phaseLabel}` : ""}`
      : message.type === "graph"
        ? `graph synthesis${phaseLabel ? ` · ${phaseLabel}` : ""}`
        : message.type === "phase"
          ? phaseLabel ?? "phase"
          : message.type;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: "#596273", fontSize: 9, marginBottom: 4 }}>{messageLabel}</div>
      <div style={{ color, fontSize: 11, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
        {message.content}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "#0d0d15",
  minHeight: 0,
};

const headerStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid #1a1a2e",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const historyBtnStyle: React.CSSProperties = {
  border: "1px solid #252a33",
  background: "#111520",
  color: "#d6dce8",
  width: 28,
  height: 28,
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "inherit",
};

const selectorStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid #1a1a2e",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  flexShrink: 0,
};

const architectListStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 6,
};

const architectButtonStyle: React.CSSProperties = {
  textAlign: "left",
  border: "1px solid #252a33",
  borderRadius: 8,
  padding: "8px 9px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const architectListWrapStyle: React.CSSProperties = {
  maxHeight: 156,
  overflowY: "auto",
  paddingRight: 2,
};

const sectionTitleStyle: React.CSSProperties = {
  color: "#667085",
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: 1,
};

const historyPanelStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid #1a1a2e",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  maxHeight: 180,
  overflowY: "auto",
  flexShrink: 0,
};

const historyItemStyle: React.CSSProperties = {
  border: "1px solid #252a33",
  borderRadius: 8,
  padding: "8px 10px",
  background: "#111520",
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
};

const mutedStyle: React.CSSProperties = {
  color: "#596273",
  fontSize: 10,
};

const messagesStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "16px",
  minHeight: 0,
};

const streamingStyle: React.CSSProperties = {
  border: "1px dashed #252a33",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#111520",
};

const streamingTitleStyle: React.CSSProperties = {
  color: "#5b8cff",
  fontSize: 10,
  marginBottom: 4,
};

const streamingBodyStyle: React.CSSProperties = {
  color: "#d6dce8",
  fontSize: 11,
  lineHeight: 1.6,
};

const streamingMetaStyle: React.CSSProperties = {
  color: "#596273",
  fontSize: 9,
  marginTop: 6,
};

const inputBarStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderTop: "1px solid #1a1a2e",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  flexShrink: 0,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: "1px solid #252a33",
  borderRadius: 8,
  background: "#111520",
  color: "#dce7ff",
  padding: "10px 12px",
  fontFamily: "inherit",
  fontSize: 11,
};

const selectorHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const selectorCountStyle: React.CSSProperties = {
  color: "#d6dce8",
  fontSize: 12,
  marginTop: 2,
};

const collapseButtonStyle: React.CSSProperties = {
  border: "1px solid #252a33",
  borderRadius: 6,
  background: "#111520",
  color: "#d6dce8",
  fontFamily: "inherit",
  fontSize: 10,
  padding: "5px 10px",
  cursor: "pointer",
};

const selectedTagsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const selectedTagStyle: React.CSSProperties = {
  border: "1px solid rgba(91,140,255,0.24)",
  background: "rgba(91,140,255,0.08)",
  color: "#dce7ff",
  borderRadius: 999,
  padding: "4px 8px",
  fontSize: 10,
};

const selectorEmptyStateStyle: React.CSSProperties = {
  color: "#596273",
  fontSize: 10,
};

const lockedNoteStyle: React.CSSProperties = {
  color: "#7b8aa3",
  fontSize: 10,
};

const composerHintStyle: React.CSSProperties = {
  color: "#7b8aa3",
  fontSize: 10,
  lineHeight: 1.5,
};

const composerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  gap: 8,
};

const composerButtonStyle: React.CSSProperties = {
  minWidth: 92,
  border: "1px solid #2c4f88",
  borderRadius: 8,
  background: "#16325c",
  color: "#e8f0ff",
  padding: "0 14px",
  fontFamily: "inherit",
  fontSize: 11,
  cursor: "pointer",
};

const downloadButtonStyle: React.CSSProperties = {
  flex: 1,
  border: "1px solid #28563a",
  borderRadius: 8,
  background: "#10281a",
  color: "#dff5e7",
  padding: "10px 12px",
  fontFamily: "inherit",
  fontSize: 11,
  cursor: "pointer",
  textAlign: "center",
};

const downloadRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
};
