"use client";

import React from "react";
import { useGraph } from "@/lib/graph-context";

export function VariantSnapshotsPanel() {
  const { variantHistory, activeVariantId, activateVariant } = useGraph();

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>Saved</div>
          <div style={titleStyle}>Variant Snapshots</div>
        </div>
        <div style={metaStyle}>{variantHistory.length} saved</div>
      </div>

      <div style={listStyle}>
        {variantHistory.map((variant) => {
          const active = variant.id === activeVariantId;
          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => activateVariant(variant.id)}
              style={{
                ...snapshotButtonStyle,
                borderColor: active ? "#dce7ff" : "#2a3445",
                boxShadow: active ? "0 0 0 1px rgba(220,231,255,0.24)" : "none",
              }}
            >
              {variant.previewDataUrl ? (
                <img
                  src={variant.previewDataUrl}
                  alt={variant.label}
                  style={snapshotImageStyle}
                />
              ) : (
                <div style={snapshotPlaceholderStyle}>{variant.label}</div>
              )}
              <div style={captionStyle}>
                <span style={{ color: active ? "#f4f7ff" : "#dce7ff" }}>{variant.label}</span>
                <span style={{ color: "#74839b" }}>seed {variant.seed}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  height: "100%",
  minHeight: 0,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const eyebrowStyle: React.CSSProperties = {
  color: "#667085",
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 4,
};

const titleStyle: React.CSSProperties = {
  color: "#e8eefc",
  fontSize: 13,
};

const metaStyle: React.CSSProperties = {
  color: "#74839b",
  fontSize: 10,
};

const listStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  overflowY: "auto",
  minHeight: 0,
  alignContent: "start",
};

const snapshotButtonStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid #2a3445",
  background: "#111520",
  overflow: "hidden",
  padding: 0,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
};

const snapshotImageStyle: React.CSSProperties = {
  width: "100%",
  height: 86,
  objectFit: "cover",
  display: "block",
  background: "#08101a",
};

const snapshotPlaceholderStyle: React.CSSProperties = {
  width: "100%",
  height: 86,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background:
    "linear-gradient(135deg, rgba(64,94,132,0.42), rgba(16,22,34,0.9))",
  color: "#dce7ff",
  fontSize: 11,
};

const captionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "8px 10px",
  fontSize: 10,
};
