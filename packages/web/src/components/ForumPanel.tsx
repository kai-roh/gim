"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useForum, type ArchitectSummary, type ForumMessage } from "@/lib/forum-context";
import { useGraph } from "@/lib/graph-context";
import { BUTTON_RADIUS } from "@/lib/ui";
import type { DiscussionPhase, ProjectContext } from "@gim/core";

const PHASE_ORDER: DiscussionPhase[] = ["proposal", "cross_critique", "convergence"];
const PHASE_LABELS: Record<DiscussionPhase, string> = {
  proposal: "발제",
  cross_critique: "교차 비평",
  convergence: "수렴",
  expert_review: "전문가 검토",
  finalization: "최종 정리",
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

interface ProgramTargetDraft {
  name: string;
  area: string;
}

function createEmptyProgramTargets(): ProgramTargetDraft[] {
  return Array.from({ length: 4 }, () => ({ name: "", area: "" }));
}

const AUTO_SCROLL_THRESHOLD_PX = 36;

function isNearBottom(element: HTMLDivElement) {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    AUTO_SCROLL_THRESHOLD_PX
  );
}

export function ForumPanel() {
  const { state, dispatch, startSession, runPhase, runAllPhases, addMessage } = useForum();
  const graph = useGraph();
  const [input, setInput] = useState("");
  const [siteAreaInput, setSiteAreaInput] = useState("");
  const [farInput, setFarInput] = useState("");
  const [bcrInput, setBcrInput] = useState("");
  const [programTargets, setProgramTargets] = useState<ProgramTargetDraft[]>(
    createEmptyProgramTargets
  );
  const [showHistory, setShowHistory] = useState(false);
  const [showArchitectSelector, setShowArchitectSelector] = useState(true);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    fetch("/api/architects")
      .then((response) => response.json())
      .then((data) => dispatch({ type: "SET_ARCHITECTS", architects: data }))
      .catch(() => {});
  }, [dispatch]);

  useEffect(() => {
    if (scrollRef.current && shouldAutoScrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.messages, state.streamingTokens]);

  const handleMessagesScroll = useCallback(() => {
    if (!scrollRef.current) return;
    shouldAutoScrollRef.current = isNearBottom(scrollRef.current);
  }, []);

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
  const composerLabel = state.sessionId ? "Send" : "Run Forum";
  const parsePositive = (value: string) => {
    const parsed = Number(value.replace(/[^\d.]/g, "").trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const siteArea = parsePositive(siteAreaInput);
  const far = parsePositive(farInput);
  const bcr = parsePositive(bcrInput);
  const requiredInputsReady = siteArea !== null && far !== null && bcr !== null;
  const composerDisabled = state.sessionId
    ? isStreaming || input.trim().length === 0
    : isStreaming;
  const streamingArchitectName =
    state.architects.find((architect) => architect.id === state.streamingArchitectId)?.reference ??
    state.streamingArchitectId;

  const buildStartContext = useCallback((): ProjectContext | null => {
    if (!siteArea || !far || !bcr) return null;

    const totalGfa = (siteArea * far) / 100;
    const uses = programTargets
      .map((entry) => {
        const name = entry.name.trim();
        const area = parsePositive(entry.area);
        if (!name || !area) return null;
        return {
          type: name,
          ratio: totalGfa > 0 ? Math.min(area / totalGfa, 1) : null,
          target_area_m2: area,
          required: true,
          requirements: "사용자 입력 목표 면적",
        };
      })
      .filter(
        (
          value
        ): value is {
          type: string;
          ratio: number | null;
          target_area_m2: number;
          required: true;
          requirements: string;
        } => !!value
      );

    return {
      site: {
        location: "",
        dimensions: [0, 0],
        site_area_m2: siteArea,
        far,
        bcr,
        height_limit: 0,
        context: {
          north: "",
          south: "",
          east: "",
          west: "",
        },
      },
      program: {
        total_gfa: totalGfa,
        uses,
      },
      constraints: [],
      client_vision: input.trim() || undefined,
    };
  }, [bcr, far, input, programTargets, siteArea]);

  const getNextPhase = (): DiscussionPhase | null => {
    if (state.phases.length === 0) return "proposal";
    const last = state.phases[state.phases.length - 1].phase;
    const index = PHASE_ORDER.indexOf(last);
    return index < PHASE_ORDER.length - 1 ? PHASE_ORDER[index + 1] : null;
  };

  const handlePrimaryAction = useCallback(async () => {
      const text = input.trim();
      if (state.sessionId && !text) return;
      if (state.sessionId || text) {
        setInput("");
      }

      if (!state.sessionId) {
        if (state.selectedArchitects.length < 2) {
          addMessage("system", "건축가를 2명 이상 선택하세요.");
          return;
        }
        const context = buildStartContext();
        if (!context) {
          addMessage("system", "대지면적, 용적률, 건폐율을 먼저 입력하세요.");
          return;
        }
        if (text) {
          addMessage("user", text);
          dispatch({ type: "SET_BRIEF", brief: text });
        }
        const sessionId = await startSession({
          brief: text || undefined,
          context,
        });
        if (!sessionId) return;
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
    [
      input,
      state.sessionId,
      canStart,
      dispatch,
      addMessage,
      startSession,
      runAllPhases,
      runPhase,
      graph,
      isStreaming,
      buildStartContext,
    ]
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      await handlePrimaryAction();
    },
    [handlePrimaryAction]
  );

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

      <div ref={scrollRef} style={messagesStyle} onScroll={handleMessagesScroll}>
        {!state.sessionId && (
          <div style={scenarioCardStyle}>
            <div style={scenarioTitleStyle}>Design Basics</div>
            <div style={scenarioSubtleStyle}>
              대지면적, 용적률, 건폐율은 필수입니다. 프로그램과 적정면적은 필요한 항목만 채우면 됩니다.
            </div>
            <div style={scenarioTableWrapStyle}>
              <div style={scenarioSectionHeaderStyle}>Site Envelope</div>
              <table style={scenarioTableStyle}>
                <thead>
                  <tr>
                    <th style={scenarioHeaderCellStyle}>Site Area (m²) *</th>
                    <th style={scenarioHeaderCellStyle}>FAR (%) *</th>
                    <th style={scenarioHeaderCellStyle}>BCR (%) *</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={scenarioCellStyle}>
                      <input
                        value={siteAreaInput}
                        onChange={(event) => setSiteAreaInput(event.target.value)}
                        placeholder="예: 4200"
                        style={scenarioInputStyle}
                      />
                    </td>
                    <td style={scenarioCellStyle}>
                      <input
                        value={farInput}
                        onChange={(event) => setFarInput(event.target.value)}
                        placeholder="예: 300"
                        style={scenarioInputStyle}
                      />
                    </td>
                    <td style={scenarioCellStyle}>
                      <input
                        value={bcrInput}
                        onChange={(event) => setBcrInput(event.target.value)}
                        placeholder="예: 50"
                        style={scenarioInputStyle}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={scenarioTableWrapStyle}>
              <div style={scenarioSectionHeaderStyle}>Required Programs</div>
              <table style={scenarioTableStyle}>
                <thead>
                  <tr>
                    <th style={scenarioHeaderCellStyle}>Program</th>
                    <th style={scenarioHeaderCellStyle}>Area</th>
                    <th style={scenarioHeaderCellStyle}>Program</th>
                    <th style={scenarioHeaderCellStyle}>Area</th>
                  </tr>
                </thead>
                <tbody>
                  {[0, 2].map((startIndex) => (
                    <tr key={`program-target-row-${startIndex}`}>
                      {[startIndex, startIndex + 1].map((index) => {
                        const target = programTargets[index];
                        return (
                          <React.Fragment key={`program-target-${index}`}>
                            <td style={scenarioCellStyle}>
                              <input
                                value={target.name}
                                onChange={(event) =>
                                  setProgramTargets((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? { ...item, name: event.target.value }
                                        : item
                                    )
                                  )
                                }
                                placeholder={`Program ${index + 1}`}
                                style={scenarioInputStyle}
                              />
                            </td>
                            <td style={scenarioCellStyle}>
                              <input
                                value={target.area}
                                onChange={(event) =>
                                  setProgramTargets((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? { ...item, area: event.target.value }
                                        : item
                                    )
                                  )
                                }
                                placeholder="m²"
                                style={scenarioInputStyle}
                              />
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {state.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {state.status === "streaming" && state.streamingArchitectId && (
          <div style={streamingStyle}>
            <div style={streamingTitleStyle}>{streamingArchitectName}</div>
            <div style={streamingBodyStyle}>
              {state.currentPhase
                ? `${PHASE_LABELS[state.currentPhase]} 단계에서 자신의 판단과 대안을 정리하고 있습니다.`
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
            : "기본 규모 정보를 입력하고, 아래 채팅란에는 설계 컨텍스트나 참고할 사항을 적을 수 있습니다."}
        </div>
        <div style={composerRowStyle}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              canStart
                ? "설계 컨텍스트나 참고할 사항을 입력하세요. 비워두어도 실행할 수 있습니다."
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
        <div
          style={{
            ...architectListWrapStyle,
            maxHeight: sessionLocked ? 236 : 316,
          }}
        >
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
  const { state } = useForum();
  const phaseLabel = message.phase ? PHASE_LABELS[message.phase] : null;
  const architectName =
    message.type === "architect"
      ? state.architects.find((architect) => architect.id === message.architectId)?.reference ??
        message.architectId ??
        "architect"
      : null;
  const messageLabel =
    message.type === "architect"
      ? `${architectName}${phaseLabel ? ` · ${phaseLabel}` : ""}`
      : message.type === "graph"
        ? `graph synthesis${phaseLabel ? ` · ${phaseLabel}` : ""}`
        : message.type === "phase"
          ? phaseLabel ?? "phase"
          : message.type;
  const accent =
    message.type === "user"
      ? "#7aa6ff"
      : message.type === "architect"
        ? "#a5d46f"
        : message.type === "graph"
          ? "#ffbd6d"
          : message.type === "phase"
            ? "#cda9ff"
            : "#7b8aa3";
  const bubbleStyle =
    message.type === "user"
      ? userBubbleStyle
      : message.type === "architect"
        ? architectBubbleStyle
        : message.type === "graph"
          ? graphBubbleStyle
          : message.type === "phase"
            ? phaseBubbleStyle
            : systemBubbleStyle;
  const wrapperStyle =
    message.type === "user"
      ? userBubbleWrapStyle
      : message.type === "architect"
        ? architectBubbleWrapStyle
        : neutralBubbleWrapStyle;

  return (
    <div style={wrapperStyle}>
      <div style={{ ...bubbleStyle, borderColor: `${accent}44` }}>
        <div style={{ ...messageMetaStyle, color: accent }}>{messageLabel}</div>
        <div style={messageBodyStyle}>
        {message.content}
        </div>
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
  borderRadius: BUTTON_RADIUS,
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
  borderRadius: BUTTON_RADIUS,
  padding: "8px 9px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const architectListWrapStyle: React.CSSProperties = {
  overflowY: "auto",
  marginRight: -16,
  paddingRight: 16,
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
  borderRadius: BUTTON_RADIUS,
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

const scenarioCardStyle: React.CSSProperties = {
  border: "1px solid #1f2b3d",
  borderRadius: 10,
  background: "linear-gradient(180deg, rgba(16,21,31,0.96), rgba(12,15,23,0.96))",
  padding: "10px 10px 8px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const scenarioTitleStyle: React.CSSProperties = {
  color: "#dce7ff",
  fontSize: 12,
};

const scenarioSubtleStyle: React.CSSProperties = {
  color: "#7b8aa3",
  fontSize: 9,
  lineHeight: 1.35,
};

const scenarioTableWrapStyle: React.CSSProperties = {
  border: "1px solid #253041",
  borderRadius: 8,
  overflow: "hidden",
  background: "#0d1119",
};

const scenarioTableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
};

const scenarioHeaderCellStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  color: "#8ca0bd",
  fontSize: 8,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  fontWeight: 500,
  borderTop: "1px solid #1d2736",
  borderBottom: "1px solid #1d2736",
  background: "#111723",
};

const scenarioCellStyle: React.CSSProperties = {
  padding: 4,
  borderTop: "1px solid #1a2230",
  verticalAlign: "middle",
};

const scenarioInputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: "1px solid #273246",
  borderRadius: 6,
  background: "#0f1520",
  color: "#dce7ff",
  padding: "6px 8px",
  fontFamily: "inherit",
  fontSize: 10,
};

const scenarioSectionHeaderStyle: React.CSSProperties = {
  color: "#8ca0bd",
  fontSize: 8,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  padding: "6px 8px",
  background: "#101622",
  borderBottom: "1px solid #1d2736",
};

const messagesStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "16px",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const streamingStyle: React.CSSProperties = {
  border: "1px dashed #252a33",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#111520",
  alignSelf: "flex-start",
  maxWidth: "92%",
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
  borderRadius: BUTTON_RADIUS,
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
  borderRadius: BUTTON_RADIUS,
  background: "#16325c",
  color: "#e8f0ff",
  padding: "0 14px",
  fontFamily: "inherit",
  fontSize: 11,
  cursor: "pointer",
};

const neutralBubbleWrapStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
};

const architectBubbleWrapStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
};

const userBubbleWrapStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
};

const baseBubbleStyle: React.CSSProperties = {
  maxWidth: "92%",
  border: "1px solid #252a33",
  borderRadius: 12,
  padding: "10px 12px",
  boxShadow: "0 10px 24px rgba(0,0,0,0.16)",
};

const architectBubbleStyle: React.CSSProperties = {
  ...baseBubbleStyle,
  background: "linear-gradient(180deg, rgba(25,34,23,0.96), rgba(17,21,32,0.96))",
};

const userBubbleStyle: React.CSSProperties = {
  ...baseBubbleStyle,
  background: "linear-gradient(180deg, rgba(18,35,67,0.98), rgba(14,23,38,0.98))",
};

const graphBubbleStyle: React.CSSProperties = {
  ...baseBubbleStyle,
  background: "linear-gradient(180deg, rgba(49,35,17,0.96), rgba(19,19,26,0.96))",
};

const phaseBubbleStyle: React.CSSProperties = {
  ...baseBubbleStyle,
  background: "linear-gradient(180deg, rgba(36,29,52,0.96), rgba(18,18,28,0.96))",
};

const systemBubbleStyle: React.CSSProperties = {
  ...baseBubbleStyle,
  background: "linear-gradient(180deg, rgba(21,24,31,0.96), rgba(15,17,24,0.96))",
};

const messageMetaStyle: React.CSSProperties = {
  fontSize: 9,
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: 0.8,
};

const messageBodyStyle: React.CSSProperties = {
  color: "#e3e8f1",
  fontSize: 11,
  whiteSpace: "pre-wrap",
  lineHeight: 1.65,
};
