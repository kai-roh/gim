"use client";

import React from "react";
import { useGraph } from "@/lib/graph-context";
import { massColor } from "@/lib/graph-colors";
import { BUTTON_RADIUS } from "@/lib/ui";

export function TowerMinimap() {
  const { state, dispatch } = useGraph();
  const { graph, selectedNodeId } = state;

  if (!graph) return null;

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>Mass Index</div>
      <div style={listStyle}>
        {graph.nodes.map((node) => (
          <button
            key={node.id}
            onClick={() => dispatch({ type: "SELECT_NODE", nodeId: node.id })}
            style={{
              ...itemStyle,
              borderColor: selectedNodeId === node.id ? "#dce7ff" : "#252a33",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: massColor(node.id),
                display: "inline-block",
              }}
            />
            <span style={{ color: "#d6dce8" }}>{node.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
};

const titleStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid #1a1a2e",
  color: "#8d98a7",
  fontSize: 12,
};

const listStyle: React.CSSProperties = {
  padding: "12px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const itemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid #252a33",
  borderRadius: BUTTON_RADIUS,
  background: "#111520",
  padding: "8px 10px",
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
};
