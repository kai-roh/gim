"use client";

import React from "react";
import { useGraph } from "@/lib/graph-context";
import { KIND_COLORS, RELATION_COLORS } from "@/lib/graph-colors";

export function NodeInspector() {
  const { state, selectedNode, dispatch, variantHistory, activeVariantId } = useGraph();
  const { graph } = state;

  if (!graph) return null;

  const activeVariant = variantHistory.find((variant) => variant.id === activeVariantId) ?? null;

  if (!selectedNode) {
    return (
      <div style={containerStyle}>
        <div style={titleStyle}>Mass Inspector</div>
        <div style={contentStyle}>
          {activeVariant && (
            <Section title="Resolved Variant">
              <Row k="Current" v={activeVariant.label} />
              <Row k="Seed" v={String(activeVariant.seed)} />
              <Row k="Generated" v={activeVariant.generatedAt.replace("T", " ").slice(0, 16)} />
            </Section>
          )}
          <Section title="Project">
            <p style={paragraphStyle}>{graph.narrative.project_intro}</p>
          </Section>
          <Section title="Concept">
            <p style={paragraphStyle}>{graph.narrative.overall_architectural_concept}</p>
          </Section>
          <Section title="Image Direction">
            <p style={paragraphStyle}>{graph.narrative.image_direction}</p>
          </Section>
          <Section title="Synthesis">
            <p style={paragraphStyle}>{graph.narrative.massing_strategy_summary}</p>
            <p style={paragraphStyle}>{graph.narrative.public_to_private_sequence}</p>
            <p style={paragraphStyle}>{graph.narrative.facade_and_material_summary}</p>
          </Section>
          {graph.narrative.node_summaries.length > 0 && (
            <Section title="Key Masses">
              {graph.narrative.node_summaries.slice(0, 5).map((summary) => {
                const node = graph.nodes.find((item) => item.id === summary.node_id);
                return (
                  <button
                    key={summary.node_id}
                    onClick={() => dispatch({ type: "SELECT_NODE", nodeId: summary.node_id })}
                    style={summaryCardStyle}
                  >
                    <div style={{ color: "#dce7ff", fontSize: 11 }}>
                      {node?.name ?? summary.node_id}
                    </div>
                    <div style={{ color: "#9fb0c6", fontSize: 10, lineHeight: 1.6 }}>
                      {summary.summary}
                    </div>
                    <div style={{ color: "#6d7787", fontSize: 10 }}>
                      {summary.relationship_summary}
                    </div>
                  </button>
                );
              })}
            </Section>
          )}
          {graph.provenance.architect_contributions.length > 0 && (
            <Section title="Contributors">
              {graph.provenance.architect_contributions.map((contribution) => (
                <div key={contribution.architect_id} style={influenceRowStyle}>
                  <div style={{ color: "#d6dce8" }}>{contribution.architect_id}</div>
                  <div style={{ color: "#7b8aa3", fontSize: 10 }}>{contribution.emphasis}</div>
                </div>
              ))}
            </Section>
          )}
        </div>
      </div>
    );
  }

  const resolvedNode =
    graph.resolved_model.nodes.find((node) => node.node_id === selectedNode.id) ?? null;
  const relations = graph.relations.filter(
    (relation) => relation.source === selectedNode.id || relation.target === selectedNode.id
  );

  return (
    <div style={containerStyle}>
      <div style={titleStyle}>Mass Inspector</div>
      <div style={contentStyle}>
        <Section title={selectedNode.name}>
          <Row k="ID" v={selectedNode.id} />
          <Row k="Kind" v={selectedNode.kind} color={KIND_COLORS[selectedNode.kind]} />
          <Row k="Hierarchy" v={selectedNode.hierarchy} />
          <Row k="Role" v={selectedNode.spatial_role} />
          <Row k="Anchor" v={selectedNode.relative_position.anchor_to || "-"} />
        </Section>

        <Section title="Geometry">
          <Row k="Primitive" v={selectedNode.geometry.primitive} />
          <Row k="Width" v={selectedNode.geometry.width} />
          <Row k="Depth" v={selectedNode.geometry.depth} />
          <Row k="Height" v={selectedNode.geometry.height} />
          <Row k="Placement" v={selectedNode.geometry.vertical_placement} />
          <Row k="Skin" v={selectedNode.geometry.skin} />
          <Row k="Porosity" v={selectedNode.geometry.porosity} />
        </Section>

        {resolvedNode && (
          <Section title="Resolved Variant">
            <Row k="Variant" v={activeVariant?.label ?? "-"} />
            <Row k="Width" v={`${resolvedNode.dimensions.width}m`} />
            <Row k="Depth" v={`${resolvedNode.dimensions.depth}m`} />
            <Row k="Height" v={`${resolvedNode.dimensions.height}m`} />
            <Row k="X" v={`${resolvedNode.transform.x}m`} />
            <Row k="Y" v={`${resolvedNode.transform.y}m`} />
            <Row k="Z" v={`${resolvedNode.transform.z}m`} />
          </Section>
        )}

        <Section title="Narrative">
          <p style={paragraphStyle}>{selectedNode.narrative.intent}</p>
          <p style={paragraphStyle}>{selectedNode.narrative.spatial_character}</p>
          <p style={paragraphStyle}>{selectedNode.narrative.facade_material_light}</p>
          <p style={paragraphStyle}>{selectedNode.narrative.image_prompt_notes}</p>
        </Section>

        {selectedNode.narrative.keywords.length > 0 && (
          <Section title="Keywords">
            <div style={tagWrapStyle}>
              {selectedNode.narrative.keywords.map((keyword) => (
                <span key={keyword} style={tagStyle}>
                  {keyword}
                </span>
              ))}
            </div>
          </Section>
        )}

        {selectedNode.architect_influences.length > 0 && (
          <Section title="Architect Influence">
            {selectedNode.architect_influences.map((influence) => (
              <div key={influence.architect_id} style={influenceRowStyle}>
                <div style={{ color: "#d6dce8" }}>
                  {influence.architect_id} ({Math.round(influence.weight * 100)}%)
                </div>
                <div style={{ color: "#7b8aa3", fontSize: 10 }}>{influence.contribution}</div>
              </div>
            ))}
          </Section>
        )}

        {relations.length > 0 && (
          <Section title={`Relations (${relations.length})`}>
            {relations.map((relation) => {
              const otherId = relation.source === selectedNode.id ? relation.target : relation.source;
              return (
                <button
                  key={relation.id}
                  onClick={() => dispatch({ type: "SELECT_NODE", nodeId: otherId })}
                  style={relationButtonStyle}
                >
                  <span style={{ color: RELATION_COLORS[relation.family] || "#9fb0c6" }}>
                    {relation.family}/{relation.rule}
                  </span>
                  <span style={{ color: "#d6dce8" }}>{otherId}</span>
                </button>
              );
            })}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h4 style={sectionTitleStyle}>{title}</h4>
      {children}
    </div>
  );
}

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div style={rowStyle}>
      <span style={{ color: "#596273" }}>{k}</span>
      <span style={{ color: color || "#d6dce8" }}>{v}</span>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
};

const titleStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid #1a1a2e",
  fontSize: 12,
  color: "#8d98a7",
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "10px 16px 30px",
  fontSize: 11,
  lineHeight: 1.7,
};

const sectionTitleStyle: React.CSSProperties = {
  color: "#667085",
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 4,
  fontWeight: "normal",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "2px 0",
};

const paragraphStyle: React.CSSProperties = {
  color: "#d6dce8",
  margin: 0,
  marginBottom: 6,
};

const tagWrapStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const tagStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#d6dce8",
  background: "#171c28",
  borderRadius: 999,
  padding: "2px 8px",
};

const influenceRowStyle: React.CSSProperties = {
  marginBottom: 8,
};

const summaryCardStyle: React.CSSProperties = {
  width: "100%",
  background: "#111520",
  border: "1px solid #232938",
  borderRadius: 8,
  padding: "10px 12px",
  textAlign: "left",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  cursor: "pointer",
  marginBottom: 8,
  fontFamily: "inherit",
};

const relationButtonStyle: React.CSSProperties = {
  width: "100%",
  background: "#111520",
  border: "1px solid #232938",
  borderRadius: 8,
  padding: "8px 10px",
  display: "flex",
  justifyContent: "space-between",
  cursor: "pointer",
  textAlign: "left",
  marginBottom: 6,
  fontFamily: "inherit",
};
