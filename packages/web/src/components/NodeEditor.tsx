"use client";

import React, { useCallback, useState } from "react";
import type {
  MassNode,
  MassNodeKind,
  MassPrimitive,
  NodeHierarchy,
  RelativePlacement,
  RelativeScale,
} from "@gim/core";
import { useGraph } from "@/lib/graph-context";
import { BUTTON_RADIUS } from "@/lib/ui";

const NODE_KINDS: MassNodeKind[] = ["solid", "void", "core", "connector"];
const HIERARCHIES: NodeHierarchy[] = ["primary", "secondary", "tertiary"];
const PRIMITIVES: MassPrimitive[] = [
  "block",
  "bar",
  "plate",
  "ring",
  "tower",
  "bridge",
  "cylinder",
];
const SCALE_VALUES: RelativeScale[] = ["xs", "small", "medium", "large", "xl"];
const PLACEMENTS: RelativePlacement[] = [
  "subgrade",
  "grounded",
  "low",
  "mid",
  "upper",
  "crown",
  "spanning",
];

export function NodeEditor() {
  const { state, selectedNode, editDispatch, undo, redo, canUndo, canRedo } = useGraph();
  const { graph, editMode } = state;

  if (!graph || !editMode) return null;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span>Edit Mode</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={undo} disabled={!canUndo} style={undoBtnStyle}>
            ↶
          </button>
          <button onClick={redo} disabled={!canRedo} style={undoBtnStyle}>
            ↷
          </button>
        </div>
      </div>

      {selectedNode ? (
        <NodeEditForm node={selectedNode} />
      ) : (
        <div style={{ padding: "12px 16px", color: "#596273", fontSize: 11 }}>
          Select a mass node to edit its metadata.
        </div>
      )}

      <AddNodeSection />
    </div>
  );
}

