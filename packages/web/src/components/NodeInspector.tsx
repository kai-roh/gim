"use client";

import React, { useRef, useEffect } from "react";
import { useGraph } from "@/lib/graph-context";
import { FUNC_COLORS, EDGE_COLORS, floorLabel } from "@/lib/graph-colors";
import {
  generateFloorOutline,
  getDominantFormDNA,
  getFloorFormDNA,
} from "@/lib/architect-form";

export function NodeInspector() {
  const { state, selectedNode, floorNodes, dispatch } = useGraph();
  const { graph } = state;

  if (!graph) return null;

  const showFloorPlan = state.selectedFloor !== null && floorNodes.length > 0;

  return (
    <>
      <div style={titleStyle}>Node Inspector</div>
      <div style={contentStyle}>
        {/* Floor plan always visible when a floor is selected */}
        {showFloorPlan && (
          <FloorDetail
            floor={state.selectedFloor!}
            nodes={floorNodes}
            dispatch={dispatch}
            selectedNodeId={state.selectedNodeId}
          />
        )}

        {/* Node detail below the floor plan when a node is selected */}
        {selectedNode && (
          <NodeDetail node={selectedNode} graph={graph} dispatch={dispatch} />
        )}

        {!showFloorPlan && !selectedNode && (
          <span style={{ color: "#444" }}>Select a floor to inspect</span>
        )}
      </div>
      <StatsPanel graph={graph} />
    </>
  );
}

