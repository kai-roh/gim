"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import * as d3 from "d3";
import type { EvaluationResult, EvaluationIssue } from "@gim/core";
import { useGraph } from "@/lib/graph-context";

const V1_METRIC_LABELS: Record<string, string> = {
  connectivity_accuracy: "Connectivity",
  vertical_continuity: "Continuity",
  zone_coverage: "Coverage",
  structural_feasibility: "Structure",
  code_compliance: "Compliance",
  brand_identity: "Brand",
  spatial_quality: "Spatial",
};

const V2_METRIC_LABELS: Record<string, string> = {
  relation_satisfaction: "Relations",
  model_readiness: "Model",
  narrative_completeness: "Narrative",
  graph_coherence: "Coherence",
  structural_feasibility: "Structure",
};

const reEvalBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #2a2a3e",
  borderRadius: 3,
  color: "#666",
  fontSize: 9,
  padding: "2px 8px",
  cursor: "pointer",
  fontFamily: "inherit",
};

export function EvaluationDashboard() {
  const [evaluation, setEvaluation] = useState<(EvaluationResult & { version?: number }) | null>(null);
  const [loading, setLoading] = useState(false);
  const radarRef = useRef<SVGSVGElement>(null);
  const { state, dispatch } = useGraph();

  const loadEvaluation = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/graph/evaluate");
      if (resp.ok) {
        const data = await resp.json();
        setEvaluation(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvaluation();
  }, [loadEvaluation]);

  // Re-evaluate when graph changes (debounced)
  const graphVersion = state.graphVersion;
  const massGraph = state.massGraph;
  const graph = state.graph;

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadEvaluation();
    }, 1000);
    return () => clearTimeout(timeout);
  }, [massGraph, graph, loadEvaluation]);

  const metricLabels = evaluation?.version === 2 ? V2_METRIC_LABELS : V1_METRIC_LABELS;
  const metricKeys = Object.keys(metricLabels);

  // Draw radar chart
  useEffect(() => {
    if (!radarRef.current || !evaluation) return;

    const svg = d3.select(radarRef.current);
    svg.selectAll("*").remove();

    const size = 200;
    const cx = size / 2;
    const cy = size / 2;
    const maxR = 80;

    const g = svg
      .attr("width", size)
      .attr("height", size)
      .append("g")
      .attr("transform", `translate(${cx},${cy})`);

    const n = metricKeys.length;
    const angleStep = (2 * Math.PI) / n;

    // Grid circles
    for (const r of [0.25, 0.5, 0.75, 1.0]) {
      g.append("circle")
        .attr("r", maxR * r)
        .attr("fill", "none")
        .attr("stroke", "#1a1a2e")
        .attr("stroke-width", 0.5);
    }

    // Axes
    for (let i = 0; i < n; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const x = Math.cos(angle) * maxR;
      const y = Math.sin(angle) * maxR;
      g.append("line")
        .attr("x1", 0).attr("y1", 0)
        .attr("x2", x).attr("y2", y)
        .attr("stroke", "#1a1a2e")
        .attr("stroke-width", 0.5);

      // Labels
      const lx = Math.cos(angle) * (maxR + 16);
      const ly = Math.sin(angle) * (maxR + 16);
      g.append("text")
        .attr("x", lx).attr("y", ly)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("fill", "#666")
        .attr("font-size", 8)
        .text(metricLabels[metricKeys[i]]);
    }

    // Data polygon
    const points = metricKeys.map((key, i) => {
      const val = (evaluation as any)[key] as number;
      const angle = i * angleStep - Math.PI / 2;
      return {
        x: Math.cos(angle) * maxR * val,
        y: Math.sin(angle) * maxR * val,
      };
    });

    const pathData = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ") + " Z";

    // Color based on overall score
    const overallColor = evaluation.overall >= 0.75 ? "#44c464" : evaluation.overall >= 0.5 ? "#d4a444" : "#e45444";

    g.append("path")
      .attr("d", pathData)
      .attr("fill", overallColor)
      .attr("fill-opacity", 0.15)
      .attr("stroke", overallColor)
      .attr("stroke-width", 1.5);

    // Data points
    for (const p of points) {
      g.append("circle")
        .attr("cx", p.x).attr("cy", p.y)
        .attr("r", 3)
        .attr("fill", overallColor);
    }
  }, [evaluation, metricKeys, metricLabels]);

  if (loading) {
    return <div style={containerStyle}><span style={{ color: "#555" }}>Evaluating...</span></div>;
  }

  if (!evaluation) {
    return <div style={containerStyle}><span style={{ color: "#555" }}>No evaluation data</span></div>;
  }

  const overallColor = evaluation.overall >= 0.75 ? "#44c464" : evaluation.overall >= 0.5 ? "#d4a444" : "#e45444";

  return (
    <div style={containerStyle}>
      {/* Header + Overall Score */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ color: "#666", fontSize: 9, textTransform: "uppercase", letterSpacing: 1 }}>
              Overall Score
            </div>
            <button onClick={loadEvaluation} style={reEvalBtnStyle}>
              Re-evaluate
            </button>
          </div>
          <div style={{ color: overallColor, fontSize: 24, fontWeight: "bold" }}>
            {Math.round(evaluation.overall * 100)}%
          </div>
        </div>
        <svg ref={radarRef} />
      </div>

      {/* Metric bars */}
      <div style={{ marginBottom: 12 }}>
        {metricKeys.map((key) => {
          const val = (evaluation as any)[key] as number;
          const pct = Math.round(val * 100);
          const color = val >= 0.75 ? "#44c464" : val >= 0.5 ? "#d4a444" : "#e45444";
          return (
            <div key={key} style={{ marginBottom: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span style={{ color: "#888" }}>{metricLabels[key]}</span>
                <span style={{ color }}>{pct}%</span>
              </div>
              <div style={{ height: 3, background: "#1a1a2e", borderRadius: 2 }}>
                <div style={{ height: "100%", width: pct + "%", background: color, borderRadius: 2 }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Issues */}
      {evaluation.issues.length > 0 && (
        <div>
          <div style={{ color: "#666", fontSize: 9, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
            Issues ({evaluation.issues.length})
          </div>
          <div style={{ maxHeight: 120, overflowY: "auto" }}>
            {evaluation.issues.map((issue, i) => (
              <IssueRow
                key={i}
                issue={issue}
                onClick={() => {
                  if (issue.nodeIds?.[0]) {
                    dispatch({ type: "SELECT_NODE", nodeId: issue.nodeIds[0] });
                  } else if (issue.floor !== undefined) {
                    dispatch({ type: "SELECT_FLOOR", floor: issue.floor });
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue, onClick }: { issue: EvaluationIssue; onClick: () => void }) {
  const sevColors = { critical: "#e45444", warning: "#d4a444", info: "#4488cc" };
  const sevIcons = { critical: "!!", warning: "!", info: "i" };

  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        padding: "3px 0",
        fontSize: 10,
        cursor: issue.nodeIds || issue.floor !== undefined ? "pointer" : "default",
      }}
      onClick={onClick}
    >
      <span style={{ color: sevColors[issue.severity], fontWeight: "bold", minWidth: 12 }}>
        {sevIcons[issue.severity]}
      </span>
      <span style={{ color: "#888" }}>{issue.message}</span>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: 11,
};
