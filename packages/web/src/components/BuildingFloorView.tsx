"use client";

import React, { useMemo } from "react";
import type { SpatialMassGraph } from "@gim/core";
import { useGraph } from "@/lib/graph-context";
import { useForum } from "@/lib/forum-context";
import { HIERARCHY_COLORS, KIND_COLORS, RELATION_COLORS, massColor } from "@/lib/graph-colors";
import { BUTTON_RADIUS } from "@/lib/ui";

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function BuildingFloorView() {
  const { state, dispatch } = useGraph();
  const { state: forumState } = useForum();
  const { graph, selectedNodeId, activeRelationFamilies } = state;

  const connectedIds = useMemo(() => {
    if (!graph || !selectedNodeId) return new Set<string>();
    const ids = new Set<string>();
    for (const relation of graph.relations) {
      if (!activeRelationFamilies.has(relation.family)) continue;
      if (relation.source === selectedNodeId) ids.add(relation.target);
      if (relation.target === selectedNodeId) ids.add(relation.source);
    }
    return ids;
  }, [graph, selectedNodeId, activeRelationFamilies]);

  const hierarchyGroups = useMemo(() => {
    if (!graph) return [];
    const order = ["primary", "secondary", "tertiary"];
    return order.map((hierarchy) => ({
      hierarchy,
      nodes: graph.nodes.filter((node) => node.hierarchy === hierarchy),
    }));
  }, [graph]);

  const relationFamilies = useMemo(() => {
    if (!graph) return [];
    return Array.from(new Set(graph.relations.map((relation) => relation.family)));
  }, [graph]);

  if (!graph) return null;

  const triggerJsonDownload = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const withDisplayColorsInGraph = (currentGraph: SpatialMassGraph) => ({
    ...currentGraph,
    nodes: currentGraph.nodes.map((node) => ({
      ...node,
      properties: {
        ...node.properties,
        display_color: massColor(node.id),
        display_color_hex: massColor(node.id),
      },
    })),
  });

  const withDisplayColorsInForumResult = (result: any) => ({
    ...result,
    rounds: Array.isArray(result?.rounds)
      ? result.rounds.map((round: any) => ({
          ...round,
          responses: Array.isArray(round?.responses)
            ? round.responses.map((response: any) => ({
                ...response,
                proposal: {
                  ...response.proposal,
                  mass_entities: Array.isArray(response?.proposal?.mass_entities)
                    ? response.proposal.mass_entities.map((node: any) => ({
                        ...node,
                        properties: {
                          ...(node.properties ?? {}),
                          display_color: massColor(node.id),
                          display_color_hex: massColor(node.id),
                        },
                      }))
                    : response?.proposal?.mass_entities,
                },
              }))
            : round?.responses,
        }))
      : result?.rounds,
  });

  const handleDownloadGraph = () => {
    const createdAt = graph.metadata.created_at
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .replace("Z", "");
    triggerJsonDownload(
      withDisplayColorsInGraph(graph),
      `spatial_mass_graph_${createdAt}.json`
    );
  };

  const handleDownloadForumResult = async () => {
    if (!forumState.sessionId) return;

    try {
      const response = await fetch(`/api/forum/${forumState.sessionId}/result`);
      const data = await response.json();
      if (!response.ok || !data?.session) return;

      const createdAt = graph.metadata.created_at
        .replace(/[:.]/g, "-")
        .replace("T", "_")
        .replace("Z", "");
      triggerJsonDownload(
        withDisplayColorsInForumResult(data.session),
        `forum_result_${createdAt}.json`
      );
    } catch {
      return;
    }
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h2 style={{ fontSize: 14, color: "#fff", margin: 0 }}>{graph.project.site.location}</h2>
        <div style={metaStyle}>
          <span>{graph.nodes.length} masses</span>
          <span style={sepStyle}>|</span>
          <span>{graph.relations.length} relations</span>
          <span style={sepStyle}>|</span>
          <span>{graph.resolved_model.variant_label}</span>
          <span style={sepStyle}>|</span>
          <span>updated {formatTimestamp(graph.metadata.created_at)}</span>
        </div>
        <div style={{ color: "#7b8aa3", fontSize: 11, lineHeight: 1.5 }}>
          {graph.narrative.massing_strategy_summary}
        </div>
        <div style={downloadRowStyle}>
          <button type="button" onClick={handleDownloadGraph} style={downloadButtonStyle}>
            Download SpatialMassGraph
          </button>
          <button
            type="button"
            onClick={handleDownloadForumResult}
            style={downloadButtonStyle}
            disabled={!forumState.sessionId}
          >
            Download forum_result
          </button>
        </div>
      </div>

      <div style={filterBarStyle}>
        {relationFamilies.map((family) => {
          const active = activeRelationFamilies.has(family);
          return (
            <button
              key={family}
              onClick={() => dispatch({ type: "TOGGLE_RELATION_FAMILY", family })}
              style={{
                ...filterButtonStyle,
                color: active ? RELATION_COLORS[family] || "#fff" : "#596273",
                borderColor: active ? RELATION_COLORS[family] || "#39424e" : "#252a33",
              }}
            >
              {family}
            </button>
          );
        })}
      </div>

      <div style={scrollStyle}>
        {hierarchyGroups.map((group) => (
          <div key={group.hierarchy} style={groupStyle}>
            <div style={groupHeaderStyle}>
              <span
                style={{
                  color: HIERARCHY_COLORS[group.hierarchy] || "#fff",
                  fontSize: 10,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                {group.hierarchy}
              </span>
              <span style={{ color: "#4c5564", fontSize: 10 }}>{group.nodes.length}</span>
            </div>
            <div style={cardGridStyle}>
              {group.nodes.map((node) => {
                const selected = node.id === selectedNodeId;
                const connected = connectedIds.has(node.id);
                const muted = selectedNodeId && !selected && !connected;
                return (
                  <button
                    key={node.id}
                    onClick={() => dispatch({ type: "SELECT_NODE", nodeId: node.id })}
                    style={{
                      ...cardStyle,
                      opacity: muted ? 0.35 : 1,
                      borderColor: selected ? "#dce7ff" : "#242936",
                      boxShadow: selected ? "0 0 0 1px rgba(220,231,255,0.35)" : undefined,
                    }}
                  >
                    <div style={cardTopStyle}>
                        <span
                          style={{
                            ...kindDotStyle,
                            background: massColor(node.id),
                          }}
                        />
                      <span style={{ color: "#d7e0ee", fontSize: 11 }}>{node.name}</span>
                    </div>
                    <div style={{ color: "#7b8aa3", fontSize: 10 }}>{node.spatial_role}</div>
                    <div style={chipRowStyle}>
                      <span style={{ ...chipStyle, color: KIND_COLORS[node.kind] || "#7b8aa3" }}>
                        {node.kind}
                      </span>
                      <span style={chipStyle}>{node.geometry.primitive}</span>
                      <span style={chipStyle}>{node.geometry.vertical_placement}</span>
                    </div>
                    <div style={{ color: "#9fb0c6", fontSize: 10, lineHeight: 1.5 }}>
                      {node.narrative.intent}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "#0d0d15",
};

const headerStyle: React.CSSProperties = {
  padding: "14px 16px 12px",
  borderBottom: "1px solid #1a1a2e",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const metaStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  color: "#58616e",
  fontSize: 10,
};

const downloadRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 4,
};

const downloadButtonStyle: React.CSSProperties = {
  border: "1px solid #2b3d59",
  background: "#111520",
  color: "#dce7ff",
  borderRadius: BUTTON_RADIUS,
  padding: "7px 10px",
  fontSize: 10,
  fontFamily: "inherit",
  cursor: "pointer",
};

const sepStyle: React.CSSProperties = { color: "#313744" };

const filterBarStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderBottom: "1px solid #1a1a2e",
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const filterButtonStyle: React.CSSProperties = {
  border: "1px solid #252a33",
  background: "transparent",
  borderRadius: BUTTON_RADIUS,
  padding: "4px 8px",
  fontSize: 10,
  cursor: "pointer",
  fontFamily: "inherit",
};

const scrollStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "14px 16px 18px",
};

const groupStyle: React.CSSProperties = {
  marginBottom: 18,
};

const groupHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
};

const cardGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 8,
};

const cardStyle: React.CSSProperties = {
  background: "#111520",
  border: "1px solid #242936",
  borderRadius: BUTTON_RADIUS,
  padding: 12,
  textAlign: "left",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  cursor: "pointer",
  fontFamily: "inherit",
};

const cardTopStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const kindDotStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: "50%",
  flexShrink: 0,
};

const chipRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const chipStyle: React.CSSProperties = {
  color: "#6d7787",
  fontSize: 9,
  padding: "2px 6px",
  borderRadius: 999,
  background: "#171c28",
};
