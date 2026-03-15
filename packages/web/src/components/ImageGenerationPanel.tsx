"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { SpatialMassGraph } from "@gim/core";

type GeneratedImageSet = {
  referenceImage: string;
  images: string[];
  prompt: string;
  generatedAt: string;
  model: string;
};

type ImageGenerationPanelProps = {
  graph: SpatialMassGraph | null;
  captureMonochromeCurrentView: () => string | null;
};

export function ImageGenerationPanel({
  graph,
  captureMonochromeCurrentView,
}: ImageGenerationPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<{
    src: string;
    label: string;
  } | null>(null);
  const [openByVariant, setOpenByVariant] = useState<Record<string, boolean>>({});
  const [resultsByVariant, setResultsByVariant] = useState<
    Record<string, GeneratedImageSet>
  >({});

  const activeKey = useMemo(() => {
    if (!graph) return null;
    return `${graph.metadata.created_at}:${graph.resolved_model.variant_id}`;
  }, [graph]);

  const activeResult = activeKey ? resultsByVariant[activeKey] ?? null : null;

  useEffect(() => {
    if (!expandedImage) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpandedImage(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedImage]);

  const handleGenerate = async () => {
    if (!graph) return;

    const sourceImageDataUrl = captureMonochromeCurrentView();
    if (!sourceImageDataUrl) {
      setError("Monochrome reference capture failed.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/images/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          graph,
          sourceImageDataUrl,
        }),
      });

      const payload = (await response.json()) as {
        images?: string[];
        prompt?: string;
        model?: string;
        error?: string;
      };

      if (!response.ok || !payload.images || payload.images.length === 0) {
        throw new Error(payload.error || "Image generation failed.");
      }

      const images = payload.images;

      setResultsByVariant((current) => ({
        ...current,
        [activeKey ?? graph.resolved_model.variant_id]: {
          referenceImage: sourceImageDataUrl,
          images: images.slice(0, 2),
          prompt: payload.prompt ?? "",
          generatedAt: new Date().toISOString(),
          model: payload.model ?? "unknown",
        },
      }));
      if (activeKey ?? graph.resolved_model.variant_id) {
        const key = activeKey ?? graph.resolved_model.variant_id;
        setOpenByVariant((current) => ({
          ...current,
          [key]: true,
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image generation failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          style={collapsedTabStyle}
        >
          Image Render
        </button>
      ) : (
        <div style={panelStyle}>
          <div style={headerStyle}>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              style={titleButtonStyle}
            >
              Image Render
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!graph || loading}
              style={{
                ...generateButtonStyle,
                opacity: !graph || loading ? 0.5 : 1,
                cursor: !graph || loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Generating..." : "Generate"}
            </button>
          </div>

          {error && <div style={errorStyle}>{error}</div>}

          {activeResult && activeKey ? (
            <details
              open={openByVariant[activeKey] ?? true}
              onToggle={(event) => {
                const nextOpen = (event.currentTarget as HTMLDetailsElement).open;
                setOpenByVariant((current) => ({
                  ...current,
                  [activeKey]: nextOpen,
                }));
              }}
              style={accordionStyle}
            >
              <summary style={accordionSummaryStyle}>Generated Assets</summary>
              <div style={sectionLabelStyle}>Reference</div>
              <button
                type="button"
                onClick={() =>
                  setExpandedImage({
                    src: activeResult.referenceImage,
                    label: "Current View Reference",
                  })
                }
                style={referenceButtonStyle}
              >
                <img
                  src={activeResult.referenceImage}
                  alt="Monochrome reference"
                  style={imageStyle}
                />
              </button>

              <div style={sectionLabelStyle}>Results</div>
              <div style={imageGridStyle}>
                {activeResult.images.map((image, index) => (
                  <button
                    key={`${activeKey}-${index}`}
                    type="button"
                    onClick={() =>
                      setExpandedImage({
                        src: image,
                        label: `Generated Render ${index + 1}`,
                      })
                    }
                    style={imageButtonStyle}
                  >
                    <img
                      src={image}
                      alt={`Generated render ${index + 1}`}
                      style={imageStyle}
                    />
                  </button>
                ))}
              </div>
              <div style={promptBlockStyle}>
                <div style={summaryStyle}>Prompt</div>
                <pre style={promptStyle}>{activeResult.prompt}</pre>
              </div>
            </details>
          ) : null}
        </div>
      )}

      {expandedImage && typeof document !== "undefined"
        ? createPortal(
            <div style={modalBackdropStyle} onClick={() => setExpandedImage(null)}>
              <div style={modalCardStyle} onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setExpandedImage(null)}
                  style={closeButtonStyle}
                >
                  Close
                </button>
                <div style={modalLabelStyle}>{expandedImage.label}</div>
                <img
                  src={expandedImage.src}
                  alt={expandedImage.label}
                  style={modalImageStyle}
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

const panelStyle: React.CSSProperties = {
  width: 204,
  display: "flex",
  flexDirection: "column",
  background: "rgba(9, 14, 22, 0.9)",
  border: "1px solid rgba(43, 64, 96, 0.75)",
  borderRadius: 14,
  padding: "8px 8px 8px",
  gap: 6,
  overflow: "hidden",
  backdropFilter: "blur(10px)",
  boxShadow: "0 16px 32px rgba(0, 0, 0, 0.28)",
  pointerEvents: "auto",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  color: "#8ba6d8",
};

const titleButtonStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  padding: 0,
  margin: 0,
  fontFamily: "inherit",
  fontSize: 10,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  color: "#8ba6d8",
  cursor: "pointer",
};

const generateButtonStyle: React.CSSProperties = {
  border: "1px solid #2f4c73",
  borderRadius: 999,
  background: "rgba(12, 20, 32, 0.88)",
  color: "#dce7ff",
  padding: "5px 9px",
  fontFamily: "inherit",
  fontSize: 9,
  whiteSpace: "nowrap",
};

const collapsedTabStyle: React.CSSProperties = {
  border: "1px solid rgba(43, 64, 96, 0.75)",
  borderRadius: 999,
  background: "rgba(9, 14, 22, 0.9)",
  color: "#8ba6d8",
  padding: "7px 10px",
  fontFamily: "inherit",
  fontSize: 10,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  cursor: "pointer",
  backdropFilter: "blur(10px)",
  boxShadow: "0 12px 24px rgba(0, 0, 0, 0.24)",
  pointerEvents: "auto",
};

const accordionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const accordionSummaryStyle: React.CSSProperties = {
  cursor: "pointer",
  color: "#9cb4d8",
  fontSize: 10,
  listStyle: "none",
};

const imageGridStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 9,
  letterSpacing: 0.9,
  textTransform: "uppercase",
  color: "#6f86ac",
  padding: "2px 2px 0",
};

const referenceButtonStyle: React.CSSProperties = {
  border: "1px solid #324865",
  borderRadius: 10,
  overflow: "hidden",
  background: "#f3f3ee",
  minHeight: 72,
  padding: 0,
  cursor: "pointer",
};

const imageButtonStyle: React.CSSProperties = {
  border: "1px solid #1d2a3f",
  borderRadius: 10,
  overflow: "hidden",
  background: "#0a0f18",
  minHeight: 84,
  padding: 0,
  cursor: "pointer",
};

const imageStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "block",
  objectFit: "cover",
};

const errorStyle: React.CSSProperties = {
  borderRadius: 8,
  background: "rgba(99, 28, 28, 0.24)",
  border: "1px solid rgba(179, 72, 72, 0.45)",
  color: "#ffb4b4",
  padding: "8px 10px",
  fontSize: 10,
  lineHeight: 1.5,
};

const promptBlockStyle: React.CSSProperties = {
  borderTop: "1px solid #1a1a2e",
  paddingTop: 6,
  maxHeight: 138,
  overflowY: "auto",
};

const summaryStyle: React.CSSProperties = {
  cursor: "pointer",
  color: "#91a4c7",
  fontSize: 10,
};

const promptStyle: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  color: "#9aa6bb",
  fontSize: 9,
  lineHeight: 1.5,
  marginTop: 8,
};

const modalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 40,
  background: "rgba(4, 8, 14, 0.82)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 32,
};