function NodeDetail({
  node,
  graph,
  dispatch,
}: {
  node: any;
  graph: any;
  dispatch: any;
}) {
  const neighbors: { node: any; edge: any }[] = [];
  for (const e of graph.edges) {
    if (e.source === node.id) {
      const t = graph.nodes.find((n: any) => n.id === e.target);
      if (t) neighbors.push({ node: t, edge: e });
    }
    if (e.target === node.id) {
      const s = graph.nodes.find((n: any) => n.id === e.source);
      if (s) neighbors.push({ node: s, edge: e });
    }
  }

  const byType: Record<string, typeof neighbors> = {};
  for (const n of neighbors) {
    if (!byType[n.edge.type]) byType[n.edge.type] = [];
    byType[n.edge.type].push(n);
  }

  return (
    <>
      <Section title={node.name}>
        <Row k="ID" v={node.id} />
        <Row k="Floor" v={floorLabel(node.floor_level)} />
        <Row k="Zone" v={node.floor_zone} />
        <Row k="Function" v={node.function.replace(/_/g, " ")} />
        <Row k="Position" v={node.position} />
      </Section>

      <Section title="Abstract Properties">
        {Object.entries(node.abstract).map(([key, val]) => {
          const pct = Math.round((val as number) * 100);
          const color = pct > 70 ? "#8f8" : pct > 40 ? "#ff8" : "#f88";
          return (
            <div key={key}>
              <Row k={key.replace(/_/g, " ")} v={pct + "%"} />
              <div style={barWrapStyle}>
                <div
                  style={{ ...barFillStyle, width: pct + "%", background: color }}
                />
              </div>
            </div>
          );
        })}
      </Section>

      {node.tags?.length > 0 && (
        <Section title="Tags">
          <span style={{ color: "#ccc" }}>{node.tags.join(", ")}</span>
        </Section>
      )}

      {neighbors.length > 0 && (
        <Section title={`Connections (${neighbors.length})`}>
          {Object.entries(byType).map(([type, items]) => (
            <div key={type}>
              <div
                style={{
                  color: EDGE_COLORS[type] || "#888",
                  marginTop: 4,
                  fontSize: 9,
                }}
              >
                {type} ({items.length})
              </div>
              {items.slice(0, 4).map((item) => (
                <div
                  key={item.node.id + item.edge.type}
                  style={{
                    color: "#555",
                    cursor: "pointer",
                    paddingLeft: 6,
                    fontSize: 10,
                  }}
                  onClick={() =>
                    dispatch({ type: "SELECT_NODE", nodeId: item.node.id })
                  }
                >
                  {item.node.id}
                </div>
              ))}
              {items.length > 4 && (
                <div style={{ color: "#333", paddingLeft: 6 }}>
                  +{items.length - 4} more
                </div>
              )}
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

function FloorDetail({
  floor,
  nodes,
  dispatch,
  selectedNodeId,
}: {
  floor: number;
  nodes: any[];
  dispatch: any;
  selectedNodeId: string | null;
}) {
  const { state } = useGraph();
  const graph = state.graph;

  // Compute floor stats
  const zone = nodes[0]?.floor_zone || "?";
  const ceilingH = nodes[0]?.ceiling_height || 3.8;
  const styleRef = nodes.find((n: any) => n.style_ref && n.style_ref !== "none")?.style_ref;

  // Group by function
  const funcGroups: Record<string, any[]> = {};
  for (const n of nodes) {
    const fn = n.function;
    if (!funcGroups[fn]) funcGroups[fn] = [];
    funcGroups[fn].push(n);
  }

  // Count connections to other floors
  const interFloorEdges = graph
    ? graph.edges.filter((e: any) => {
        const src = graph.nodes.find((n: any) => n.id === e.source);
        const tgt = graph.nodes.find((n: any) => n.id === e.target);
        return src && tgt && (src.floor_level === floor || tgt.floor_level === floor)
          && src.floor_level !== tgt.floor_level;
      }).length
    : 0;

  return (
    <>
      <Section title={`${floorLabel(floor)} — Section`}>
        <FloorPlanCanvas floor={floor} nodes={nodes} graph={graph} dispatch={dispatch} selectedNodeId={selectedNodeId} />
      </Section>

      <Section title="Floor Info">
        <Row k="Zone" v={zone} />
        <Row k="Ceiling" v={`${ceilingH}m`} />
        <Row k="Nodes" v={String(nodes.length)} />
        <Row k="Inter-floor" v={`${interFloorEdges} edges`} />
        {styleRef && <Row k="Style" v={styleRef.replace(/_/g, " ")} />}
      </Section>

      <Section title="Program">
        {Object.entries(funcGroups).map(([fn, fnNodes]) => (
          <div
            key={fn}
            style={programRowStyle}
            onClick={() => dispatch({ type: "SELECT_NODE", nodeId: fnNodes[0].id })}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 8, height: 8, borderRadius: 2,
                background: FUNC_COLORS[fn] || "#555",
                flexShrink: 0,
              }} />
              <span style={{ color: "#bbb", fontSize: 10 }}>
                {fn.replace(/_/g, " ")}
              </span>
            </div>
            <span style={{ color: "#666", fontSize: 9 }}>
              {fnNodes.length > 1 ? `×${fnNodes.length}` : fnNodes[0].position}
            </span>
          </div>
        ))}
      </Section>
    </>
  );
}

/**
 * Canvas-drawn floor plan showing the outline + node positions as a simple section diagram.
 */
function FloorPlanCanvas({
  floor,
  nodes,
  graph,
  dispatch,
  selectedNodeId,
}: {
  floor: number;
  nodes: any[];
  graph: any;
  dispatch: any;
  selectedNodeId: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graph) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = 248;
    const H = 200;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = "#0e0e16";
    ctx.fillRect(0, 0, W, H);

    // Compute outline
    const [siteW, siteD] = graph.global.site.dimensions;
    const bcr = graph.global.site.bcr / 100;
    const footprint = siteW * siteD * bcr;
    const baseW = Math.sqrt(footprint * (siteW / siteD));
    const baseD = footprint / baseW;

    const allStyles = graph.nodes.map((n: any) => n.style_ref);
    const dominantDNA = getDominantFormDNA(allStyles);
    const floorStyle = nodes.find((n: any) => n.style_ref && n.style_ref !== "none")?.style_ref;
    const floorDNA = getFloorFormDNA(floorStyle, dominantDNA);

    const aboveFloors = Array.from(new Set(graph.nodes.map((n: any) => n.floor_level)))
      .filter((f: any) => f >= 0).sort((a: any, b: any) => a - b) as number[];
    const aboveIdx = Math.max(0, aboveFloors.indexOf(floor));
    const totalAbove = aboveFloors.length;

    const groundScale = floor <= 1 ? floorDNA.groundExpansion : 1;
    const outline = generateFloorOutline(floorDNA, baseW * groundScale, baseD * groundScale, aboveIdx, totalAbove);

    // Compute bounds for scaling
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of outline) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const rangeX = maxX - minX || 1;
    const rangeZ = maxZ - minZ || 1;
    const pad = 28;
    const scale = Math.min((W - pad * 2) / rangeX, (H - pad * 2) / rangeZ);
    const cx = W / 2;
    const cy = H / 2;
    const ox = (minX + maxX) / 2;
    const oz = (minZ + maxZ) / 2;

    const toScreen = (x: number, z: number): [number, number] => [
      cx + (x - ox) * scale,
      cy + (z - oz) * scale,
    ];

    // Draw outline fill
    ctx.beginPath();
    const [sx, sy] = toScreen(outline[0][0], outline[0][1]);
    ctx.moveTo(sx, sy);
    for (let i = 1; i < outline.length; i++) {
      const [px, py] = toScreen(outline[i][0], outline[i][1]);
      ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "#161822";
    ctx.fill();
    ctx.strokeStyle = "#3a4058";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw core (center rectangle)
    const coreW = baseW * 0.12 * scale;
    const coreD = baseD * 0.12 * scale;
    ctx.fillStyle = "#252838";
    ctx.strokeStyle = "#4a5068";
    ctx.lineWidth = 1;
    ctx.fillRect(cx - coreW / 2, cy - coreD / 2, coreW, coreD);
    ctx.strokeRect(cx - coreW / 2, cy - coreD / 2, coreW, coreD);

    // Draw core label
    ctx.fillStyle = "#555";
    ctx.font = "8px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CORE", cx, cy);

    // Draw node positions as colored zones
    const fW = baseW * groundScale;
    const fD = baseD * groundScale;

    // Draw non-selected nodes first (dimmed if something is selected)
    for (const node of nodes) {
      const pos = nodePosition(node.position, fW, fD);
      const [nx, ny] = toScreen(pos.x, pos.z);
      const color = FUNC_COLORS[node.function] || "#555";
      const isCore = ["elevator_core", "stairwell", "elevator_lobby", "service_shaft"].includes(node.function);
      if (isCore) continue;

      const isSelected = node.id === selectedNodeId;
      const dimmed = selectedNodeId && !isSelected;

      // Zone bubble
      const r = isSelected ? 14 : 10;
      ctx.beginPath();
      ctx.arc(nx, ny, r, 0, Math.PI * 2);
      ctx.fillStyle = dimmed ? color + "10" : color + "30";
      ctx.fill();
      ctx.strokeStyle = dimmed ? color + "30" : color + "80";
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // Selected highlight ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(nx, ny, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Glow effect
        ctx.beginPath();
        ctx.arc(nx, ny, r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = color + "40";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Dot center
      ctx.beginPath();
      ctx.arc(nx, ny, isSelected ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = dimmed ? color + "50" : color;
      ctx.fill();

      // Label
      ctx.fillStyle = dimmed ? color + "40" : color;
      ctx.font = isSelected ? "bold 8px monospace" : "7px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const label = node.function.replace(/_/g, " ");
      ctx.fillText(label.length > 12 ? label.slice(0, 11) + "…" : label, nx, ny + r + 2);
    }

    // Draw intra-floor edges
    if (graph) {
      const floorNodeIds = new Set(nodes.map((n: any) => n.id));
      const intraEdges = graph.edges.filter((e: any) =>
        floorNodeIds.has(e.source) && floorNodeIds.has(e.target)
      );
      ctx.strokeStyle = "#3a4068";
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);
      for (const e of intraEdges) {
        const srcNode = nodes.find((n: any) => n.id === e.source);
        const tgtNode = nodes.find((n: any) => n.id === e.target);
        if (!srcNode || !tgtNode) continue;
        const srcPos = nodePosition(srcNode.position, fW, fD);
        const tgtPos = nodePosition(tgtNode.position, fW, fD);
        const [x1, y1] = toScreen(srcPos.x, srcPos.z);
        const [x2, y2] = toScreen(tgtPos.x, tgtPos.z);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // North arrow
    ctx.fillStyle = "#4a6088";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("N", W - 16, 18);
    ctx.beginPath();
    ctx.moveTo(W - 16, 20);
    ctx.lineTo(W - 19, 26);
    ctx.lineTo(W - 13, 26);
    ctx.closePath();
    ctx.fill();

    // Floor label
    ctx.fillStyle = "#666";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(floorLabel(floor), 8, 8);

  }, [floor, nodes, graph, selectedNodeId]);

  return (
    <canvas
      ref={canvasRef}
      style={floorPlanCanvasStyle}
      onClick={(e) => {
        // Click-to-select node from the plan
        const canvas = canvasRef.current;
        if (!canvas || !graph) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const [siteW, siteD] = graph.global.site.dimensions;
        const bcr = graph.global.site.bcr / 100;
        const footprint = siteW * siteD * bcr;
        const baseW = Math.sqrt(footprint * (siteW / siteD));
        const baseD = footprint / baseW;
        const allStyles = graph.nodes.map((n: any) => n.style_ref);
        const dominantDNA = getDominantFormDNA(allStyles);
        const floorStyle = nodes.find((n: any) => n.style_ref && n.style_ref !== "none")?.style_ref;
        const floorDNA = getFloorFormDNA(floorStyle, dominantDNA);
        const groundScale = floor <= 1 ? floorDNA.groundExpansion : 1;
        const fW = baseW * groundScale;
        const fD = baseD * groundScale;

        const outline = generateFloorOutline(floorDNA, fW, fD, 0, 1);
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const [x, z] of outline) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }
        const rangeX = maxX - minX || 1;
        const rangeZ = maxZ - minZ || 1;
        const W = 248, H = 200, pad = 28;
        const scale = Math.min((W - pad * 2) / rangeX, (H - pad * 2) / rangeZ);
        const cx = W / 2, cy = H / 2;
        const ox = (minX + maxX) / 2, oz = (minZ + maxZ) / 2;

        let closest: any = null;
        let closestDist = 15;
        for (const node of nodes) {
          const pos = nodePosition(node.position, fW, fD);
          const sx = cx + (pos.x - ox) * scale;
          const sy = cy + (pos.z - oz) * scale;
          const d = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2);
          if (d < closestDist) {
            closestDist = d;
            closest = node;
          }
        }
        // Select node or deselect if clicking empty space
        dispatch({ type: "SELECT_NODE", nodeId: closest?.id ?? null });
      }}
    />
  );
}

function nodePosition(pos: string, floorW: number, floorD: number): { x: number; z: number } {
  const rx = floorW * 0.32;
  const rz = floorD * 0.32;
  switch (pos) {
    case "north":     return { x: 0,   z: rz };
    case "south":     return { x: 0,   z: -rz };
    case "east":      return { x: rx,  z: 0 };
    case "west":      return { x: -rx, z: 0 };
    case "northeast": return { x: rx * 0.7,  z: rz * 0.7 };
    case "northwest": return { x: -rx * 0.7, z: rz * 0.7 };
    case "southeast": return { x: rx * 0.7,  z: -rz * 0.7 };
    case "southwest": return { x: -rx * 0.7, z: -rz * 0.7 };
    default:          return { x: 0, z: 0 };
  }
}

function StatsPanel({ graph }: { graph: any }) {
  const zones = new Set(graph.nodes.map((n: any) => n.floor_zone));
  const data = [
    ["Nodes", graph.nodes.length],
    ["Edges", graph.edges.length],
    ["Zones", zones.size],
    ["Floor Range", graph.metadata.floor_range[0] + " ~ " + graph.metadata.floor_range[1]],
  ];

  return (
    <div style={statsPanelStyle}>
      {data.map(([label, val]) => (
        <div key={String(label)} style={statsRowStyle}>
          <span style={{ color: "#555", fontSize: 10 }}>{label}</span>
          <span style={{ color: "#8f8", fontWeight: "bold", fontSize: 10 }}>
            {String(val)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h4 style={sectionTitleStyle}>{title}</h4>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={rowStyle}>
      <span style={{ color: "#555" }}>{k}</span>
      <span style={{ color: "#ccc" }}>{v}</span>
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid #1a1a2e",
  fontSize: 12,
  color: "#888",
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "10px 16px",
  fontSize: 11,
  lineHeight: 1.7,
};

const sectionTitleStyle: React.CSSProperties = {
  color: "#666",
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 4,
  fontWeight: "normal",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "2px 0",
};

const barWrapStyle: React.CSSProperties = {
  height: 3,
  background: "#1a1a2e",
  borderRadius: 2,
  marginTop: 2,
};

const barFillStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: 2,
};

const statsPanelStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderTop: "1px solid #1a1a2e",
  fontSize: 10,
};

const statsRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "2px 0",
};

const programRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "3px 0",
  cursor: "pointer",
};

const floorPlanCanvasStyle: React.CSSProperties = {
  width: 248,
  height: 200,
  borderRadius: 4,
  border: "1px solid #1a1a2e",
  cursor: "crosshair",
};
