"use client";

import React from "react";
import { useGraph } from "@/lib/graph-context";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function formatArea(value: number | null) {
  if (!(typeof value === "number" && Number.isFinite(value))) return "-";
  return `${Math.round(value).toLocaleString("en-US")}m²`;
}

function formatPercent(value: number | null) {
  if (!(typeof value === "number" && Number.isFinite(value))) return "-";
  return `${Math.round(value)}%`;
}

function formatAgainst(actual: string, target: string) {
  if (target === "-") return actual;
  return `${actual} / ${target}`;
}

function ratioToPosition(ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  if (ratio <= 1) return ratio * 0.7;
  return 0.7 + Math.min((ratio - 1) / 0.6, 1) * 0.3;
}

function scoreColor(ratio: number | null) {
  if (ratio === null || !Number.isFinite(ratio)) return "#52627a";
  if (ratio > 1.08) return "#f59b4d";
  if (ratio >= 0.9) return "#63d471";
  return "#5b8cff";
}

type MetricRow = {
  id: string;
  label: string;
  score: number;
  detail: string;
  ratio: number | null;
  targetMissing?: boolean;
};

export function VariantEvaluationPanel() {
  const { variantHistory, activeVariantId } = useGraph();
  const activeVariant =
    variantHistory.find((variant) => variant.id === activeVariantId) ?? null;

  if (!activeVariant) return null;

  const metrics = activeVariant.scenarioMetrics;
  const overallScore = Math.round(metrics.satisfaction * 100);
  const rows: MetricRow[] = [
    {
      id: "overall",
      label: "Overall",
      score: metrics.satisfaction,
      detail: `${overallScore}/100`,
      ratio: metrics.satisfaction,
    },
    {
      id: "far",
      label: "FAR",
      score:
        typeof metrics.target_far_percent === "number" && metrics.target_far_percent > 0 && metrics.far_percent !== null
          ? clamp01(1 - Math.abs(metrics.far_percent - metrics.target_far_percent) / metrics.target_far_percent)
          : 0,
      ratio:
        typeof metrics.target_far_percent === "number" &&
        metrics.target_far_percent > 0 &&
        metrics.far_percent !== null
          ? metrics.far_percent / metrics.target_far_percent
          : null,
      detail: formatAgainst(
        formatPercent(metrics.far_percent),
        formatPercent(metrics.target_far_percent)
      ),
      targetMissing:
        !(typeof metrics.target_far_percent === "number" && metrics.target_far_percent > 0),
    },
    {
      id: "bcr",
      label: "BCR",
      score:
        typeof metrics.target_bcr_percent === "number" && metrics.target_bcr_percent > 0 && metrics.bcr_percent !== null
          ? clamp01(1 - Math.abs(metrics.bcr_percent - metrics.target_bcr_percent) / metrics.target_bcr_percent)
          : 0,
      ratio:
        typeof metrics.target_bcr_percent === "number" &&
        metrics.target_bcr_percent > 0 &&
        metrics.bcr_percent !== null
          ? metrics.bcr_percent / metrics.target_bcr_percent
          : null,
      detail: formatAgainst(
        formatPercent(metrics.bcr_percent),
        formatPercent(metrics.target_bcr_percent)
      ),
      targetMissing:
        !(typeof metrics.target_bcr_percent === "number" && metrics.target_bcr_percent > 0),
    },
    ...metrics.program_metrics.map((programMetric) => ({
      id: `program-${programMetric.program}`,
      label: programMetric.program,
      score: programMetric.satisfaction,
      ratio:
        typeof programMetric.target_area_m2 === "number" && programMetric.target_area_m2 > 0
          ? programMetric.actual_area_m2 / programMetric.target_area_m2
          : null,
      detail: formatAgainst(
        formatArea(programMetric.actual_area_m2),
        formatArea(programMetric.target_area_m2)
      ),
      targetMissing:
        !(typeof programMetric.target_area_m2 === "number" && programMetric.target_area_m2 > 0),
    })),
  ];
  const missingScenarioTargets =
    rows.filter((row) => row.id !== "overall").length === 0 ||
    rows
      .filter((row) => row.id !== "overall")
      .every((row) => row.targetMissing);

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>Evaluation</div>
          <div style={titleStyle}>Scenario Fit</div>
        </div>
        <div style={metaStyle}>{activeVariant.label}</div>
      </div>

      <div style={overallWrapStyle}>
        <div style={overallValueStyle}>{overallScore}/100</div>
        <div style={overallLabelStyle}>Overall Scenario Score</div>
      </div>

      {missingScenarioTargets && (
        <div style={emptyNoteStyle}>
          No scenario targets found in the current graph. Run a forum session with FAR, BCR,
          and program targets to evaluate them here.
        </div>
      )}

      <div style={rowsStyle}>
        {rows
          .filter((row) => row.id !== "overall")
          .map((row) => {
            const position = row.ratio === null ? 0 : ratioToPosition(row.ratio);
            const color = scoreColor(row.ratio);
            return (
          <div key={row.id} style={rowWrapStyle}>
            <div style={rowHeaderStyle}>
              <span style={labelStyle}>{row.label}</span>
              <span style={detailStyle}>{row.detail}</span>
            </div>
            <div style={trackStyle}>
              <div style={targetMarkerStyle} />
              <div
                style={{
                  ...fillStyle,
                  width: `${Math.max(position * 100, row.ratio === null ? 0 : 3)}%`,
                  background: color,
                }}
              />
            </div>
          </div>
            );
          })}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  padding: "10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  height: "100%",
  minHeight: 0,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const eyebrowStyle: React.CSSProperties = {
  color: "#667085",
  fontSize: 8,
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 3,
};

const titleStyle: React.CSSProperties = {
  color: "#e8eefc",
  fontSize: 12,
};

const metaStyle: React.CSSProperties = {
  color: "#93a8c8",
  fontSize: 9,
};

const rowsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minHeight: 0,
};

const overallWrapStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  paddingBottom: 2,
};

const overallValueStyle: React.CSSProperties = {
  color: "#f4f7ff",
  fontSize: 26,
  lineHeight: 1,
  fontWeight: 600,
  letterSpacing: -0.6,
};

const overallLabelStyle: React.CSSProperties = {
  color: "#7f90ab",
  fontSize: 9,
  letterSpacing: 0.2,
};

const emptyNoteStyle: React.CSSProperties = {
  color: "#7f90ab",
  fontSize: 8,
  lineHeight: 1.45,
  paddingBottom: 2,
};

const rowWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
};

const rowHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "baseline",
};

const labelStyle: React.CSSProperties = {
  color: "#dce7ff",
  fontSize: 9,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const detailStyle: React.CSSProperties = {
  color: "#74839b",
  fontSize: 8,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 142,
  textAlign: "right",
};

const trackStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: 6,
  borderRadius: 999,
  background: "#171f2c",
  overflow: "hidden",
};

const fillStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: 999,
};

const targetMarkerStyle: React.CSSProperties = {
  position: "absolute",
  left: "70%",
  top: 0,
  bottom: 0,
  width: 1,
  background: "rgba(255,255,255,0.28)",
  zIndex: 1,
};
