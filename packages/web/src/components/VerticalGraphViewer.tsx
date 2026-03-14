"use client";

import React, { useRef, useEffect, useCallback } from "react";
import * as d3 from "d3";
import { useGraph } from "@/lib/graph-context";
import {
  ZONE_COLORS,
  FUNC_COLORS,
  EDGE_COLORS,
  FUNC_ORDER,
  floorLabel,
} from "@/lib/graph-colors";

export function VerticalGraphViewer() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = useGraph();
  const { graph, selectedNodeId, activeEdgeTypes } = state;

  const renderGraph = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !graph) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const W = containerRef.current.clientWidth;
    const H = containerRef.current.clientHeight;

    const g = svg.append("g");

    // Group nodes by floor
    const nodesByFloor = new Map<number, typeof graph.nodes>();
    for (const n of graph.nodes) {
      if (!nodesByFloor.has(n.floor_level))
        nodesByFloor.set(n.floor_level, []);
      nodesByFloor.get(n.floor_level)!.push(n);
    }
    const floors = Array.from(nodesByFloor.keys()).sort((a, b) => a - b);
    const minF = floors[0];
    const maxF = floors[floors.length - 1];

    const margin = { top: 40, bottom: 40, left: 60, right: 60 };
    const plotW = W - margin.left - margin.right;
    const plotH = H - margin.top - margin.bottom;
    const yScale = d3
      .scaleLinear()
      .domain([minF, maxF])
      .range([plotH + margin.top, margin.top]);

    // Compute node positions
    const nodePositions = new Map<
      string,
      { x: number; y: number; node: (typeof graph.nodes)[0] }
    >();
    for (const [floor, nodes] of nodesByFloor) {
      const sorted = [...nodes].sort(
        (a, b) =>
          (FUNC_ORDER.indexOf(a.function) ?? 99) -
          (FUNC_ORDER.indexOf(b.function) ?? 99)
      );
      const count = sorted.length;
      const spacing = Math.min(plotW / (count + 1), 80);
      const startX = margin.left + (plotW - spacing * (count - 1)) / 2;
      sorted.forEach((node, i) => {
        nodePositions.set(node.id, {
          x: startX + i * spacing,
          y: yScale(floor),
          node,
        });
      });
    }

    // Zone bands
    const zoneRanges: { zone: string; start: number; end: number }[] = [];
    let curZone: string | null = null;
    let zStart = 0;
    for (const f of floors) {
      const z = nodesByFloor.get(f)![0]?.floor_zone;
      if (z !== curZone) {
        if (curZone)
          zoneRanges.push({
            zone: curZone,
            start: zStart,
            end: floors[floors.indexOf(f) - 1],
          });
        curZone = z;
        zStart = f;
      }
    }
    if (curZone)
      zoneRanges.push({
        zone: curZone,
        start: zStart,
        end: floors[floors.length - 1],
      });

    // Draw zone bands
    const zoneBands = g.append("g");
    zoneBands
      .selectAll("rect")
      .data(zoneRanges)
      .enter()
      .append("rect")
      .attr("x", margin.left - 30)
      .attr("width", plotW + 60)
      .attr("y", (d) => yScale(d.end) - 4)
      .attr("height", (d) =>
        Math.max(yScale(d.start) - yScale(d.end) + 8, 2)
      )
      .attr("fill", (d) => ZONE_COLORS[d.zone] || "#222")
      .attr("opacity", 0.08)
      .attr("rx", 3);

    zoneBands
      .selectAll("text")
      .data(zoneRanges)
      .enter()
      .append("text")
      .attr("x", W - margin.right + 10)
      .attr("y", (d) => (yScale(d.start) + yScale(d.end)) / 2)
      .attr("dominant-baseline", "middle")
      .attr("fill", (d) => ZONE_COLORS[d.zone] || "#555")
      .attr("font-size", 10)
      .attr("opacity", 0.7)
      .text((d) => d.zone.replace(/_/g, " "));

    // Draw edges
    const filteredEdges = graph.edges.filter(
      (e) =>
        activeEdgeTypes.has(e.type) &&
        nodePositions.has(e.source) &&
        nodePositions.has(e.target)
    );
    const maxEdges = 2000;
    const edgesToDraw =
      filteredEdges.length > maxEdges
        ? filteredEdges.filter(
            (_, i) =>
              i % Math.ceil(filteredEdges.length / maxEdges) === 0
          )
        : filteredEdges;

    g.append("g")
      .selectAll("line")
      .data(edgesToDraw)
      .enter()
      .append("line")
      .attr("x1", (d) => nodePositions.get(d.source)?.x || 0)
      .attr("y1", (d) => nodePositions.get(d.source)?.y || 0)
      .attr("x2", (d) => nodePositions.get(d.target)?.x || 0)
      .attr("y2", (d) => nodePositions.get(d.target)?.y || 0)
      .attr("stroke", (d) => EDGE_COLORS[d.type] || "#333")
      .attr("stroke-width", (d) =>
        d.type === "ZONE_BOUNDARY" || d.type === "STRUCTURAL_TRANSFER"
          ? 1.5
          : 0.5
      )
      .attr("opacity", (d) =>
        selectedNodeId
          ? d.source === selectedNodeId || d.target === selectedNodeId
            ? 0.8
            : 0.05
          : d.type === "STACKED_ON"
            ? 0.15
            : d.type === "ADJACENT_TO"
              ? 0.2
              : 0.5
      );

    // Draw nodes
    g.append("g")
      .selectAll("circle")
      .data(Array.from(nodePositions.values()))
      .enter()
      .append("circle")
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => d.y)
      .attr("r", (d) => {
        const base =
          d.node.function === "elevator_core"
            ? 3
            : d.node.function === "stairwell"
              ? 2
              : ["outrigger", "refuge_area"].includes(d.node.function)
                ? 5
                : 4;
        return d.node.id === selectedNodeId ? base + 2 : base;
      })
      .attr(
        "fill",
        (d) =>
          FUNC_COLORS[d.node.function] ||
          ZONE_COLORS[d.node.floor_zone] ||
          "#555"
      )
      .attr("stroke", (d) =>
        selectedNodeId === d.node.id ? "#fff" : "none"
      )
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on("click", (_, d) => {
        dispatch({ type: "SELECT_NODE", nodeId: d.node.id });
      });

    // Floor axis
    const axisFloors = floors.filter(
      (f) => f % 5 === 0 || f === minF || f === maxF
    );
    g.selectAll(".ftick")
      .data(axisFloors)
      .enter()
      .append("text")
      .attr("x", margin.left - 10)
      .attr("y", (d) => yScale(d))
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .attr("fill", "#555")
      .attr("font-size", 9)
      .text((d) => floorLabel(d));

    // Zoom
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 5])
        .on("zoom", (ev) => {
          g.attr("transform", ev.transform.toString());
        })
    );
  }, [graph, selectedNodeId, activeEdgeTypes, dispatch]);

  useEffect(() => {
    renderGraph();
  }, [renderGraph]);

  useEffect(() => {
    const handleResize = () => renderGraph();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [renderGraph]);

  // Edge filter buttons
  const edgeTypes = graph
    ? [...new Set(graph.edges.map((e) => e.type))]
    : [];

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      {/* Edge filters */}
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
                background: active ? "#2a2a4e" : "#1a1a2e",
                color: active ? "#aaf" : "#888",
                borderColor: active
                  ? EDGE_COLORS[type] || "#55a"
                  : "#333",
              }}
            >
              {type}
            </button>
          );
        })}
      </div>

      <svg
        ref={svgRef}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

const edgeFilterStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  padding: "8px 16px",
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
  zIndex: 10,
};

const edgeBtnStyle: React.CSSProperties = {
  border: "1px solid #333",
  fontSize: 9,
  padding: "2px 8px",
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "all 0.15s",
};
