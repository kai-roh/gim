"use client";

import React, { useEffect, useCallback, useRef, useState } from "react";
import { GraphProvider, useGraph } from "@/lib/graph-context";
import { ForumProvider, useForum } from "@/lib/forum-context";
import type { SpatialMassGraph } from "@gim/core";
import { ForumPanel } from "./ForumPanel";
import { BuildingFloorView } from "./BuildingFloorView";
import { ImageGenerationPanel } from "./ImageGenerationPanel";
import { MassViewer3D, type MassViewer3DHandle } from "./MassViewer3D";
import { NodeInspector } from "./NodeInspector";
import { SpatialGraphPanel } from "./SpatialGraphPanel";
import { VariantSnapshotsPanel } from "./VariantSnapshotsPanel";

function WorkspacePanels() {
  const { state } = useGraph();
  const { state: forumState } = useForum();
  const [leftPanelMode, setLeftPanelMode] = useState<"forum" | "result">("forum");
  const previousResultReadyRef = useRef(false);
  const massViewerRef = useRef<MassViewer3DHandle | null>(null);

  const hasGraph = !!state.graph;
  const convergenceComplete =
    forumState.status === "all_complete" ||
    forumState.phases.some(
      (phaseState) =>
        phaseState.phase === "convergence" && phaseState.responses.length > 0
    );
  const resultReady = hasGraph && (convergenceComplete || !forumState.sessionId);

  useEffect(() => {
    if (!previousResultReadyRef.current && resultReady) {
      setLeftPanelMode("result");
    }
    if (!resultReady) {
      setLeftPanelMode("forum");
    }
    previousResultReadyRef.current = resultReady;
  }, [resultReady]);

  const showingResult = resultReady && leftPanelMode === "result";

  return (
    <div style={shellStyle}>
      <div style={mainAreaStyle}>
        <div style={leftPanelStyle}>
          {resultReady && (
            <div style={leftPanelTabsStyle}>
              <button
                type="button"
                onClick={() => setLeftPanelMode("forum")}
                style={{
                  ...leftPanelTabStyle,
                  ...(leftPanelMode === "forum" ? activeLeftPanelTabStyle : {}),
                }}
              >
                Forum
              </button>
              <button
                type="button"
                onClick={() => setLeftPanelMode("result")}
                style={{
                  ...leftPanelTabStyle,
                  ...(leftPanelMode === "result" ? activeLeftPanelTabStyle : {}),
                }}
              >
                Results
              </button>
            </div>
          )}
          <div style={leftPanelContentStyle}>
            {showingResult ? <BuildingFloorView /> : <ForumPanel />}
          </div>
        </div>

        {state.loading ? (
          <div style={placeholderStyle}>
            <p style={{ color: "#666" }}>Loading graph data...</p>
          </div>
        ) : !hasGraph ? (
          <div style={placeholderStyle}>
            <p style={{ color: "#888", fontSize: 13 }}>
              Run a forum session to generate the spatial mass graph
            </p>
            <p style={{ color: "#555", fontSize: 11, marginTop: 8 }}>
              or run <code style={{ color: "#a6f" }}>npm run graph</code> to
              load existing data
            </p>
          </div>
        ) : (
          <>
            <div style={centerColumnStyle}>
              <div style={viewer3dPanelStyle}>
                <MassViewer3D ref={massViewerRef} />
                <div style={imageOverlayWrapStyle}>
                  <ImageGenerationPanel
                    graph={state.graph}
                    captureMonochromeCurrentView={() =>
                      massViewerRef.current?.captureMonochromeCurrentView() ?? null
                    }
                  />
                </div>
              </div>
              <div style={inspectorPanelStyle}>
                <NodeInspector />
              </div>
            </div>

            <div style={infoPanelStyle}>
              <div style={graphPanelStyle}>
                <SpatialGraphPanel />
              </div>
              <div style={evalPanelStyle}>
                <VariantSnapshotsPanel />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AppContent() {
  const { loadGraph, dispatch, undo, redo } = useGraph();

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
    (graph: SpatialMassGraph) => {
      dispatch({ type: "LOAD_GRAPH_SUCCESS", graph });
    },
    [dispatch]
  );

  return (
    <ForumProvider onGraphGenerated={handleGraphGenerated}>
      <WorkspacePanels />
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

const leftPanelStyle: React.CSSProperties = {
  width: 380,
  minWidth: 340,
  borderRight: "1px solid #1a1a2e",
  display: "flex",
  flexDirection: "column",
  background: "#0d0d15",
  overflow: "hidden",
};

const leftPanelTabsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "10px 12px",
  borderBottom: "1px solid #1a1a2e",
  background: "#0a0f18",
  flexShrink: 0,
};

const leftPanelTabStyle: React.CSSProperties = {
  border: "1px solid #273247",
  borderRadius: 999,
  background: "transparent",
  color: "#7f90ab",
  padding: "6px 12px",
  fontSize: 10,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  cursor: "pointer",
  fontFamily: "inherit",
};

const activeLeftPanelTabStyle: React.CSSProperties = {
  background: "#162235",
  color: "#dce7ff",
  borderColor: "#3f5d86",
};

const leftPanelContentStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
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

const viewer3dPanelStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  position: "relative",
};

const imageOverlayWrapStyle: React.CSSProperties = {
  position: "absolute",
  top: 16,
  left: 16,
  zIndex: 4,
  pointerEvents: "none",
};

const centerColumnStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
};

const inspectorPanelStyle: React.CSSProperties = {
  height: 248,
  minHeight: 208,
  borderTop: "1px solid #1a1a2e",
  background: "#0d0d15",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const infoPanelStyle: React.CSSProperties = {
  width: 332,
  minWidth: 300,
  borderLeft: "1px solid #1a1a2e",
  background: "#0d0d15",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const evalPanelStyle: React.CSSProperties = {
  flex: 1,
  borderTop: "1px solid #1a1a2e",
  overflowY: "auto",
  minHeight: 0,
};

const graphPanelStyle: React.CSSProperties = {
  height: "48%",
  minHeight: 300,
  overflow: "hidden",
};
