"use client";

import React, { useEffect } from "react";
import { useForum, type ArchitectSummary } from "@/lib/forum-context";
import type { ArchitectResponse, DiscussionPhase } from "@gim/core";

const PHASE_LABELS: Record<DiscussionPhase, string> = {
  proposal: "1. 발제 (Proposal)",
  cross_critique: "2. 교차 비평 (Cross Critique)",
  convergence: "3. 수렴 (Convergence)",
  finalization: "4. 확정 (Finalization)",
};

const PHASE_ORDER: DiscussionPhase[] = ["proposal", "cross_critique", "convergence"];

export function ForumPanel() {
  const { state, dispatch, startSession, runPhase } = useForum();

  // Load architects on mount
  useEffect(() => {
    fetch("/api/architects")
      .then((r) => r.json())
      .then((data) => dispatch({ type: "SET_ARCHITECTS", architects: data }))
      .catch(() => {});
  }, [dispatch]);

  const canStart = state.selectedArchitects.length >= 2 && !state.sessionId;
  const canRunPhase = state.sessionId && state.status !== "streaming";

  const getNextPhase = (): DiscussionPhase | null => {
    if (state.phases.length === 0) return "proposal";
    const lastPhase = state.phases[state.phases.length - 1].phase;
    const idx = PHASE_ORDER.indexOf(lastPhase);
    return idx < PHASE_ORDER.length - 1 ? PHASE_ORDER[idx + 1] : null;
  };

  const nextPhase = getNextPhase();

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <h2 style={{ fontSize: 14, color: "#fff", margin: 0 }}>
          Architect Forum
        </h2>
        {state.sessionId && (
          <span style={{ color: "#666", fontSize: 10 }}>
            {state.sessionId.slice(-8)}
          </span>
        )}
      </div>

      {/* Architect Selection */}
      {!state.sessionId && (
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
          {canStart && (
            <button style={actionBtnStyle} onClick={startSession}>
              Create Session ({state.selectedArchitects.length} architects)
            </button>
          )}
        </div>
      )}

      {/* Phase Controls */}
      {state.sessionId && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Phase Control</div>
          {state.status === "streaming" ? (
            <div style={{ color: "#a6f", fontSize: 11, padding: "4px 0" }}>
              Streaming: {PHASE_LABELS[state.currentPhase!] || state.currentPhase}
            </div>
          ) : nextPhase ? (
            <button
              style={actionBtnStyle}
              onClick={() => runPhase(nextPhase)}
              disabled={!canRunPhase}
            >
              {PHASE_LABELS[nextPhase]}
            </button>
          ) : (
            <div style={{ color: "#8f8", fontSize: 11 }}>
              All phases complete
            </div>
          )}
        </div>
      )}

      {/* Streaming indicator */}
      {state.streamingArchitectId && (
        <div style={streamingStyle}>
          <div style={{ color: "#a6f", fontSize: 10, marginBottom: 4 }}>
            {state.streamingArchitectId} is speaking...
          </div>
          <div style={tokenStreamStyle}>
            {state.streamingTokens.slice(-500)}
            <span style={cursorStyle}>|</span>
          </div>
        </div>
      )}

      {/* Discussion Timeline */}
      <div style={timelineStyle}>
        {state.phases.map((phase) => (
          <div key={phase.phase} style={{ marginBottom: 16 }}>
            <div style={phaseBadgeStyle}>
              {PHASE_LABELS[phase.phase] || phase.phase}
            </div>
            {phase.responses.map(({ architectId, response }) => (
              <ResponseCard
                key={architectId + phase.phase}
                architectId={architectId}
                response={response}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Error */}
      {state.error && (
        <div style={{ padding: "8px 16px", color: "#e45444", fontSize: 11 }}>
          {state.error}
        </div>
      )}
    </div>
  );
}

function ArchitectCard({
  architect,
  selected,
  onToggle,
}: {
  architect: ArchitectSummary;
  selected: boolean;
  onToggle: () => void;
}) {
  const cat =
    architect.category === "supertall_specialist" ? "Supertall" : "Visionary";

  return (
    <div
      onClick={onToggle}
      style={{
        ...cardStyle,
        borderColor: selected ? "#a6f" : "#1a1a2e",
        background: selected ? "rgba(170,102,255,0.08)" : "#111118",
      }}
    >
      <div style={{ fontSize: 11, color: "#fff", fontWeight: 500 }}>
        {architect.id.replace(/_/g, " ")}
      </div>
      <div style={{ fontSize: 9, color: "#666" }}>{architect.reference}</div>
      <div style={{ fontSize: 8, color: "#555", marginTop: 2 }}>
        {cat} | A:{architect.assertiveness} C:{architect.compromise_willingness}
      </div>
    </div>
  );
}

function ResponseCard({
  architectId,
  response,
}: {
  architectId: string;
  response: ArchitectResponse;
}) {
  return (
    <div style={responseCardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: "#aaf", fontSize: 11, fontWeight: 500 }}>
          {architectId.replace(/_/g, " ")}
        </span>
        <span style={{ color: "#555", fontSize: 9 }}>{response.phase}</span>
      </div>

      <div style={{ color: "#ccc", fontSize: 11, marginBottom: 4 }}>
        {response.stance}
      </div>

      <div style={{ color: "#888", fontSize: 10, marginBottom: 6 }}>
        {response.reasoning.slice(0, 200)}
        {response.reasoning.length > 200 ? "..." : ""}
      </div>

      {/* Vertical Zoning Table */}
      <div style={{ fontSize: 9, color: "#666" }}>
        {response.proposal.vertical_zoning.slice(0, 4).map((z, i) => (
          <div key={i} style={{ display: "flex", gap: 8, padding: "1px 0" }}>
            <span style={{ color: "#888", minWidth: 60 }}>{z.zone}</span>
            <span>
              {z.floors[0]}~{z.floors[1]}F
            </span>
            <span style={{ color: "#555" }}>{z.primary_function}</span>
          </div>
        ))}
        {response.proposal.vertical_zoning.length > 4 && (
          <span style={{ color: "#444" }}>
            +{response.proposal.vertical_zoning.length - 4} more zones
          </span>
        )}
      </div>

      {/* Critique */}
      {response.critique && response.critique.length > 0 && (
        <div style={{ marginTop: 6, borderTop: "1px solid #1a1a2e", paddingTop: 4 }}>
          <div style={{ color: "#f88", fontSize: 9 }}>Critique:</div>
          {response.critique.slice(0, 2).map((c, i) => (
            <div key={i} style={{ color: "#888", fontSize: 9, paddingLeft: 6 }}>
              → {c.target_architect_id}: {c.point.slice(0, 100)}
            </div>
          ))}
        </div>
      )}

      {/* Compromise */}
      {response.compromise && (
        <div style={{ marginTop: 4, color: "#8f8", fontSize: 9 }}>
          Compromise: {response.compromise.slice(0, 150)}
        </div>
      )}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid #1a1a2e",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const sectionStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderBottom: "1px solid #1a1a2e",
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
  gap: 4,
  marginBottom: 8,
};

const cardStyle: React.CSSProperties = {
  padding: "6px 8px",
  border: "1px solid #1a1a2e",
  borderRadius: 4,
  cursor: "pointer",
  transition: "all 0.15s",
};

const actionBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px",
  background: "#2a2a4e",
  border: "1px solid #55a",
  borderRadius: 4,
  color: "#aaf",
  fontSize: 11,
  cursor: "pointer",
  fontFamily: "inherit",
};

const streamingStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderBottom: "1px solid #1a1a2e",
  maxHeight: 120,
  overflow: "hidden",
};

const tokenStreamStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#888",
  lineHeight: 1.5,
  maxHeight: 80,
  overflow: "hidden",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
};

const cursorStyle: React.CSSProperties = {
  color: "#a6f",
  animation: "blink 1s infinite",
};

const timelineStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 16px",
};

const phaseBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#a6f",
  padding: "4px 0",
  borderBottom: "1px solid #1a1a2e",
  marginBottom: 8,
  fontWeight: 500,
};

const responseCardStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "#111118",
  border: "1px solid #1a1a2e",
  borderRadius: 4,
  marginBottom: 6,
};
