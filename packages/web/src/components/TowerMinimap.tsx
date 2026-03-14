"use client";

import React, { useMemo } from "react";
import { useGraph } from "@/lib/graph-context";
import { ZONE_COLORS, FUNC_COLORS, floorLabel } from "@/lib/graph-colors";

export function TowerMinimap() {
  const { state, dispatch } = useGraph();
  const { graph, selectedFloor } = state;

  const floorData = useMemo(() => {
    if (!graph) return [];
    const byFloor = new Map<number, typeof graph.nodes>();
    for (const n of graph.nodes) {
      if (!byFloor.has(n.floor_level)) byFloor.set(n.floor_level, []);
      byFloor.get(n.floor_level)!.push(n);
    }
    return Array.from(byFloor.entries())
      .sort(([a], [b]) => b - a) // top to bottom
      .map(([floor, nodes]) => {
        const sorted = [...nodes].sort((a, b) => {
          const order: Record<string, number> = {
            elevator_core: 0,
            stairwell: 1,
            service_shaft: 2,
          };
          return (order[a.function] ?? 10) - (order[b.function] ?? 10);
        });
        return { floor, zone: nodes[0]?.floor_zone || "?", nodes: sorted };
      });
  }, [graph]);

  if (!graph) return null;

  const g = graph.global;

  return (
    <>
      {/* Header */}
      <div style={headerStyle}>
        <h2 style={{ fontSize: 15, color: "#fff", margin: 0, marginBottom: 6 }}>
          {g.site.location}
        </h2>
        <div style={{ color: "#666", fontSize: 11, lineHeight: 1.6 }}>
          <div>
            {g.site.dimensions[0]}m x {g.site.dimensions[1]}m | FAR {g.site.far}%
          </div>
          <div>
            B{g.basement_floors} ~ {g.total_floors}F | GFA{" "}
            {g.program.total_gfa.toLocaleString()}m²
          </div>
          <div>
            Nodes: {graph.nodes.length} | Edges: {graph.edges.length}
          </div>
        </div>
      </div>

      {/* Floor rows */}
      <div style={scrollStyle}>
        {floorData.map(({ floor, zone, nodes }) => (
          <div
            key={floor}
            style={{
              ...floorRowStyle,
              background:
                selectedFloor === floor
                  ? "rgba(100,140,255,0.12)"
                  : undefined,
            }}
            onClick={() => dispatch({ type: "SELECT_FLOOR", floor })}
          >
            <div style={floorLabelStyle}>{floorLabel(floor)}</div>
            <div
              style={{
                ...zoneMarkerStyle,
                color: ZONE_COLORS[zone] || "#444",
              }}
            >
              {zone[0].toUpperCase()}
            </div>
            <div style={floorBarStyle}>
              {nodes.map((node) => {
                const isCore = node.function === "elevator_core";
                const isStairwell = node.function === "stairwell";
                const isSpecial = [
                  "brand_showroom",
                  "installation_space",
                  "mechanical_room",
                  "server_room",
                ].includes(node.function);

                return (
                  <div
                    key={node.id}
                    title={node.name}
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: "SELECT_NODE", nodeId: node.id });
                    }}
                    style={{
                      height: 10,
                      borderRadius: 1,
                      flex: isCore ? "0 0 12px" : isStairwell ? "0 0 8px" : 1,
                      maxWidth: isCore ? 12 : isStairwell ? 8 : 50,
                      background:
                        FUNC_COLORS[node.function] ||
                        ZONE_COLORS[zone] ||
                        "#333",
                      border: isSpecial
                        ? "1px solid rgba(255,255,255,0.3)"
                        : undefined,
                      cursor: "pointer",
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={legendStyle}>
        {Array.from(new Set(graph.nodes.map((n) => n.function)))
          .filter((f) => f !== "elevator_core" && f !== "stairwell")
          .map((func) => (
            <div key={func} style={legendItemStyle}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 1,
                  background: FUNC_COLORS[func] || "#555",
                }}
              />
              <span>{func.replace(/_/g, " ")}</span>
            </div>
          ))}
      </div>
    </>
  );
}

const headerStyle: React.CSSProperties = {
  padding: 16,
  borderBottom: "1px solid #1a1a2e",
  fontSize: 13,
};

const scrollStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "4px 10px",
};

const floorRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: 12,
  cursor: "pointer",
  transition: "background 0.1s",
};

const floorLabelStyle: React.CSSProperties = {
  width: 32,
  textAlign: "right",
  fontSize: 8,
  color: "#555",
  paddingRight: 5,
  flexShrink: 0,
};

const zoneMarkerStyle: React.CSSProperties = {
  width: 8,
  fontSize: 7,
  textAlign: "center",
  flexShrink: 0,
};

const floorBarStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  gap: 1,
  padding: "1px 0",
};

const legendStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderTop: "1px solid #1a1a2e",
  fontSize: 9,
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  maxHeight: 80,
  overflowY: "auto",
};

const legendItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 3,
};
