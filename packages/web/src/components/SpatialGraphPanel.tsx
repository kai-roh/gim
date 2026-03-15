"use client";

import React, { useMemo, useState } from "react";
import { useGraph } from "@/lib/graph-context";
import { HIERARCHY_COLORS, RELATION_COLORS, massColor } from "@/lib/graph-colors";

type Point = { x: number; y: number };

function layoutNodes(nodeIds: string[], radius: number, center: Point): Map<string, Point> {
  const positions = new Map<string, Point>();
  const count = Math.max(nodeIds.length, 1);
  nodeIds.forEach((nodeId, index) => {
    const angle = (-Math.PI / 2) + (index / count) * Math.PI * 2;
    positions.set(nodeId, {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  });
  return positions;
}

export function SpatialGraphPanel() {
  const { state, dispatch } = useGraph();
  const { graph, selectedNodeId, activeRelationFamilies } = state;
  const [zoom, setZoom] = useState(1);

  const viewModel = useMemo(() => {
    if (!graph) return null;

    const hierarchyOrder = ["primary", "secondary", "tertiary"] as const;
    const positions = new Map<string, Point>();
    const center = { x: 210, y: 164 };

    hierarchyOrder.forEach((hierarchy, level) => {
      const ids = graph.nodes
        .filter((node) => node.hierarchy === hierarchy)
        .map((node) => node.id)
        .sort();
      const radius = 42 + level * 62;
      const ringPositions = layoutNodes(ids, radius, center);
      ringPositions.forEach((point, nodeId) => positions.set(nodeId, point));
    });

    const visibleRelations = graph.relations.filter(
      (relation) =>
        !relation.id.includes("__inverse") && activeRelationFamilies.has(relation.family)
    );

    return { positions, visibleRelations };
  }, [graph, activeRelationFamilies]);

  const connectedIds = useMemo(() => {
    if (!selectedNodeId || !viewModel) return new Set<string>();
    const ids = new Set<string>();
    viewModel.visibleRelations.forEach((relation) => {
      if (relation.source === selectedNodeId) ids.add(relation.target);
      if (relation.target === selectedNodeId) ids.add(relation.source);
    });
    return ids;
  }, [selectedNodeId, viewModel]);

  if (!graph || !viewModel) return null;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>SpatialMassGraph</div>
          <div style={titleStyle}>Node-Link View</div>
        </div>
        <div style={legendStyle}>
          {["primary", "secondary", "tertiary"].map((hierarchy) => (
            <div key={hierarchy} style={legendItemStyle}>
              <span
                style={{
                  ...legendDotStyle,
                  background: HIERARCHY_COLORS[hierarchy] || "#9fb0c6",
                }}
              />
              <span>{hierarchy}</span>
            </div>
          ))}
        </div>
      </div>

      <svg
        viewBox="0 0 420 360"
        style={svgStyle}
        onWheel={(event) => {
          event.preventDefault();
          setZoom((value) =>
            Math.min(2.4, Math.max(0.65, value + (event.deltaY > 0 ? -0.08 : 0.08)))
          );
        }}
      >
        <g transform={`translate(210 164) scale(${zoom}) translate(-210 -164)`}>
          {[42, 104, 166].map((radius) => (
            <circle
              key={radius}
              cx={210}
              cy={164}
              r={radius}
              fill="none"
              stroke="#182131"
              strokeWidth={1}
              strokeDasharray="4 6"
            />
          ))}

          {viewModel.visibleRelations.map((relation) => {
            const source = viewModel.positions.get(relation.source);
            const target = viewModel.positions.get(relation.target);
            if (!source || !target) return null;
            const touchesSelected =
              !!selectedNodeId &&
              (relation.source === selectedNodeId || relation.target === selectedNodeId);
            const touchesConnected =
              !!selectedNodeId &&
              (connectedIds.has(relation.source) || connectedIds.has(relation.target));
            return (
              <line
                key={relation.id}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={RELATION_COLORS[relation.family] || "#42526a"}
                strokeWidth={touchesSelected ? 2.4 : touchesConnected ? 1.8 : 1.3}
                opacity={
                  selectedNodeId
                    ? touchesSelected
                      ? 0.95
                      : touchesConnected
                        ? 0.5
                        : 0.14
                    : 0.58
                }
              />
            );
          })}

          {graph.nodes.map((node) => {
            const point = viewModel.positions.get(node.id);
            if (!point) return null;
            const selected = node.id === selectedNodeId;
            const connected = connectedIds.has(node.id);
            const opacity = selectedNodeId ? (selected ? 1 : connected ? 0.74 : 0.22) : 0.96;
            return (
              <g
                key={node.id}
                transform={`translate(${point.x},${point.y})`}
                style={{ cursor: "pointer" }}
                onClick={() => dispatch({ type: "SELECT_NODE", nodeId: node.id })}
              >
                <circle
                  r={selected ? 14 : connected ? 12 : 11}
                  fill={massColor(node.id)}
                  stroke={selected ? "#f3f7ff" : connected ? "#c8d6ef" : "#0f1622"}
                  strokeWidth={selected ? 2.5 : connected ? 2 : 1.5}
                  opacity={opacity}
                />
                <text
                  x={0}
                  y={selected ? 24 : 21}
                  textAnchor="middle"
                  fill={selected ? "#f3f7ff" : connected ? "#c8d6ef" : "#9fb0c6"}
                  opacity={opacity}
                  fontSize="10"
                >
                  {node.name.length > 16 ? `${node.name.slice(0, 16)}…` : node.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  height: "100%",
  background: "#0d0d15",
};

const headerStyle: React.CSSProperties = {
  padding: "14px 16px 10px",
  borderBottom: "1px solid #1a1a2e",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
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
  whiteSpace: "nowrap",
};

const legendStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
  fontSize: 9,
  color: "#7f90ab",
};

const legendItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const legendDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
};

const svgStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: 320,
  background: "radial-gradient(circle at 50% 50%, rgba(30,43,62,0.32), rgba(10,10,15,0.9))",
};