const modalCardStyle: React.CSSProperties = {
  position: "relative",
  maxWidth: "min(1100px, 92vw)",
  maxHeight: "88vh",
  borderRadius: 16,
  overflow: "hidden",
  background: "#0c1018",
  border: "1px solid rgba(57, 78, 112, 0.7)",
  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.45)",
};

const modalLabelStyle: React.CSSProperties = {
  position: "absolute",
  top: 16,
  left: 18,
  zIndex: 2,
  color: "#d6e2f5",
  fontSize: 12,
  letterSpacing: 0.5,
  background: "rgba(10, 15, 24, 0.72)",
  border: "1px solid rgba(57, 78, 112, 0.7)",
  borderRadius: 999,
  padding: "8px 12px",
};

const closeButtonStyle: React.CSSProperties = {
  position: "absolute",
  top: 14,
  right: 14,
  zIndex: 2,
  border: "1px solid #39506f",
  borderRadius: 999,
  background: "rgba(10, 15, 24, 0.9)",
  color: "#eef4ff",
  padding: "8px 12px",
  fontFamily: "inherit",
  fontSize: 11,
  cursor: "pointer",
};

const modalImageStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  maxWidth: "min(1100px, 92vw)",
  maxHeight: "88vh",
  objectFit: "contain",
};
