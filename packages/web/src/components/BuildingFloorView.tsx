"use client";

import React, { useMemo } from "react";
import type { FloorNode } from "@gim/core";
import { useGraph } from "@/lib/graph-context";
import {
  ZONE_COLORS,
  FUNC_COLORS,
  EDGE_COLORS,
  FUNC_ORDER,
  floorLabel,
} from "@/lib/graph-colors";

interface FloorGroup {
  floor: number;
  zone: string;
  nodes: FloorNode[];
}

interface ZoneGroup {
  zone: string;
  floors: FloorGroup[];
}

export function BuildingFloorView() {
  const { state, dispatch } = useGraph();
  const { graph, selectedNodeId, selectedFloor, activeEdgeTypes } = state;

  // Connected node IDs for highlight
  const connectedIds = useMemo(() => {
    if (!graph || !selectedNodeId) return new Set<string>();
    const ids = new Set<string>();
    for (const e of graph.edges) {
      if (e.source === selectedNodeId) ids.add(e.target);
      if (e.target === selectedNodeId) ids.add(e.source);
    }
    return ids;
  }, [graph, selectedNodeId]);

  // Group floors by zone (top to bottom)
  const zoneGroups = useMemo((): ZoneGroup[] => {
    if (!graph) return [];

    const byFloor = new Map<number, FloorNode[]>();
    for (const n of graph.nodes) {
      if (!byFloor.has(n.floor_level)) byFloor.set(n.floor_level, []);
      byFloor.get(n.floor_level)!.push(n);
    }

    const floorGroups: FloorGroup[] = Array.from(byFloor.entries())
      .sort(([a], [b]) => b - a) // top to bottom
      .map(([floor, nodes]) => {
        const sorted = [...nodes].sort(
          (a, b) =>
            (FUNC_ORDER.indexOf(a.function) ?? 99) -
            (FUNC_ORDER.indexOf(b.function) ?? 99)
        );
        return { floor, zone: nodes[0]?.floor_zone || "?", nodes: sorted };
      });

    // Group consecutive floors into zones
    const groups: ZoneGroup[] = [];
    let currentZone: string | null = null;
    let currentFloors: FloorGroup[] = [];

    for (const fg of floorGroups) {
      if (fg.zone !== currentZone) {
        if (currentZone && currentFloors.length > 0) {
          groups.push({ zone: currentZone, floors: currentFloors });
        }
        currentZone = fg.zone;
        currentFloors = [fg];
      } else {
        currentFloors.push(fg);
      }
    }
    if (currentZone && currentFloors.length > 0) {
      groups.push({ zone: currentZone, floors: currentFloors });
    }

    return groups;
  }, [graph]);

  // Edge types present in graph
  const edgeTypes = useMemo(() => {
    if (!graph) return [];
    return [...new Set(graph.edges.map((e) => e.type))];
  }, [graph]);

  // All unique functions for legend
  const allFunctions = useMemo(() => {
    if (!graph) return [];
    return [...new Set(graph.nodes.map((n) => n.function))].filter(
      (f) => f !== "elevator_core" && f !== "stairwell" && f !== "service_shaft"
    );
  }, [graph]);

  if (!graph) return null;

  const g = graph.global;
  const selectedNode = graph.nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div style={containerStyle}>
      {/* Header — site info */}
      <div style={headerStyle}>
        <h2 style={{ fontSize: 14, color: "#fff", margin: 0, marginBottom: 4 }}>
          {g.site.location}
        </h2>
        <div style={statsStyle}>
          <span>
            {g.site.dimensions[0]}m × {g.site.dimensions[1]}m
          </span>
          <span style={statSep}>|</span>
          <span>FAR {g.site.far}%</span>
          <span style={statSep}>|</span>
          <span>
            B{g.basement_floors} ~ {g.total_floors}F
          </span>
          <span style={statSep}>|</span>
          <span>GFA {g.program.total_gfa.toLocaleString()}m²</span>
        </div>
        <div style={statsStyle}>
          <span>{graph.nodes.length} nodes</span>
          <span style={statSep}>|</span>
          <span>{graph.edges.length} edges</span>
        </div>
      </div>

      {/* Edge filter */}
      <div style={edgeFilterStyle}>
        {edgeTypes.map((type) => {
          const active = activeEdgeTypes.has(type);
          return (
            <button
              key={type}
              onClick={() =>
                dispatch({ type: "TOGGLE_EDGE_TYPE", edgeType: type })
              }
              style={{
                ...edgeBtnStyle,
                background: active ? "#2a2a4e" : "#111118",
                color: active ? EDGE_COLORS[type] || "#aaf" : "#555",
                borderColor: active ? EDGE_COLORS[type] || "#55a" : "#222",
              }}
            >
              {type.replace(/_/g, " ")}
            </button>
          );
        })}
      </div>

      {/* Scrollable floor view */}
      <div style={scrollAreaStyle}>
        {zoneGroups.map((zg) => (
          <div key={zg.zone}>
            {/* Zone header */}
            <div style={zoneHeaderStyle}>
              <div
                style={{
                  ...zoneBarStyle,
                  background: ZONE_COLORS[zg.zone] || "#333",
                }}
              />
              <span
                style={{
                  color: ZONE_COLORS[zg.zone] || "#666",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                {zg.zone.replace(/_/g, " ")}
              </span>
              <span style={{ color: "#444", fontSize: 9 }}>
                {zg.floors.length}F
              </span>
              <div
                style={{
                  ...zoneBarStyle,
                  flex: 1,
                  background: ZONE_COLORS[zg.zone] || "#333",
                }}
              />
            </div>

            {/* Floor rows */}
            {zg.floors.map(({ floor, zone, nodes }) => {
              const isSelectedFloor = selectedFloor === floor;
              const hasSelectedNode = nodes.some(
                (n) => n.id === selectedNodeId
              );

              return (
                <div
                  key={floor}
                  style={{
                    ...floorRowStyle,
                    background: hasSelectedNode
                      ? "rgba(100,140,255,0.12)"
                      : isSelectedFloor
                        ? "rgba(100,140,255,0.06)"
                        : undefined,
                  }}
                  onClick={() =>
                    dispatch({ type: "SELECT_FLOOR", floor })
                  }
                >
                  {/* Floor label */}
                  <div style={floorLabelStyle}>
                    {floorLabel(floor)}
                  </div>

                  {/* Nodes as dots */}
                  <div style={dotsRowStyle}>
                    {nodes.map((node) => {
                      const isSelected = node.id === selectedNodeId;
                      const isConnected = connectedIds.has(node.id);
                      const isCore =
                        node.function === "elevator_core" ||
                        node.function === "stairwell" ||
                        node.function === "service_shaft";
                      const color =
                        FUNC_COLORS[node.function] ||
                        ZONE_COLORS[zone] ||
                        "#555";

                      const dotSize = isCore ? 6 : 10;
                      const displaySize = isSelected
                        ? dotSize + 4
                        : dotSize;

                      return (
                        <div
                          key={node.id}
                          title={`${node.function.replace(/_/g, " ")} — ${node.position}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatch({
                              type: "SELECT_NODE",
                              nodeId: node.id,
                            });
                          }}
                          style={{
                            width: displaySize,
                            height: displaySize,
                            borderRadius: "50%",
                            background: color,
                            opacity:
                              selectedNodeId && !isSelected && !isConnected
                                ? 0.25
                                : 1,
                            boxShadow: isSelected
                              ? `0 0 0 2px #fff, 0 0 8px ${color}`
                              : isConnected
                                ? `0 0 0 1px rgba(255,255,255,0.4)`
                                : undefined,
                            cursor: "pointer",
                            transition: "all 0.12s",
                            flexShrink: 0,
                          }}
                        />
                      );
                    })}
                  </div>

                  {/* Style ref indicator */}
                  {nodes.some((n) => n.style_ref) && (
                    <div style={styleRefStyle}>
                      {nodes.find((n) => n.style_ref)?.style_ref}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Selected node info bar */}
      {selectedNode && (
        <div style={selectedInfoStyle}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background:
                FUNC_COLORS[selectedNode.function] || "#555",
              flexShrink: 0,
            }}
          />
          <span style={{ color: "#ccc", fontWeight: 500 }}>
            {selectedNode.function.replace(/_/g, " ")}
          </span>
          <span style={{ color: "#555" }}>
            {floorLabel(selectedNode.floor_level)}
          </span>
          <span style={{ color: "#444" }}>
            {selectedNode.position}
          </span>
          <span style={{ color: "#333" }}>
            {selectedNode.id}
          </span>
        </div>
      )}

      {/* Legend */}
      <div style={legendStyle}>
        {allFunctions.map((func) => (
          <div key={func} style={legendItemStyle}>
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: FUNC_COLORS[func] || "#555",
                flexShrink: 0,
              }}
            />
            <span>{func.replace(/_/g, " ")}</span>
          </div>
        ))}
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
  padding: "12px 16px",
  borderBottom: "1px solid #1a1a2e",
};

const statsStyle: React.CSSProperties = {
  color: "#666",
  fontSize: 10,
  lineHeight: 1.8,
  display: "flex",
  flexWrap: "wrap",
  gap: 0,
};

const statSep: React.CSSProperties = {
  color: "#333",
  margin: "0 6px",
};

const edgeFilterStyle: React.CSSProperties = {
  padding: "6px 16px",
  display: "flex",
  flexWrap: "wrap",
  gap: 3,
  borderBottom: "1px solid #1a1a2e",
};

const edgeBtnStyle: React.CSSProperties = {
  border: "1px solid #222",
  fontSize: 8,
  padding: "2px 6px",
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "all 0.15s",
};

const scrollAreaStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "0 0 8px 0",
};

const zoneHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 16px 4px",
  position: "sticky",
  top: 0,
  background: "#0d0d15",
  zIndex: 1,
};

const zoneBarStyle: React.CSSProperties = {
  height: 1,
  width: 20,
  opacity: 0.4,
};

const floorRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "4px 16px",
  cursor: "pointer",
  transition: "background 0.1s",
  minHeight: 24,
};

const floorLabelStyle: React.CSSProperties = {
  width: 32,
  textAlign: "right",
  fontSize: 9,
  color: "#555",
  paddingRight: 10,
  flexShrink: 0,
  fontVariantNumeric: "tabular-nums",
};

const dotsRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  flex: 1,
  flexWrap: "wrap",
  rowGap: 3,
};

const styleRefStyle: React.CSSProperties = {
  fontSize: 8,
  color: "#666",
  marginLeft: 8,
  flexShrink: 0,
};

const selectedInfoStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 16px",
  borderTop: "1px solid #1a1a2e",
  fontSize: 10,
  background: "rgba(100,140,255,0.04)",
};

const legendStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderTop: "1px solid #1a1a2e",
  fontSize: 8,
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  maxHeight: 56,
  overflowY: "auto",
  color: "#666",
};

const legendItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 3,
};
