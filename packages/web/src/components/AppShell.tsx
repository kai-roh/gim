"use client";

import React, { useEffect, useCallback } from "react";
import { GraphProvider, useGraph } from "@/lib/graph-context";
import { ForumProvider } from "@/lib/forum-context";
import type { VerticalNodeGraph, SpatialMassGraph } from "@gim/core";
import { ForumPanel } from "./ForumPanel";
import { BuildingFloorView } from "./BuildingFloorView";
import { MassViewer3D } from "./MassViewer3D";
import { NodeInspector } from "./NodeInspector";
import { NodeEditor } from "./NodeEditor";
import { EvaluationDashboard } from "./EvaluationDashboard";
import { RenderPanel } from "./RenderPanel";
import { MassGraphViewer } from "./MassGraphViewer";
import SpatialGraphPanel from "./SpatialGraphPanel";

function AppContent() {
  const { loadGraph, state, dispatch, undo, redo } = useGraph();

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      if (e.key === "Escape") {
        dispatch({ type: "SELECT_NODE", nodeId: null });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, dispatch]);

  // Forum → Graph bridge
  const handleGraphGenerated = useCallback(
    (graph: VerticalNodeGraph) => {
      dispatch({ type: "LOAD_GRAPH_SUCCESS", graph });
    },
    [dispatch]
  );

  const handleMassGraphGenerated = useCallback(
    (massGraph: SpatialMassGraph) => {
      dispatch({ type: "LOAD_MASS_GRAPH_SUCCESS", massGraph });
    },
    [dispatch]
  );

  const hasGraph = !!state.graph || !!state.massGraph;

  return (
    <ForumProvider onGraphGenerated={handleGraphGenerated} onMassGraphGenerated={handleMassGraphGenerated}>
      <div style={shellStyle}>
        <div style={mainAreaStyle}>
          {/* Left: Forum Panel */}
          <div style={forumPanelStyle}>
            <ForumPanel />
          </div>

          {/* Graph panels */}
          {state.loading ? (
            <div style={placeholderStyle}>
              <p style={{ color: "#666" }}>Loading graph data...</p>
            </div>
          ) : !hasGraph ? (
            <div style={placeholderStyle}>
              <p style={{ color: "#888", fontSize: 13 }}>
                Run a forum session to generate the building graph
              </p>
              <p style={{ color: "#555", fontSize: 11, marginTop: 8 }}>
                or run <code style={{ color: "#a6f" }}>npm run graph</code> to
                load existing data
              </p>
            </div>
          ) : state.graphVersion === 2 ? (
            <>
              {/* V2 Layout: Center + Right */}
              {/* Center: 3D Viewer (top ~65%) + Mass Inspector / BuildingFloorView (bottom ~35%) */}
              <div style={v2CenterPanelStyle}>
                <div style={{ flex: "0 0 65%", minHeight: 0, position: "relative" }}>
                  <MassViewer3D />
                  <RenderPanel />
                </div>
                <div style={{ flex: "0 0 35%", minHeight: 0, borderTop: "1px solid #1a1a2e", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <div style={editToggleBarStyle}>
                    <button
                      onClick={() => dispatch({ type: "TOGGLE_EDIT_MODE" })}
                      style={{
                        ...editToggleBtnStyle,
                        background: state.editMode ? "#1a2a3e" : "#1a1a2e",
                        color: state.editMode ? "#4488cc" : "#555",
                      }}
                    >
                      {state.editMode ? "Editing" : "View"}
                    </button>
                  </div>
                  <div style={{ flex: 1, overflow: "auto" }}>
                    <NodeInspector />
                    <NodeEditor />
                    <BuildingFloorView />
                  </div>
                </div>
              </div>

              {/* Right: SpatialGraphPanel (top ~60%) + EvaluationDashboard (bottom ~40%) */}
              <div style={v2RightPanelStyle}>
                <div style={{ flex: "0 0 60%", minHeight: 0, overflow: "hidden" }}>
                  <SpatialGraphPanel />
                </div>
                <div style={{ flex: "0 0 40%", minHeight: 0, borderTop: "1px solid #1a1a2e", overflowY: "auto" }}>
                  <EvaluationDashboard />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* V1 Layout: BuildingFloorView + 3D Viewer + Info Panel */}
              <div style={floorViewPanelStyle}>
                <BuildingFloorView />
              </div>

              <div style={viewer3dPanelStyle}>
                <MassViewer3D />
                <RenderPanel />
              </div>

              <div style={infoPanelStyle}>
                <div style={editToggleBarStyle}>
                  <button
                    onClick={() => dispatch({ type: "TOGGLE_EDIT_MODE" })}
                    style={{
                      ...editToggleBtnStyle,
                      background: state.editMode ? "#1a2a3e" : "#1a1a2e",
                      color: state.editMode ? "#4488cc" : "#555",
                    }}
                  >
                    {state.editMode ? "Editing" : "View"}
                  </button>
                </div>
                <NodeInspector />
                <NodeEditor />
                <div style={evalPanelStyle}>
                  <EvaluationDashboard />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </ForumProvider>
  );
}

export function AppShell() {
  return (
    <GraphProvider>
      <AppContent />
    </GraphProvider>
  );
}

const shellStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  background: "#0a0a0f",
  color: "#e0e0e0",
  fontFamily: "'SF Mono', 'Fira Code', monospace",
  overflow: "hidden",
};

const mainAreaStyle: React.CSSProperties = {
  display: "flex",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
};

const forumPanelStyle: React.CSSProperties = {
  width: 400,
  minWidth: 360,
  borderRight: "1px solid #1a1a2e",
  display: "flex",
  flexDirection: "column",
  background: "#0d0d15",
  overflow: "hidden",
};

const placeholderStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  background: "#0a0a0f",
  fontFamily: "'SF Mono', 'Fira Code', monospace",
};

// V2 layout styles
const v2CenterPanelStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  position: "relative",
  borderLeft: "1px solid #1a1a2e",
};

const v2RightPanelStyle: React.CSSProperties = {
  width: 300,
  minWidth: 300,
  borderLeft: "1px solid #1a1a2e",
  background: "#0d0d15",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

// V1 layout styles
const floorViewPanelStyle: React.CSSProperties = {
  width: 380,
  minWidth: 320,
  borderRight: "1px solid #1a1a2e",
  display: "flex",
  flexDirection: "column",
  background: "#0d0d15",
  overflow: "hidden",
};

const viewer3dPanelStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  position: "relative",
  borderLeft: "1px solid #1a1a2e",
};

const infoPanelStyle: React.CSSProperties = {
  width: 300,
  minWidth: 300,
  borderLeft: "1px solid #1a1a2e",
  background: "#0d0d15",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const editToggleBarStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderBottom: "1px solid #1a1a2e",
};

const editToggleBtnStyle: React.CSSProperties = {
  border: "1px solid #2a2a3e",
  fontSize: 10,
  padding: "4px 12px",
  borderRadius: 3,
  cursor: "pointer",
  fontFamily: "inherit",
};

const evalPanelStyle: React.CSSProperties = {
  borderTop: "1px solid #1a1a2e",
  overflowY: "auto",
  maxHeight: "40%",
};
