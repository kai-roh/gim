"use client";

import React, { useRef, useEffect, useCallback, useMemo } from "react";
import * as d3 from "d3";
import { useGraph } from "@/lib/graph-context";
import { MASS_TYPE_COLORS, MASS_RELATION_COLORS, getMassIdentityColor } from "@/lib/graph-colors";

// ============================================================
// Style constants
// ============================================================

const containerStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  background: "#0d0d15",
};

const headerStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid #1a1a2e",
  fontSize: 10,
  color: "#666",
};

// ============================================================
// Force simulation config
// ============================================================

const LINK_DISTANCE = 60;
const CHARGE_STRENGTH = -120;
const COLLIDE_RADIUS = 20;

function getNodeRadius(type: string): number {
  if (type === "solid") return 12;
  if (type === "core") return 8;
  return 10;
}

function getEdgeWidth(strength: string): number {
  return strength === "hard" ? 1.5 : 1;
}

function truncateLabel(label: string, max = 10): string {
  return label.length > max ? label.slice(0, max) + "\u2026" : label;
}

// ============================================================
// Types for D3 simulation
// ============================================================

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  type: string;
  label: string;
  massIndex: number;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string;
  family: string;
  strength: string;
}

// ============================================================
// Component
// ============================================================

export default function SpatialGraphPanel() {
  const { state, dispatch, massNodes, massRelations } = useGraph();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);

  const selectedNodeId = state.selectedNodeId;

  // Build connected set for emphasis
  const connectedIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const ids = new Set<string>();
    for (const r of massRelations) {
      if (r.source === selectedNodeId) ids.add(r.target);
      if (r.target === selectedNodeId) ids.add(r.source);
    }
    return ids;
  }, [selectedNodeId, massRelations]);

  // Build sim data
  const { simNodes, simLinks } = useMemo(() => {
    const nodes: SimNode[] = massNodes.map((n, i) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      massIndex: i,
    }));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const links: SimLink[] = massRelations
      .filter((r) => nodeIds.has(r.source) && nodeIds.has(r.target))
      .map((r) => ({
        id: r.id,
        source: r.source,
        target: r.target,
        family: r.family,
        strength: r.strength,
      }));
    return { simNodes: nodes, simLinks: links };
  }, [massNodes, massRelations]);

  // Node click handler
  const handleNodeClick = useCallback(
    (nodeId: string) => {
      dispatch({ type: "SELECT_NODE", nodeId: selectedNodeId === nodeId ? null : nodeId });
    },
    [dispatch, selectedNodeId],
  );

  // D3 render
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const container = svg.parentElement;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const sel = d3.select(svg);
    sel.selectAll("*").remove();
    sel.attr("width", width).attr("height", height);

    if (simNodes.length === 0) return;

    // Deep copy nodes to avoid mutating memo
    const nodes: SimNode[] = simNodes.map((n) => ({ ...n }));
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const links: SimLink[] = simLinks.map((l) => ({
      ...l,
      source: l.source as any,
      target: l.target as any,
    }));

    // Force simulation
    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance(LINK_DISTANCE),
      )
      .force("charge", d3.forceManyBody().strength(CHARGE_STRENGTH))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(COLLIDE_RADIUS));

    simulationRef.current = simulation;

    // Links
    const linkSel = sel
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", (d) => MASS_RELATION_COLORS[d.family] ?? "#333")
      .attr("stroke-width", (d) => getEdgeWidth(d.strength))
      .attr("stroke-opacity", 0.6);

    // Node groups
    const nodeSel = sel
      .append("g")
      .attr("class", "nodes")
      .selectAll<SVGGElement, SimNode>("g")
      .data(nodes)
      .enter()
      .append("g")
      .style("cursor", "pointer")
      .on("click", (_event, d) => handleNodeClick(d.id));

    // Node circles
    nodeSel
      .append("circle")
      .attr("r", (d) => getNodeRadius(d.type))
      .attr("fill", (d) => getMassIdentityColor(d.massIndex))
      .attr("stroke", "none")
      .attr("stroke-width", 0);

    // Labels
    nodeSel
      .append("text")
      .text((d) => truncateLabel(d.label))
      .attr("text-anchor", "middle")
      .attr("dy", (d) => getNodeRadius(d.type) + 12)
      .attr("font-size", 9)
      .attr("fill", "#e0e0e0")
      .attr("pointer-events", "none");

    // Drag behaviour
    const drag = d3
      .drag<SVGGElement, SimNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    nodeSel.call(drag);

    // Tick
    simulation.on("tick", () => {
      linkSel
        .attr("x1", (d) => (d.source as SimNode).x!)
        .attr("y1", (d) => (d.source as SimNode).y!)
        .attr("x2", (d) => (d.target as SimNode).x!)
        .attr("y2", (d) => (d.target as SimNode).y!);

      nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [simNodes, simLinks, handleNodeClick]);

  // Selection emphasis (update styles without restarting simulation)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const sel = d3.select(svg);

    // Update node circles
    sel.selectAll<SVGGElement, SimNode>("g.nodes g").each(function (d) {
      const g = d3.select(this);
      const circle = g.select("circle");
      const text = g.select("text");

      if (!selectedNodeId) {
        // No selection: all fully visible
        circle.attr("stroke", "none").attr("stroke-width", 0).attr("opacity", 1);
        text.attr("opacity", 1);
        return;
      }

      if (d.id === selectedNodeId) {
        // Selected: highlight ring
        circle
          .attr("stroke", "#fff")
          .attr("stroke-width", 3)
          .attr("opacity", 1);
        text.attr("opacity", 1);
      } else if (connectedIds.has(d.id)) {
        // Connected: secondary emphasis
        circle
          .attr("stroke", "#888")
          .attr("stroke-width", 1.5)
          .attr("opacity", 0.9);
        text.attr("opacity", 0.9);
      } else {
        // Unrelated: fade
        circle.attr("stroke", "none").attr("stroke-width", 0).attr("opacity", 0.2);
        text.attr("opacity", 0.2);
      }
    });

    // Update links
    sel.selectAll<SVGLineElement, SimLink>("g.links line").each(function (d) {
      const line = d3.select(this);
      if (!selectedNodeId) {
        line.attr("stroke-opacity", 0.6);
        return;
      }
      const srcId = typeof d.source === "string" ? d.source : (d.source as SimNode).id;
      const tgtId = typeof d.target === "string" ? d.target : (d.target as SimNode).id;
      if (srcId === selectedNodeId || tgtId === selectedNodeId) {
        line.attr("stroke-opacity", 0.9);
      } else {
        line.attr("stroke-opacity", 0.1);
      }
    });
  }, [selectedNodeId, connectedIds]);

  // Legend entries
  const relationFamilies = Object.entries(MASS_RELATION_COLORS);

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={{ color: "#e0e0e0", fontWeight: 600, marginRight: 12 }}>
          SpatialMassGraph
        </span>
        <span>
          {massNodes.length} nodes &middot; {massRelations.length} relations
        </span>
      </div>

      {/* SVG container */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <svg
          ref={svgRef}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </div>

      {/* Legend */}
      <div
        style={{
          padding: "6px 12px",
          borderTop: "1px solid #1a1a2e",
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          fontSize: 9,
          color: "#888",
        }}
      >
        {relationFamilies.map(([family, color]) => (
          <span key={family} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                display: "inline-block",
                width: 14,
                height: 3,
                background: color,
                borderRadius: 1,
              }}
            />
            {family}
          </span>
        ))}
      </div>
    </div>
  );
}
