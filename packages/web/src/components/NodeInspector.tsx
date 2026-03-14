"use client";

import React from "react";
import { useGraph } from "@/lib/graph-context";
import { FUNC_COLORS, EDGE_COLORS, floorLabel } from "@/lib/graph-colors";

export function NodeInspector() {
  const { state, selectedNode, floorNodes, dispatch } = useGraph();
  const { graph } = state;

  if (!graph) return null;

  return (
    <>
      <div style={titleStyle}>Node Inspector</div>
      <div style={contentStyle}>
        {selectedNode ? (
          <NodeDetail node={selectedNode} graph={graph} dispatch={dispatch} />
        ) : floorNodes.length > 0 ? (
          <FloorDetail
            floor={state.selectedFloor!}
            nodes={floorNodes}
            dispatch={dispatch}
          />
        ) : (
          <span style={{ color: "#444" }}>Click a node to inspect</span>
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
}: {
  floor: number;
  nodes: any[];
  dispatch: any;
}) {
  return (
    <>
      <Section title={`Floor ${floorLabel(floor)}`}>
        <Row k="Zone" v={nodes[0]?.floor_zone || "?"} />
        <Row k="Nodes" v={String(nodes.length)} />
      </Section>
      <Section title="Functions">
        {nodes.map((n) => (
          <div
            key={n.id}
            style={{
              cursor: "pointer",
              color: FUNC_COLORS[n.function] || "#888",
              padding: "2px 0",
            }}
            onClick={() => dispatch({ type: "SELECT_NODE", nodeId: n.id })}
          >
            {n.function.replace(/_/g, " ")}
          </div>
        ))}
      </Section>
    </>
  );
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
