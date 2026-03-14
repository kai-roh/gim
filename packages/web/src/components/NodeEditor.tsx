"use client";

import React, { useState, useCallback } from "react";
import type { FloorNode, FloorZone } from "@gim/core";
import { useGraph } from "@/lib/graph-context";
import { FUNC_COLORS, floorLabel } from "@/lib/graph-colors";

type NodeFunction = FloorNode["function"];
type FloorPosition = FloorNode["position"];

const NODE_FUNCTION_CATEGORY: Record<string, NodeFunction[]> = {
  CORE: ["elevator_core", "stairwell", "elevator_lobby", "service_shaft"],
  OFFICE: ["open_office", "premium_office", "executive_suite", "coworking", "focus_room"],
  EXPERIENCE: ["brand_showroom", "exhibition_hall", "experiential_retail", "installation_space"],
  RETAIL: ["cafe", "flagship_store"],
  PUBLIC: ["lobby", "atrium", "public_void", "community_space", "event_space"],
  SOCIAL: ["lounge", "meditation_room"],
  AMENITY: ["cafeteria", "meeting_room", "auditorium", "nursery"],
  OUTDOOR: ["sky_garden", "rooftop_bar", "gallery"],
  MECHANICAL: ["mechanical_room", "electrical_room", "server_room"],
  PARKING: ["parking", "loading_dock", "bicycle_storage"],
};

const ALL_FUNCTIONS: NodeFunction[] = Object.values(NODE_FUNCTION_CATEGORY).flat() as NodeFunction[];

const ALL_POSITIONS: FloorPosition[] = [
  "center", "north", "south", "east", "west",
  "northeast", "northwest", "southeast", "southwest",
];

const ALL_ZONES: FloorZone[] = [
  "basement", "ground", "lower", "middle",
  "upper", "penthouse", "rooftop",
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
          <button onClick={undo} disabled={!canUndo} style={undoBtnStyle} title="Undo (Ctrl+Z)">
            ↶
          </button>
          <button onClick={redo} disabled={!canRedo} style={undoBtnStyle} title="Redo (Ctrl+Shift+Z)">
            ↷
          </button>
        </div>
      </div>

      {selectedNode ? (
        <NodeEditForm node={selectedNode} />
      ) : (
        <div style={{ padding: "12px 16px", color: "#555", fontSize: 11 }}>
          Select a node to edit its properties
        </div>
      )}

      <AddNodeSection />
    </div>
  );
}

