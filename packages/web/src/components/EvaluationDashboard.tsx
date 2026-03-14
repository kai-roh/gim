"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import * as d3 from "d3";
import type { EvaluationIssue, EvaluationResult } from "@gim/core";
import { useGraph } from "@/lib/graph-context";

const METRIC_LABELS: Record<string, string> = {
  relation_clarity: "Relation",
  geometry_readiness: "Geometry",
  narrative_completeness: "Narrative",
  provenance_traceability: "Trace",
  consensus_strength: "Consensus",
  model_readiness: "Model",
  image_prompt_readiness: "Image",
};

const METRIC_KEYS = Object.keys(METRIC_LABELS);

export function EvaluationDashboard() {
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const radarRef = useRef<SVGSVGElement>(null);
  const { state, dispatch, variantHistory, activeVariantId } = useGraph();
  const { graph, selectedNodeId } = state;
  const activeVariant = variantHistory.find((variant) => variant.id === activeVariantId) ?? null;

  const loadEvaluation = useCallback(async () => {
    if (!graph) {
      setEvaluation(null);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/graph/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(graph),
      });
      if (response.ok) {
        const data = (await response.json()) as EvaluationResult;
        setEvaluation(data);
      }
    } finally {
      setLoading(false);
    }
  }, [graph]);

  useEffect(() => {
    loadEvaluation();
  }, [loadEvaluation]);

  useEffect(() => {
    setSelectedMetric(null);
  }, [graph, selectedNodeId]);

  useEffect(() => {
    if (!radarRef.current || !evaluation) return;

    const svg = d3.select(radarRef.current);
    svg.selectAll("*").remove();

    const size = 200;
    const center = size / 2;
    const radius = 80;
    const angleStep = (2 * Math.PI) / METRIC_KEYS.length;

    const group = svg
      .attr("width", size)
      .attr("height", size)
      .append("g")
      .attr("transform", `translate(${center},${center})`);

    for (const ring of [0.25, 0.5, 0.75, 1]) {
      group
        .append("circle")
        .attr("r", radius * ring)
        .attr("fill", "none")
        .attr("stroke", "#1a1a2e")
        .attr("stroke-width", 0.5);
    }

    for (let index = 0; index < METRIC_KEYS.length; index += 1) {
      const angle = index * angleStep - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      group
        .append("line")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr("x2", x)
        .attr("y2", y)
        .attr("stroke", "#1a1a2e")
        .attr("stroke-width", 0.5);

      group
        .append("text")
        .attr("x", Math.cos(angle) * (radius + 16))
        .attr("y", Math.sin(angle) * (radius + 16))
        .attr("fill", "#667085")
        .attr("font-size", 8)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .text(METRIC_LABELS[METRIC_KEYS[index]]);
    }

    const points = METRIC_KEYS.map((key, index) => {
      const value = evaluation[key as keyof EvaluationResult] as number;
      const angle = index * angleStep - Math.PI / 2;
      return {
        x: Math.cos(angle) * radius * value,
        y: Math.sin(angle) * radius * value,
      };
    });

    const pathData =
      points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ") +
      " Z";

    const overallColor =
      evaluation.overall >= 0.75 ? "#63d58a" : evaluation.overall >= 0.5 ? "#ffbf69" : "#ff6b6b";

    group
      .append("path")
      .attr("d", pathData)
      .attr("fill", overallColor)
      .attr("fill-opacity", 0.14)
      .attr("stroke", overallColor)
      .attr("stroke-width", 1.5);

    for (const point of points) {
      group
        .append("circle")
        .attr("cx", point.x)
        .attr("cy", point.y)
        .attr("r", 3)
        .attr("fill", overallColor);
    }
  }, [evaluation]);

  if (loading) {
    return <div style={containerStyle}><span style={{ color: "#596273" }}>Evaluating...</span></div>;
  }

  if (!evaluation) {
    return <div style={containerStyle}><span style={{ color: "#596273" }}>No evaluation data</span></div>;
  }

  const overallColor =
    evaluation.overall >= 0.75 ? "#63d58a" : evaluation.overall >= 0.5 ? "#ffbf69" : "#ff6b6b";
  const filteredIssues = evaluation.issues.filter((issue) => {
    const metricMatch = selectedMetric ? issue.metric === selectedMetric : true;
    const nodeMatch = selectedNodeId ? issue.nodeIds?.includes(selectedNodeId) ?? false : true;
    return metricMatch && nodeMatch;
  });

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>Evaluation</div>
          <div style={titleStyle}>Constraint Readiness</div>
          {activeVariant && (
            <div style={variantLabelStyle}>{activeVariant.label}</div>
          )}
        </div>
        <button type="button" onClick={() => void loadEvaluation()} style={refreshButtonStyle}>
          Refresh
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ color: "#667085", fontSize: 9, textTransform: "uppercase", letterSpacing: 1 }}>
            Overall Score
          </div>
          <div style={{ color: overallColor, fontSize: 24, fontWeight: "bold" }}>
            {Math.round(evaluation.overall * 100)}%
          </div>
        </div>
        <svg ref={radarRef} />
      </div>

      <div style={{ marginBottom: 12 }}>
        {METRIC_KEYS.map((key) => {
          const value = evaluation[key as keyof EvaluationResult] as number;
          const percentage = Math.round(value * 100);
          const color = value >= 0.75 ? "#63d58a" : value >= 0.5 ? "#ffbf69" : "#ff6b6b";
          const active = selectedMetric === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedMetric((current) => (current === key ? null : key))}
              style={{
                ...metricButtonStyle,
                borderColor: active ? color : "transparent",
                background: active ? "rgba(255,255,255,0.03)" : "transparent",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span style={{ color: "#8d98a7" }}>{METRIC_LABELS[key]}</span>
                <span style={{ color }}>{percentage}%</span>
              </div>
              <div style={{ height: 3, background: "#1a1a2e", borderRadius: 2 }}>
                <div
                  style={{
                    height: "100%",
                    width: `${percentage}%`,
                    background: color,
                    borderRadius: 2,
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {selectedNodeId && (
        <div style={selectedNodeStyle}>
          Selected node: <span style={{ color: "#dce7ff" }}>{selectedNodeId}</span>
        </div>
      )}

      {evaluation.issues.length > 0 && (
        <div>
          <div style={{ color: "#667085", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            Issues ({filteredIssues.length}/{evaluation.issues.length})
          </div>
          <div style={{ maxHeight: 120, overflowY: "auto" }}>
            {filteredIssues.map((issue, index) => (
              <IssueRow
                key={index}
                issue={issue}
                onClick={() => {
                  if (issue.nodeIds?.[0]) {
                    dispatch({ type: "SELECT_NODE", nodeId: issue.nodeIds[0] });
                  }
                }}
              />
            ))}
            {filteredIssues.length === 0 && (
              <div style={{ color: "#596273", fontSize: 10, padding: "6px 0" }}>
                No issues in the current filter.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue, onClick }: { issue: EvaluationIssue; onClick: () => void }) {
  const severityColors = {
    critical: "#ff6b6b",
    warning: "#ffbf69",
    info: "#5b8cff",
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        padding: "3px 0",
        fontSize: 10,
        cursor: issue.nodeIds ? "pointer" : "default",
      }}
      onClick={onClick}
    >
      <span style={{ color: severityColors[issue.severity], fontWeight: "bold", minWidth: 12 }}>
        {issue.severity[0].toUpperCase()}
      </span>
      <span style={{ color: "#8d98a7" }}>{issue.message}</span>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: 11,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 12,
};

const eyebrowStyle: React.CSSProperties = {
  color: "#667085",
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 4,
};

const titleStyle: React.CSSProperties = {
  color: "#e8eefc",
  fontSize: 13,
};

const variantLabelStyle: React.CSSProperties = {
  color: "#74839b",
  fontSize: 10,
  marginTop: 4,
};

const refreshButtonStyle: React.CSSProperties = {
  border: "1px solid #2b3d59",
  background: "#111520",
  color: "#dce7ff",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 10,
  fontFamily: "inherit",
  cursor: "pointer",
};

const metricButtonStyle: React.CSSProperties = {
  width: "100%",
  marginBottom: 4,
  border: "1px solid transparent",
  borderRadius: 8,
  padding: "4px 6px",
  textAlign: "left",
  fontFamily: "inherit",
  cursor: "pointer",
};

const selectedNodeStyle: React.CSSProperties = {
  color: "#8d98a7",
  fontSize: 10,
  marginBottom: 10,
};
