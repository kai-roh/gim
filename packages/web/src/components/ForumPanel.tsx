"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useForum, type ArchitectSummary, type ForumMessage } from "@/lib/forum-context";
import { useGraph } from "@/lib/graph-context";
import type { DiscussionPhase } from "@gim/core";

const PHASE_ORDER: DiscussionPhase[] = ["proposal", "cross_critique", "convergence"];

interface SessionSummary {
  id: string;
  timestamp: string;
  location: string;
  company: string;
  panel: string[];
  nodeCount: number;
  edgeCount: number;
  hasGraph: boolean;
}

export function ForumPanel() {
  const { state, dispatch, startSession, runPhase, runAllPhases, addMessage } = useForum();
  const graph = useGraph();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Load architects on mount
  useEffect(() => {
    fetch("/api/architects")
      .then((r) => r.json())
      .then((data) => dispatch({ type: "SET_ARCHITECTS", architects: data }))
      .catch(() => {});
  }, [dispatch]);

  // Auto-scroll on new messages or streaming
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.messages, state.streamingTokens]);

  // Load session history
  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const resp = await fetch("/api/sessions");
      const data = await resp.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch {}
    setLoadingSessions(false);
  }, []);

  // Load sessions when history panel opens
  useEffect(() => {
    if (showHistory) loadSessions();
  }, [showHistory, loadSessions]);

  // Load a past session: graph + discussion
  const loadSessionGraph = useCallback(async (sessionId: string) => {
    try {
      const [graphResp, forumResp] = await Promise.all([
        fetch(`/api/sessions/${sessionId}/graph`),
        fetch(`/api/sessions/${sessionId}/forum`),
      ]);

      if (!graphResp.ok) {
        addMessage("system", "Failed to load session graph.");
        return;
      }

      const [graphData, forumResult] = await Promise.all([
        graphResp.json(),
        forumResp.ok ? forumResp.json() : null,
      ]);

      // Update graph viewer
      graph.dispatch({ type: "LOAD_GRAPH_SUCCESS", graph: graphData });

      // Restore forum discussion + enable rendering
      if (forumResult && !forumResult.error) {
        dispatch({ type: "LOAD_HISTORICAL_SESSION", forumResult });
      } else {
        const s = sessions.find((s) => s.id === sessionId);
        addMessage("system", `Graph loaded: ${s?.company ?? "Unknown"} — ${s?.location ?? ""} (${graphData.nodes?.length ?? 0} nodes)`);
      }

      setShowHistory(false);
    } catch {
      addMessage("system", "Failed to load session.");
    }
  }, [graph, sessions, dispatch, addMessage, setShowHistory]);

  const canStart = state.selectedArchitects.length >= 2 && !state.sessionId;
  const isStreaming = state.status === "streaming";

  const getNextPhase = (): DiscussionPhase | null => {
    if (state.phases.length === 0) return "proposal";
    const lastPhase = state.phases[state.phases.length - 1].phase;
    const idx = PHASE_ORDER.indexOf(lastPhase);
    return idx < PHASE_ORDER.length - 1 ? PHASE_ORDER[idx + 1] : null;
  };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text) return;
      setInput("");

      // Before session: first message is the project brief
      if (!state.sessionId && canStart) {
        addMessage("user", text);
        dispatch({ type: "SET_BRIEF", brief: text });
        (async () => {
          await startSession(text);
          await new Promise((r) => setTimeout(r, 100));
          await runAllPhases();
        })();
        return;
      }

      // During or after session: user feedback / commands
      addMessage("user", text);

      // Handle commands
      if (text.startsWith("/")) {
        const parts = text.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const arg = parts.slice(1).join(" ");

        switch (cmd) {
          case "/history": {
            setShowHistory((v) => !v);
            break;
          }
          case "/select": {
            if (!arg) {
              graph.dispatch({ type: "SELECT_NODE", nodeId: null });
              addMessage("system", "Selection cleared.");
            } else {
              const node = graph.state.graph?.nodes.find(
                (n) => n.id === arg || n.id.includes(arg)
              );
              if (node) {
                graph.dispatch({ type: "SELECT_NODE", nodeId: node.id });
                addMessage("system", `Selected: ${node.id} (${node.function} @ F${node.floor_level})`);
              } else {
                addMessage("system", `Node "${arg}" not found.`);
              }
            }
            break;
          }
          case "/floor": {
            const floor = parseInt(arg);
            if (isNaN(floor)) {
              addMessage("system", "Usage: /floor <number>");
            } else {
              graph.dispatch({ type: "SELECT_FLOOR", floor });
              const count = graph.state.graph?.nodes.filter((n) => n.floor_level === floor).length || 0;
              addMessage("system", `Floor ${floor} selected (${count} nodes)`);
            }
            break;
          }
          case "/evaluate": {
            addMessage("system", "Running evaluation...");
            try {
              const resp = await fetch("/api/graph/evaluate");
              if (resp.ok) {
                const data = await resp.json();
                addMessage("system",
                  `Overall: ${Math.round(data.overall * 100)}%\n` +
                  `  Connectivity: ${Math.round(data.connectivity_accuracy * 100)}%\n` +
                  `  Continuity: ${Math.round(data.vertical_continuity * 100)}%\n` +
                  `  Coverage: ${Math.round(data.zone_coverage * 100)}%`
                );
              }
            } catch { addMessage("system", "Evaluation failed."); }
            break;
          }
          case "/next": {
            const next = getNextPhase();
            if (next && !isStreaming) {
              runPhase(next);
            } else {
              addMessage("system", isStreaming ? "Phase already running." : "All phases complete.");
            }
            break;
          }
          case "/save": {
            if (graph.state.graph) {
              try {
                const resp = await fetch("/api/graph/save", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(graph.state.graph),
                });
                addMessage("system", resp.ok ? "Graph saved." : "Save failed.");
              } catch { addMessage("system", "Save failed."); }
            }
            break;
          }
          case "/reset": {
            dispatch({ type: "RESET" });
            addMessage("system", "Forum reset. Select architects to start again.");
            break;
          }
          case "/stats": {
            if (graph.state.graph) {
              const g = graph.state.graph;
              addMessage("system",
                `Nodes: ${g.nodes.length} | Edges: ${g.edges.length}\n` +
                `Floors: ${g.metadata.floor_range[0]} ~ ${g.metadata.floor_range[1]}\n` +
                `Site: ${g.global.site.location} | GFA: ${g.global.program.total_gfa}m²`
              );
            } else {
              addMessage("system", "No graph loaded.");
            }
            break;
          }
          default:
            addMessage("system", `Unknown command: ${cmd}. Try /history, /select, /floor, /next, /evaluate, /save, /stats, /reset`);
        }
        return;
      }

      // Regular text: inject as forum feedback
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
    [input, state.sessionId, state.selectedArchitects, canStart, isStreaming, dispatch, addMessage, startSession, runAllPhases, runPhase, graph]
  );

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <h2 style={{ fontSize: 14, color: "#fff", margin: 0 }}>
          Architect Forum
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setShowHistory((v) => !v)}
            style={historyBtnStyle}
            title="Session History"
          >
            {showHistory ? "×" : "☰"}
          </button>
          {state.sessionId && (
            <span style={{ color: "#555", fontSize: 9 }}>
              {state.sessionId.slice(-8)}
            </span>
          )}
        </div>
      </div>

      {/* Session History Panel */}
      {showHistory && (
        <div style={historyPanelStyle}>
          <div style={sectionTitleStyle}>Past Sessions</div>
          {loadingSessions ? (
            <div style={{ color: "#555", fontSize: 10, padding: 8 }}>Loading...</div>
          ) : sessions.length === 0 ? (
            <div style={{ color: "#555", fontSize: 10, padding: 8 }}>No saved sessions yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => loadSessionGraph(s.id)}
                  style={sessionCardStyle}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "#ccc", fontWeight: 500 }}>
                      {s.company}
                    </span>
                    <span style={{ fontSize: 8, color: "#555" }}>
                      {s.id.slice(0, 10)}
                    </span>
                  </div>
                  <div style={{ fontSize: 9, color: "#777", marginTop: 2 }}>
                    {s.location} | {s.nodeCount} nodes, {s.edgeCount} edges
                  </div>
                  <div style={{ fontSize: 8, color: "#555", marginTop: 1 }}>
                    {s.panel.map((p) => p.replace(/_/g, " ")).join(", ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Architect Selection (before session) */}
      {!state.sessionId && !state.autoRunning && !showHistory && !state.historicalForumResult && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Select Architects (2-5)</div>
          <div style={architectGridStyle}>
            {state.architects.map((a) => (
              <ArchitectCard
                key={a.id}
                architect={a}
                selected={state.selectedArchitects.includes(a.id)}
                onToggle={() => dispatch({ type: "TOGGLE_ARCHITECT", id: a.id })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Chat messages */}
      <div ref={scrollRef} style={chatAreaStyle}>
        {/* Welcome message */}
        {state.messages.length === 0 && !state.sessionId && (
          <div style={welcomeStyle}>
            {canStart ? (
              <>
                <p>Describe your project to start the forum:</p>
                <p style={{ color: "#555", fontSize: 10, marginTop: 4 }}>
                  e.g. "서울 성수동에 Gentle Monster 본사 사옥을 설계해줘. 8층 규모, 저층은 브랜드 경험 공간, 중층은 오피스"
                </p>
              </>
            ) : (
              <p style={{ color: "#555" }}>Select 2-5 architects above to begin.</p>
            )}
          </div>
        )}

        {/* Message list */}
        {state.messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming indicator */}
        {state.streamingArchitectId && state.streamingTokens && (
          <div style={streamingBubbleStyle}>
            <div style={architectLabelStyle}>
              {state.streamingArchitectId.replace(/_/g, " ")}
              <span style={typingStyle}> typing...</span>
            </div>
            <div style={streamingTextStyle}>
              {state.streamingTokens.slice(-600)}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {state.error && (
        <div style={errorStyle}>{state.error}</div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} style={inputBarStyle}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            !state.sessionId && canStart
              ? "Describe your project brief..."
              : isStreaming
                ? "Architects are discussing..."
                : "/history, /select, /floor, /next, or type feedback"
          }
          style={inputFieldStyle}
          disabled={isStreaming}
          autoFocus
        />
        <button type="submit" style={sendBtnStyle} disabled={isStreaming || !input.trim()}>
          ↵
        </button>
      </form>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function ArchitectCard({
  architect,
  selected,
  onToggle,
}: {
  architect: ArchitectSummary;
  selected: boolean;
  onToggle: () => void;
}) {
  const cat = architect.category === "design_practice_master" ? "Practice" : "Visionary";
  return (
    <div
      onClick={onToggle}
      style={{
        ...cardStyle,
        borderColor: selected ? "#a6f" : "#1a1a2e",
        background: selected ? "rgba(170,102,255,0.08)" : "#111118",
      }}
    >
      <div style={{ fontSize: 10, color: selected ? "#fff" : "#aaa", fontWeight: 500 }}>
        {architect.id.replace(/_/g, " ")}
      </div>
      <div style={{ fontSize: 8, color: "#555", marginTop: 1 }}>
        {cat} | {architect.reference}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ForumMessage }) {
  const isUser = message.type === "user";
  const isArchitect = message.type === "architect";
  const isPhase = message.type === "phase";
  const isGraph = message.type === "graph";

  if (isPhase) {
    return (
      <div style={phaseDividerStyle}>
        <div style={phaseDividerLine} />
        <span style={phaseDividerText}>{message.content}</span>
        <div style={phaseDividerLine} />
      </div>
    );
  }

  if (isGraph) {
    return (
      <div style={graphMsgStyle}>
        <span style={{ color: "#4a8" }}>◆</span> {message.content}
      </div>
    );
  }

  return (
    <div style={{ ...msgRowStyle, justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          ...bubbleStyle,
          ...(isUser ? userBubbleStyle : isArchitect ? architectBubbleStyle : systemBubbleStyle),
        }}
      >
        {isArchitect && message.architectId && (
          <div style={architectLabelStyle}>
            {message.architectId.replace(/_/g, " ")}
          </div>
        )}
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {message.content}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Styles
// ============================================================

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderBottom: "1px solid #1a1a2e",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexShrink: 0,
};

const historyBtnStyle: React.CSSProperties = {
  background: "#1a1a2e",
  border: "1px solid #2a2a4e",
  borderRadius: 4,
  color: "#888",
  fontSize: 12,
  padding: "2px 8px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const historyPanelStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid #1a1a2e",
  background: "#0a0a12",
  maxHeight: 240,
  overflowY: "auto",
  flexShrink: 0,
};

const sessionCardStyle: React.CSSProperties = {
  padding: "6px 8px",
  border: "1px solid #1a1a2e",
  borderRadius: 4,
  cursor: "pointer",
  transition: "all 0.15s",
  background: "#111118",
};

const sectionStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid #1a1a2e",
  flexShrink: 0,
};

const sectionTitleStyle: React.CSSProperties = {
  color: "#666",
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 6,
};

const architectGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 3,
};

const cardStyle: React.CSSProperties = {
  padding: "5px 7px",
  border: "1px solid #1a1a2e",
  borderRadius: 4,
  cursor: "pointer",
  transition: "all 0.15s",
};

const chatAreaStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const welcomeStyle: React.CSSProperties = {
  color: "#888",
  fontSize: 11,
  padding: "20px 8px",
  textAlign: "center",
  lineHeight: 1.6,
};

const msgRowStyle: React.CSSProperties = {
  display: "flex",
};

const bubbleStyle: React.CSSProperties = {
  maxWidth: "90%",
  padding: "6px 10px",
  borderRadius: 8,
  fontSize: 11,
  lineHeight: 1.5,
};

const userBubbleStyle: React.CSSProperties = {
  background: "#1a2a4e",
  color: "#cde",
  borderBottomRightRadius: 2,
};

const architectBubbleStyle: React.CSSProperties = {
  background: "#1a1a28",
  color: "#bbb",
  borderBottomLeftRadius: 2,
  border: "1px solid #252540",
};

const systemBubbleStyle: React.CSSProperties = {
  background: "transparent",
  color: "#666",
  fontSize: 10,
  padding: "2px 4px",
};

const architectLabelStyle: React.CSSProperties = {
  fontSize: 9,
  color: "#a6f",
  fontWeight: 600,
  marginBottom: 3,
  textTransform: "capitalize",
};

const phaseDividerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 0",
};

const phaseDividerLine: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: "#252540",
};

const phaseDividerText: React.CSSProperties = {
  color: "#a6f",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: 0.5,
  whiteSpace: "nowrap",
};

const graphMsgStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#6c8",
  padding: "4px 8px",
  background: "rgba(80,180,120,0.06)",
  borderRadius: 4,
  border: "1px solid rgba(80,180,120,0.15)",
};

const streamingBubbleStyle: React.CSSProperties = {
  background: "#1a1a28",
  border: "1px solid #252540",
  borderRadius: 8,
  padding: "6px 10px",
  maxWidth: "90%",
};

const streamingTextStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#888",
  lineHeight: 1.4,
  maxHeight: 120,
  overflow: "hidden",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const typingStyle: React.CSSProperties = {
  color: "#666",
  fontWeight: 400,
  fontStyle: "italic",
};

const errorStyle: React.CSSProperties = {
  padding: "6px 12px",
  color: "#e45444",
  fontSize: 10,
  flexShrink: 0,
};

const inputBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "8px 12px",
  borderTop: "1px solid #1a1a2e",
  background: "#0d0d15",
  flexShrink: 0,
  gap: 6,
};

const inputFieldStyle: React.CSSProperties = {
  flex: 1,
  background: "#111118",
  border: "1px solid #1a1a2e",
  borderRadius: 6,
  outline: "none",
  color: "#e0e0e0",
  fontSize: 11,
  fontFamily: "inherit",
  padding: "8px 10px",
};

const sendBtnStyle: React.CSSProperties = {
  background: "#2a2a4e",
  border: "1px solid #3a3a5e",
  borderRadius: 6,
  color: "#aaf",
  fontSize: 13,
  padding: "6px 10px",
  cursor: "pointer",
  fontFamily: "inherit",
};