function NodeEditForm({ node }: { node: MassNode }) {
  const { editDispatch } = useGraph();

  const update = useCallback(
    (updates: Partial<MassNode>) => {
      editDispatch({ type: "UPDATE_NODE", nodeId: node.id, updates });
    },
    [editDispatch, node.id]
  );

  return (
    <div style={formStyle}>
      <Field label="Name">
        <input
          value={node.name}
          onChange={(event) => update({ name: event.target.value })}
          style={inputStyle}
        />
      </Field>

      <Field label="Kind">
        <select
          value={node.kind}
          onChange={(event) => update({ kind: event.target.value as MassNodeKind })}
          style={selectStyle}
        >
          {NODE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Hierarchy">
        <select
          value={node.hierarchy}
          onChange={(event) =>
            update({ hierarchy: event.target.value as NodeHierarchy })
          }
          style={selectStyle}
        >
          {HIERARCHIES.map((hierarchy) => (
            <option key={hierarchy} value={hierarchy}>
              {hierarchy}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Role">
        <input
          value={node.spatial_role}
          onChange={(event) => update({ spatial_role: event.target.value })}
          style={inputStyle}
        />
      </Field>

      <Field label="Primitive">
        <select
          value={node.geometry.primitive}
          onChange={(event) =>
            update({
              geometry: { ...node.geometry, primitive: event.target.value as MassPrimitive },
            })
          }
          style={selectStyle}
        >
          {PRIMITIVES.map((primitive) => (
            <option key={primitive} value={primitive}>
              {primitive}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Width / Depth / Height">
        <div style={tripleGridStyle}>
          <ScaleSelect
            value={node.geometry.width}
            onChange={(value) =>
              update({ geometry: { ...node.geometry, width: value } })
            }
          />
          <ScaleSelect
            value={node.geometry.depth}
            onChange={(value) =>
              update({ geometry: { ...node.geometry, depth: value } })
            }
          />
          <ScaleSelect
            value={node.geometry.height}
            onChange={(value) =>
              update({ geometry: { ...node.geometry, height: value } })
            }
          />
        </div>
      </Field>

      <Field label="Placement">
        <select
          value={node.geometry.vertical_placement}
          onChange={(event) =>
            update({
              geometry: {
                ...node.geometry,
                vertical_placement: event.target.value as RelativePlacement,
              },
            })
          }
          style={selectStyle}
        >
          {PLACEMENTS.map((placement) => (
            <option key={placement} value={placement}>
              {placement}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Image Notes">
        <textarea
          value={node.narrative.image_prompt_notes}
          onChange={(event) =>
            update({
              narrative: {
                ...node.narrative,
                image_prompt_notes: event.target.value,
              },
            })
          }
          style={textareaStyle}
        />
      </Field>

      <button
        onClick={() => editDispatch({ type: "REMOVE_NODE", nodeId: node.id })}
        style={deleteBtnStyle}
      >
        Delete Node
      </button>
    </div>
  );
}

function ScaleSelect({
  value,
  onChange,
}: {
  value: RelativeScale;
  onChange: (value: RelativeScale) => void;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as RelativeScale)} style={selectStyle}>
      {SCALE_VALUES.map((scale) => (
        <option key={scale} value={scale}>
          {scale}
        </option>
      ))}
    </select>
  );
}

function AddNodeSection() {
  const { state, editDispatch } = useGraph();
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("new_mass");
  const [kind, setKind] = useState<MassNodeKind>("solid");

  const handleAdd = useCallback(() => {
    if (!state.graph) return;
    const id = `${name.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "_")}_${Date.now()}`;
    const node: MassNode = {
      id,
      name,
      kind,
      hierarchy: "secondary",
      spatial_role: "new mass",
      program_label: null,
      geometry: {
        primitive: "block",
        width: "medium",
        depth: "medium",
        height: "medium",
        proportion: "compact",
        skin: "mixed",
        porosity: "solid",
        vertical_placement: "mid",
        span_character: "single",
        orientation: "orthogonal",
        story_count: null,
        floor_to_floor_m: null,
        target_gfa_m2: null,
        height_m: null,
        plan_aspect_ratio: null,
        story_span: {
          start: null,
          end: null,
        },
      },
      variant_space: {
        alternative_primitives: ["block"],
        aspect_ratio_range: { min: 1, max: 1 },
        footprint_scale_range: { min: 1, max: 1 },
        height_scale_range: { min: 1, max: 1 },
        radial_distance_scale_range: { min: 1, max: 1 },
        angle_jitter_deg: 0,
        freedom: "fixed",
      },
      relative_position: {},
      narrative: {
        role: "new mass",
        intent: "사용자가 추가한 매스",
        spatial_character: "neutral",
        facade_material_light: "undecided",
        image_prompt_notes: "",
        keywords: [],
      },
      architect_influences: [],
      discussion_trace: [],
      properties: { user_added: "true" },
    };
    editDispatch({ type: "ADD_NODE", node });
    setExpanded(false);
  }, [state.graph, name, kind, editDispatch]);

  return (
    <div style={{ borderTop: "1px solid #1a1a2e", padding: "8px 16px" }}>
      <button onClick={() => setExpanded((value) => !value)} style={addBtnStyle}>
        + Add Node
      </button>
      {expanded && (
        <div style={{ marginTop: 8 }}>
          <Field label="Name">
            <input value={name} onChange={(event) => setName(event.target.value)} style={inputStyle} />
          </Field>
          <Field label="Kind">
            <select value={kind} onChange={(event) => setKind(event.target.value as MassNodeKind)} style={selectStyle}>
              {NODE_KINDS.map((nodeKind) => (
                <option key={nodeKind} value={nodeKind}>
                  {nodeKind}
                </option>
              ))}
            </select>
          </Field>
          <button onClick={handleAdd} style={confirmBtnStyle}>
            Create
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={fieldStyle}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  borderTop: "1px solid #1a1a2e",
  background: "#0d0d15",
  fontSize: 11,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 16px",
  borderBottom: "1px solid #1a1a2e",
  color: "#5b8cff",
  fontSize: 11,
  fontWeight: "bold",
};

const formStyle: React.CSSProperties = {
  padding: "8px 16px",
};

const fieldStyle: React.CSSProperties = {
  marginBottom: 8,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "#596273",
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 2,
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  background: "#1a1a2e",
  border: "1px solid #2a2a3e",
  color: "#d6dce8",
  fontSize: 11,
  padding: "4px 6px",
  borderRadius: 3,
  fontFamily: "inherit",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#1a1a2e",
  border: "1px solid #2a2a3e",
  color: "#d6dce8",
  fontSize: 11,
  padding: "4px 6px",
  borderRadius: 3,
  fontFamily: "inherit",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 72,
  resize: "vertical",
};

const tripleGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 6,
};

const undoBtnStyle: React.CSSProperties = {
  background: "#171c28",
  color: "#d6dce8",
  border: "1px solid #2a2a3e",
  borderRadius: BUTTON_RADIUS,
  cursor: "pointer",
  padding: "2px 8px",
};

const deleteBtnStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 8,
  background: "#2a1016",
  color: "#ff8f9d",
  border: "1px solid #4f1a24",
  borderRadius: BUTTON_RADIUS,
  padding: "6px 8px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const addBtnStyle: React.CSSProperties = {
  width: "100%",
  background: "#171c28",
  color: "#d6dce8",
  border: "1px solid #2a2a3e",
  borderRadius: BUTTON_RADIUS,
  padding: "6px 8px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const confirmBtnStyle: React.CSSProperties = {
  width: "100%",
  background: "#15301f",
  color: "#95f2b5",
  border: "1px solid #26553a",
  borderRadius: BUTTON_RADIUS,
  padding: "6px 8px",
  cursor: "pointer",
  fontFamily: "inherit",
};
