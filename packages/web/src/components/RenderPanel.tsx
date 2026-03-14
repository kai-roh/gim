"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useForum } from "@/lib/forum-context";

interface RenderItem {
  image: string;
  filename: string;
  timestamp: string;
  description: string;
  prompt: string;
  company?: string;
  location?: string;
}

export function RenderPanel() {
  const { state: forumState } = useForum();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<RenderItem[]>([]);
  const [preview, setPreview] = useState<RenderItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userHint, setUserHint] = useState("");

  const hasConvergence =
    !!forumState.historicalForumResult ||
    forumState.phases.some((p) => p.phase === "convergence");

  // Load render history
  const loadHistory = useCallback(async () => {
    try {
      const resp = await fetch("/api/render");
      if (resp.ok) {
        const data = await resp.json();
        setHistory(data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (open) loadHistory();
  }, [open, loadHistory]);

  // Build forumResult from forum context state (live or historical)
  function buildForumResult() {
    // Use loaded historical session data if available (preserves full project info)
    if (forumState.historicalForumResult) {
      return forumState.historicalForumResult;
    }

    const rounds = forumState.phases.map((p, i) => ({
      round: i + 1,
      phase: p.phase,
      responses: p.responses.map((r) => ({
        ...r.response,
        architectId: r.architectId,
      })),
    }));

    return {
      panel: forumState.selectedArchitects,
      rounds,
      project: {
        site: { location: "", context: {} },
        company: { name: "", brand_philosophy: "" },
      },
    };
  }

  function captureViewerCanvas(): string | null {
    const canvas = document.querySelector("canvas");
    if (!canvas) return null;
    return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
  }

  async function handleRender() {
    setLoading(true);
    setError(null);
    try {
      const forumResult = buildForumResult();
      const viewCapture = captureViewerCanvas();
      const resp = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forumResult,
          userHint: userHint || undefined,
          viewCapture,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);

      const newItem: RenderItem = {
        image: data.image,
        filename: data.filename,
        timestamp: data.timestamp,
        description: data.description,
        prompt: data.prompt,
      };
      setPreview(newItem);
      setHistory((prev) => [newItem, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Render failed");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={renderBtnStyle}
        title={hasConvergence ? "Generate architectural rendering" : "Run forum to convergence first"}
      >
        <span style={{ fontSize: 16 }}>&#x1f3a8;</span>
        <span style={{ marginLeft: 6, fontSize: 10 }}>Render</span>
      </button>
    );
  }

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>RENDER</span>
        <button onClick={() => setOpen(false)} style={closeBtnStyle}>x</button>
      </div>

      {/* Preview */}
      {preview && (
        <div style={previewContainerStyle}>
          <img
            src={preview.image}
            alt="Rendered building"
            style={previewImgStyle}
            onClick={() => window.open(preview.image, "_blank")}
          />
          {preview.description && (
            <p style={descStyle}>{preview.description.slice(0, 120)}</p>
          )}
        </div>
      )}

      {/* Controls */}
      <div style={controlsStyle}>
        <input
          type="text"
          value={userHint}
          onChange={(e) => setUserHint(e.target.value)}
          placeholder="Optional style hint..."
          style={inputStyle}
        />
        <button
          onClick={handleRender}
          disabled={loading || !hasConvergence}
          style={{
            ...generateBtnStyle,
            opacity: loading || !hasConvergence ? 0.4 : 1,
          }}
        >
          {loading ? "Generating..." : "Generate"}
        </button>
        {!hasConvergence && (
          <p style={warnStyle}>Run forum to convergence first</p>
        )}
        {error && <p style={errorStyle}>{error}</p>}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div style={historyContainerStyle}>
          <div style={historySectionStyle}>
            <span style={{ fontSize: 10, color: "#667", letterSpacing: 1 }}>HISTORY</span>
          </div>
          <div style={historyGridStyle}>
            {history.map((item) => (
              <div
                key={item.timestamp}
                style={{
                  ...thumbContainerStyle,
                  border: preview?.timestamp === item.timestamp ? "1px solid #4488cc" : "1px solid #2a3040",
                }}
                onClick={() => setPreview(item)}
              >
                <img src={item.image} alt="" style={thumbImgStyle} />
                <span style={thumbLabelStyle}>{item.timestamp.slice(11, 19).replace(/-/g, ":")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Styles
// ============================================================

const renderBtnStyle: React.CSSProperties = {
  position: "absolute",
  top: 10,
  right: 10,
  background: "rgba(20,22,30,0.9)",
  border: "1px solid #2a3040",
  borderRadius: 6,
  padding: "6px 12px",
  color: "#bbb",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  fontFamily: "inherit",
  zIndex: 10,
};

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  width: 240,
  height: "100%",
  background: "rgba(13,13,21,0.95)",
  borderLeft: "1px solid #1a1a2e",
  display: "flex",
  flexDirection: "column",
  zIndex: 20,
  fontFamily: "'SF Mono', 'Fira Code', monospace",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 12px",
  borderBottom: "1px solid #1a1a2e",
  color: "#999",
};

const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#666",
  cursor: "pointer",
  fontSize: 14,
  fontFamily: "inherit",
  padding: "2px 6px",
};

const previewContainerStyle: React.CSSProperties = {
  padding: 8,
  borderBottom: "1px solid #1a1a2e",
};

const previewImgStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 4,
  cursor: "pointer",
};

const descStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#888",
  marginTop: 6,
  lineHeight: 1.4,
};

const controlsStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #1a1a2e",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#1a1a2e",
  border: "1px solid #2a3040",
  borderRadius: 4,
  padding: "6px 8px",
  color: "#ccc",
  fontSize: 11,
  fontFamily: "inherit",
  marginBottom: 6,
  boxSizing: "border-box",
};

const generateBtnStyle: React.CSSProperties = {
  width: "100%",
  background: "#1a2a3e",
  border: "1px solid #2a4060",
  borderRadius: 4,
  padding: "8px",
  color: "#88bbee",
  fontSize: 11,
  fontFamily: "inherit",
  cursor: "pointer",
  fontWeight: 600,
};

const warnStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#886644",
  marginTop: 6,
};

const errorStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#cc4444",
  marginTop: 6,
};

const historyContainerStyle: React.CSSProperties = {
  flex: 1,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const historySectionStyle: React.CSSProperties = {
  padding: "8px 10px 4px",
};

const historyGridStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "4px 10px 10px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const thumbContainerStyle: React.CSSProperties = {
  borderRadius: 4,
  overflow: "hidden",
  cursor: "pointer",
  position: "relative",
};

const thumbImgStyle: React.CSSProperties = {
  width: "100%",
  display: "block",
};

const thumbLabelStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 4,
  right: 6,
  fontSize: 9,
  color: "#aaa",
  background: "rgba(0,0,0,0.6)",
  padding: "1px 4px",
  borderRadius: 2,
};
