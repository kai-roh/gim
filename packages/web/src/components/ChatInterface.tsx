"use client";

import React, { useState } from "react";
import { useGraph } from "@/lib/graph-context";
import { useForum } from "@/lib/forum-context";

export function ChatInterface() {
  const [input, setInput] = useState("");
  const { state, dispatch } = useGraph();
  const forum = useForum();

  return (
    <div style={containerStyle}>
      <div style={messagesStyle}>
        <div style={systemMessageStyle}>
          Commands: `/select [id]`, `/stats`, `/evaluate`. Text input is forwarded to the forum as feedback.
        </div>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const text = input.trim();
          if (!text) return;
          setInput("");

          if (text.startsWith("/select ")) {
            const id = text.replace("/select ", "").trim();
            dispatch({ type: "SELECT_NODE", nodeId: id || null });
            return;
          }

          if (text === "/stats" && state.graph) {
            forum.addMessage(
              "system",
              `Masses: ${state.graph.nodes.length} | Relations: ${state.graph.relations.length}`
            );
            return;
          }

          if (forum.state.sessionId) {
            await fetch(`/api/forum/${forum.state.sessionId}/inject`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ feedback: text }),
            });
            forum.addMessage("system", "Feedback injected into forum.");
          }
        }}
        style={inputBarStyle}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type command or forum feedback..."
          style={inputFieldStyle}
        />
      </form>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  background: "#0a0a0f",
  borderTop: "1px solid #1a1a2e",
};

const messagesStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 16px",
  fontSize: 11,
};

const systemMessageStyle: React.CSSProperties = {
  color: "#8d98a7",
  whiteSpace: "pre-wrap",
};

const inputBarStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderTop: "1px solid #1a1a2e",
};

const inputFieldStyle: React.CSSProperties = {
  width: "100%",
  background: "#111520",
  border: "1px solid #252a33",
  color: "#dce7ff",
  borderRadius: 8,
  padding: "8px 10px",
  fontFamily: "inherit",
};