function NodeEditForm({ node }: { node: FloorNode }) {
  const { editDispatch } = useGraph();

  const handleFunctionChange = useCallback(
    (fn: NodeFunction) => {
      editDispatch({
        type: "UPDATE_NODE",
        nodeId: node.id,
        updates: { function: fn, name: `${fn}_F${node.floor_level}` },
      });
    },
    [editDispatch, node.id, node.floor_level]
  );

  const handlePositionChange = useCallback(
    (pos: FloorPosition) => {
      editDispatch({ type: "UPDATE_NODE", nodeId: node.id, updates: { position: pos } });
    },
    [editDispatch, node.id]
  );

  const handleFloorChange = useCallback(
    (floor: number) => {
      editDispatch({ type: "MOVE_NODE", nodeId: node.id, floorLevel: floor });
    },
    [editDispatch, node.id]
  );

  const handleZoneChange = useCallback(
    (zone: FloorZone) => {
      editDispatch({ type: "UPDATE_NODE", nodeId: node.id, updates: { floor_zone: zone } });
    },
    [editDispatch, node.id]
  );

  const handleDelete = useCallback(() => {
    editDispatch({ type: "REMOVE_NODE", nodeId: node.id });
  }, [editDispatch, node.id]);

  return (
    <div style={formStyle}>
      <div style={fieldStyle}>
        <label style={labelStyle}>ID</label>
        <span style={{ color: "#666", fontSize: 10 }}>{node.id}</span>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Function</label>
        <select
          value={node.function}
          onChange={(e) => handleFunctionChange(e.target.value as NodeFunction)}
          style={selectStyle}
        >
          {Object.entries(NODE_FUNCTION_CATEGORY).map(([cat, funcs]) => (
            <optgroup key={cat} label={cat}>
              {funcs.map((fn) => (
                <option key={fn} value={fn}>
                  {fn.replace(/_/g, " ")}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Position</label>
        <select
          value={node.position}
          onChange={(e) => handlePositionChange(e.target.value as FloorPosition)}
          style={selectStyle}
        >
          {ALL_POSITIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Floor</label>
        <input
          type="number"
          value={node.floor_level}
          onChange={(e) => handleFloorChange(parseInt(e.target.value) || 0)}
          style={inputStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Zone</label>
        <select
          value={node.floor_zone}
          onChange={(e) => handleZoneChange(e.target.value as FloorZone)}
          style={selectStyle}
        >
          {ALL_ZONES.map((z) => (
            <option key={z} value={z}>{z.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle}>Tags</label>
        <span style={{ color: "#666", fontSize: 10 }}>
          {node.tags?.join(", ") || "none"}
        </span>
      </div>

      <button onClick={handleDelete} style={deleteBtnStyle}>
        Delete Node
      </button>
    </div>
  );
}

function AddNodeSection() {
  const { state, editDispatch } = useGraph();
  const [expanded, setExpanded] = useState(false);
  const [newFunc, setNewFunc] = useState<NodeFunction>("open_office");
  const [newPos, setNewPos] = useState<FloorPosition>("center");
  const [newFloor, setNewFloor] = useState(1);

  const handleAdd = useCallback(() => {
    if (!state.graph) return;
    const id = `node_custom_${Date.now()}`;
    const zone = state.graph.nodes.find((n) => n.floor_level === newFloor)?.floor_zone || "middle";
    const node: FloorNode = {
      id,
      name: `${newFunc}_F${newFloor}`,
      floor_level: newFloor,
      floor_zone: zone as FloorZone,
      function: newFunc,
      position: newPos,
      constraints: [],
      abstract: {
        view_premium: 0.5,
        publicity: 0.5,
        brand_expression: 0.5,
        spatial_quality: 0.5,
        prestige: 0.5,
        flexibility: 0.5,
      },
      tags: ["user_added"],
    };
    editDispatch({ type: "ADD_NODE", node });
    setExpanded(false);
  }, [state.graph, newFunc, newPos, newFloor, editDispatch]);

  return (
    <div style={{ borderTop: "1px solid #1a1a2e", padding: "8px 16px" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ ...addBtnStyle, marginBottom: expanded ? 8 : 0 }}
      >
        + Add Node
      </button>
      {expanded && (
        <div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Function</label>
            <select
              value={newFunc}
              onChange={(e) => setNewFunc(e.target.value as NodeFunction)}
              style={selectStyle}
            >
              {ALL_FUNCTIONS.map((fn) => (
                <option key={fn} value={fn}>{fn.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Position</label>
            <select
              value={newPos}
              onChange={(e) => setNewPos(e.target.value as FloorPosition)}
              style={selectStyle}
            >
              {ALL_POSITIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Floor</label>
            <input
              type="number"
              value={newFloor}
              onChange={(e) => setNewFloor(parseInt(e.target.value) || 0)}
              style={inputStyle}
            />
          </div>
          <button onClick={handleAdd} style={confirmBtnStyle}>
            Create
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Styles
// ============================================================

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
  color: "#4488cc",
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
  color: "#555",
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 2,
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  background: "#1a1a2e",
  border: "1px solid #2a2a3e",
  color: "#ccc",
  fontSize: 11,
  padding: "4px 6px",
  borderRadius: 3,
  fontFamily: "inherit",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#1a1a2e",
  border: "1px solid #2a2a3e",
  color: "#ccc",
  fontSize: 11,
  padding: "4px 6px",
  borderRadius: 3,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const undoBtnStyle: React.CSSProperties = {
  background: "#1a1a2e",
  border: "1px solid #2a2a3e",
  color: "#888",
  fontSize: 14,
  padding: "2px 8px",
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "inherit",
};

const deleteBtnStyle: React.CSSProperties = {
  width: "100%",
  background: "#2a1515",
  border: "1px solid #4a2020",
  color: "#e45444",
  fontSize: 10,
  padding: "6px",
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "inherit",
  marginTop: 8,
};

const addBtnStyle: React.CSSProperties = {
  width: "100%",
  background: "#151a25",
  border: "1px solid #203040",
  color: "#4488cc",
  fontSize: 10,
  padding: "6px",
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "inherit",
};

const confirmBtnStyle: React.CSSProperties = {
  width: "100%",
  background: "#152a15",
  border: "1px solid #204020",
  color: "#44c464",
  fontSize: 10,
  padding: "6px",
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "inherit",
  marginTop: 4,
};
