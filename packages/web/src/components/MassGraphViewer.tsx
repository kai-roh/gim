"use client";

import React, { useRef, useEffect, useCallback } from "react";
import * as d3 from "d3";
import { useGraph } from "@/lib/graph-context";
import {
  MASS_TYPE_COLORS,
  MASS_RELATION_COLORS,
  ZONE_COLORS,
  floorLabel,
} from "@/lib/graph-colors";
import type { MassNode, MassRelation } from "@gim/core";

// ============================================================
// Scale category → node radius
// ============================================================

const SCALE_RADIUS: Record<string, number> = {
  small: 18,
  medium: 28,
  large: 40,
  extra_large: 52,
};

// ============================================================
// Component
// ============================================================

export function MassGraphViewer() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = useGraph();
  const { massGraph, selectedNodeId, activeEdgeTypes } = state;

  const renderGraph = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !massGraph) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const W = containerRef.current.clientWidth;
    const H = containerRef.current.clientHeight;
    const margin = 60;

    const g = svg.append("g");

    const nodes = massGraph.nodes;
    const relations = massGraph.relations;

    // Filter relations by active edge types (family-based)
    const filteredRelations = relations.filter((r) => activeEdgeTypes.has(r.family));

    // ---- Layout: custom force with stack vertical alignment ----
    interface SimNode extends d3.SimulationNodeDatum {
      node: MassNode;
      r: number;
    }

    interface SimLink extends d3.SimulationLinkDatum<SimNode> {
      relation: MassRelation;
    }

    const simNodes: SimNode[] = nodes.map((n) => ({
      node: n,
      r: SCALE_RADIUS[n.geometry.scale.category] || 28,
      x: W / 2 + (Math.random() - 0.5) * 100,
      y: H - margin - ((n.floor_range[0] + n.floor_range[1]) / 2) * ((H - 2 * margin) / (massGraph.metadata.floor_range[1] - massGraph.metadata.floor_range[0] + 1)),
    }));

    const nodeMap = new Map(simNodes.map((sn) => [sn.node.id, sn]));

    const simLinks: SimLink[] = filteredRelations
      .map((rel) => {
        const source = nodeMap.get(rel.source);
        const target = nodeMap.get(rel.target);
        if (!source || !target) return null;
        return { source, target, relation: rel } as SimLink;
      })
      .filter((l): l is SimLink => l !== null);

    // Force simulation
    const simulation = d3.forceSimulation(simNodes)
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide<SimNode>().radius((d) => d.r + 8))
      .force("link", d3.forceLink<SimNode, SimLink>(simLinks).distance(80).strength(0.3))
      // Custom vertical force: stack relations push nodes into vertical alignment
      .force("stackY", () => {
        for (const link of simLinks) {
          if (link.relation.family === "stack") {
            const src = link.source as SimNode;
            const tgt = link.target as SimNode;
            // source should be above target (lower y = higher)
            if (link.relation.rule === "above" || link.relation.rule === "floating") {
              if (src.y! >= tgt.y!) {
                const mid = (src.y! + tgt.y!) / 2;
                src.y = mid - 30;
                tgt.y = mid + 30;
              }
              // X alignment
              const dx = tgt.x! - src.x!;
              src.x! += dx * 0.05;
              tgt.x! -= dx * 0.05;
            }
          }
        }
      })
      .stop();

    // Run simulation
    for (let i = 0; i < 200; i++) simulation.tick();

    // Clamp positions to viewbox
    for (const sn of simNodes) {
      sn.x = Math.max(margin + sn.r, Math.min(W - margin - sn.r, sn.x!));
      sn.y = Math.max(margin + sn.r, Math.min(H - margin - sn.r, sn.y!));
    }

    // ---- Draw relations ----
    const linkGroup = g.append("g");
    linkGroup
      .selectAll("line")
      .data(simLinks)
      .enter()
      .append("line")
      .attr("x1", (d) => (d.source as SimNode).x!)
      .attr("y1", (d) => (d.source as SimNode).y!)
      .attr("x2", (d) => (d.target as SimNode).x!)
      .attr("y2", (d) => (d.target as SimNode).y!)
      .attr("stroke", (d) => MASS_RELATION_COLORS[d.relation.family] || "#444")
      .attr("stroke-width", (d) => d.relation.strength === "hard" ? 2.5 : 1)
      .attr("stroke-dasharray", (d) => d.relation.strength === "soft" ? "4,3" : "none")
      .attr("opacity", (d) => {
        if (!selectedNodeId) return 0.5;
        const src = (d.source as SimNode).node.id;
        const tgt = (d.target as SimNode).node.id;
        return src === selectedNodeId || tgt === selectedNodeId ? 0.9 : 0.1;
      });

    // Relation labels on links
    linkGroup
      .selectAll("text")
      .data(simLinks)
      .enter()
      .append("text")
      .attr("x", (d) => ((d.source as SimNode).x! + (d.target as SimNode).x!) / 2)
      .attr("y", (d) => ((d.source as SimNode).y! + (d.target as SimNode).y!) / 2 - 4)
      .attr("text-anchor", "middle")
      .attr("fill", (d) => MASS_RELATION_COLORS[d.relation.family] || "#666")
      .attr("font-size", 8)
      .attr("opacity", 0.6)
      .text((d) => `${d.relation.family}.${d.relation.rule}`);

    // ---- Draw nodes ----
    const nodeGroup = g.append("g");
    const nodeEls = nodeGroup
      .selectAll("g")
      .data(simNodes)
      .enter()
      .append("g")
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .style("cursor", "pointer")
      .on("click", (_, d) => {
        dispatch({ type: "SELECT_NODE", nodeId: d.node.id });
      });

    // Node shape based on primitive
    nodeEls.each(function (d) {
      const el = d3.select(this);
      const r = d.r;
      const color = MASS_TYPE_COLORS[d.node.type] || "#555";
      const isSelected = d.node.id === selectedNodeId;

      if (d.node.geometry.primitive === "tower") {
        // Tall rectangle
        el.append("rect")
          .attr("x", -r * 0.4).attr("y", -r * 0.8)
          .attr("width", r * 0.8).attr("height", r * 1.6)
          .attr("rx", 3)
          .attr("fill", color).attr("opacity", 0.85)
          .attr("stroke", isSelected ? "#fff" : "none")
          .attr("stroke-width", 2);
      } else if (d.node.geometry.primitive === "plate") {
        // Wide rectangle
        el.append("rect")
          .attr("x", -r * 0.8).attr("y", -r * 0.35)
          .attr("width", r * 1.6).attr("height", r * 0.7)
          .attr("rx", 3)
          .attr("fill", color).attr("opacity", 0.85)
          .attr("stroke", isSelected ? "#fff" : "none")
          .attr("stroke-width", 2);
      } else if (d.node.geometry.primitive === "bar") {
        // Long narrow rectangle
        el.append("rect")
          .attr("x", -r * 0.9).attr("y", -r * 0.25)
          .attr("width", r * 1.8).attr("height", r * 0.5)
          .attr("rx", 2)
          .attr("fill", color).attr("opacity", 0.85)
          .attr("stroke", isSelected ? "#fff" : "none")
          .attr("stroke-width", 2);
      } else if (d.node.type === "void") {
        // Dashed circle
        el.append("circle")
          .attr("r", r * 0.7)
          .attr("fill", "none")
          .attr("stroke", color)
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", "5,3")
          .attr("opacity", 0.8);
      } else {
        // Default: circle
        el.append("circle")
          .attr("r", r * 0.7)
          .attr("fill", color).attr("opacity", 0.85)
          .attr("stroke", isSelected ? "#fff" : "none")
          .attr("stroke-width", 2);
      }

      // Label
      el.append("text")
        .attr("y", r + 14)
        .attr("text-anchor", "middle")
        .attr("fill", "#ccc")
        .attr("font-size", 10)
        .attr("font-weight", isSelected ? "bold" : "normal")
        .text(d.node.label);

      // Floor range badge
      el.append("text")
        .attr("y", -r - 4)
        .attr("text-anchor", "middle")
        .attr("fill", ZONE_COLORS[d.node.floor_zone] || "#666")
        .attr("font-size", 8)
        .text(`${floorLabel(d.node.floor_range[0])}~${floorLabel(d.node.floor_range[1])}`);
    });

    // ---- Zoom ----
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 4])
        .on("zoom", (ev) => {
          g.attr("transform", ev.transform.toString());
        })
    );
  }, [massGraph, selectedNodeId, activeEdgeTypes, dispatch]);

  useEffect(() => { renderGraph(); }, [renderGraph]);
  useEffect(() => {
    const onResize = () => renderGraph();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [renderGraph]);

  // Relation family filter buttons
  const families = massGraph
    ? [...new Set(massGraph.relations.map((r) => r.family))]
    : [];

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <div style={filterStyle}>
        {families.map((fam) => {
          const active = activeEdgeTypes.has(fam);
          return (
            <button
              key={fam}
              onClick={() => dispatch({ type: "TOGGLE_EDGE_TYPE", edgeType: fam })}
              style={{
                ...btnStyle,
                background: active ? "#2a2a4e" : "#1a1a2e",
                color: active ? "#aaf" : "#888",
                borderColor: active ? MASS_RELATION_COLORS[fam] || "#55a" : "#333",
              }}
            >
              {fam}
            </button>
          );
        })}
      </div>
      <svg ref={svgRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

const filterStyle: React.CSSProperties = {
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

const btnStyle: React.CSSProperties = {
  border: "1px solid #333",
  fontSize: 9,
  padding: "2px 8px",
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "inherit",
  transition: "all 0.15s",
};
