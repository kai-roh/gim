"use client";

import React, { useEffect } from "react";
import { GraphProvider, useGraph } from "@/lib/graph-context";
import { ForumProvider } from "@/lib/forum-context";
import { TowerMinimap } from "./TowerMinimap";
import { ForumPanel } from "./ForumPanel";
import { VerticalGraphViewer } from "./VerticalGraphViewer";
import { MassViewer3D } from "./MassViewer3D";
import { NodeInspector } from "./NodeInspector";
import { EvaluationDashboard } from "./EvaluationDashboard";

function AppContent() {
  const { loadGraph, state } = useGraph();

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  if (state.loading) {
    return (
      <div style={loadingStyle}>
        <p>Loading graph data...</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div style={loadingStyle}>
        <p style={{ color: "#e45444" }}>Error: {state.error}</p>
        <p style={{ color: "#666", marginTop: 8 }}>
          Run <code>npm run graph</code> first to generate graph data.
        </p>
      </div>
    );
  }

  if (!state.graph) return null;

  return (
    <div style={shellStyle}>
      {/* W1: Forum Panel */}
      <div style={forumPanelStyle}>
        <ForumPanel />
      </div>

      {/* Tower Minimap */}
      <div style={towerPanelStyle}>
        <TowerMinimap />
      </div>

      {/* W2: D3 Graph */}
      <div style={graphPanelStyle}>
        <VerticalGraphViewer />
      </div>

      {/* W3: 3D Viewer */}
      <div style={viewer3dPanelStyle}>
        <MassViewer3D />
      </div>

      {/* Right: Node Inspector + Evaluation */}
      <div style={infoPanelStyle}>
        <NodeInspector />
        <div style={evalPanelStyle}>
          <EvaluationDashboard />
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <GraphProvider>
      <ForumProvider>
        <AppContent />
      </ForumProvider>
    </GraphProvider>
  );
}

const loadingStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  background: "#0a0a0f",
  color: "#e0e0e0",
  fontFamily: "'SF Mono', 'Fira Code', monospace",
};

const shellStyle: React.CSSProperties = {
  display: "flex",
  height: "100vh",
  background: "#0a0a0f",
  color: "#e0e0e0",
  fontFamily: "'SF Mono', 'Fira Code', monospace",
  overflow: "hidden",
};

const forumPanelStyle: React.CSSProperties = {
  width: 320,
  minWidth: 320,
  borderRight: "1px solid #1a1a2e",
  display: "flex",
  flexDirection: "column",
  background: "#0d0d15",
  overflow: "hidden",
};

const towerPanelStyle: React.CSSProperties = {
  width: 260,
  minWidth: 260,
  borderRight: "1px solid #1a1a2e",
  display: "flex",
  flexDirection: "column",
  background: "#0d0d15",
  overflow: "hidden",
};

const graphPanelStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  position: "relative",
};

const viewer3dPanelStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  position: "relative",
  borderLeft: "1px solid #1a1a2e",
};

const infoPanelStyle: React.CSSProperties = {
  width: 280,
  minWidth: 280,
  borderLeft: "1px solid #1a1a2e",
  background: "#0d0d15",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const evalPanelStyle: React.CSSProperties = {
  borderTop: "1px solid #1a1a2e",
  overflowY: "auto",
  maxHeight: "40%",
};
