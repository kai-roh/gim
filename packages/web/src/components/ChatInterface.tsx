"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useGraph } from "@/lib/graph-context";
import { useForum } from "@/lib/forum-context";

interface ChatMessage {
  id: string;
  role: "user" | "system";
  content: string;
  timestamp: number;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "system",
      content: "GIM CLI ready. Commands: /select <id>, /floor <n>, /evaluate, /edit, /undo, /redo, /save, /load, /reset. Or type feedback for the forum.",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { state, dispatch, editDispatch, undo, redo, loadGraph } = useGraph();
  const forum = useForum();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const addMessage = useCallback((role: "user" | "system", content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `msg_${Date.now()}`, role, content, timestamp: Date.now() },
    ]);
  }, []);

  const handleCommand = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      addMessage("user", trimmed);

      // Command parsing
      if (trimmed.startsWith("/")) {
        const parts = trimmed.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const arg = parts.slice(1).join(" ");

        switch (cmd) {
          case "/select": {
            if (!arg) {
              dispatch({ type: "SELECT_NODE", nodeId: null });
              addMessage("system", "Selection cleared.");
            } else {
              const node = state.graph?.nodes.find(
                (n) => n.id === arg || n.id.includes(arg)
              );
              if (node) {
                dispatch({ type: "SELECT_NODE", nodeId: node.id });
                addMessage("system", `Selected: ${node.id} (${node.function} @ F${node.floor_level})`);
              } else {
                addMessage("system", `Node "${arg}" not found.`);
              }
            }
            break;
          }

          case "/floor": {
            const floor = parseInt(arg);
            if (isNaN(floor)) {
              addMessage("system", "Usage: /floor <number>");
            } else {
              dispatch({ type: "SELECT_FLOOR", floor });
              const count = state.graph?.nodes.filter((n) => n.floor_level === floor).length || 0;
              addMessage("system", `Floor ${floor} selected (${count} nodes)`);
            }
            break;
          }

          case "/evaluate": {
            addMessage("system", "Running evaluation...");
            try {
              const resp = await fetch("/api/graph/evaluate");
              if (resp.ok) {
                const data = await resp.json();
                const pct = Math.round(data.overall * 100);
                const issues = data.issues.length;
                addMessage(
                  "system",
                  `Overall: ${pct}% | Issues: ${issues}\n` +
                    `  Connectivity: ${Math.round(data.connectivity_accuracy * 100)}%\n` +
                    `  Continuity: ${Math.round(data.vertical_continuity * 100)}%\n` +
                    `  Coverage: ${Math.round(data.zone_coverage * 100)}%\n` +
                    `  Structure: ${Math.round(data.structural_stability * 100)}%\n` +
                    `  Environment: ${Math.round(data.environmental * 100)}%\n` +
                    `  Compliance: ${Math.round(data.code_compliance * 100)}%\n` +
                    `  Economic: ${Math.round(data.economic * 100)}%`
                );
              } else {
                addMessage("system", "Evaluation failed.");
              }
            } catch {
              addMessage("system", "Evaluation request failed.");
            }
            break;
          }

          case "/edit": {
            dispatch({ type: "TOGGLE_EDIT_MODE" });
            addMessage("system", `Edit mode ${state.editMode ? "OFF" : "ON"}`);
            break;
          }

          case "/undo": {
            undo();
            addMessage("system", "Undo.");
            break;
          }

          case "/redo": {
            redo();
            addMessage("system", "Redo.");
            break;
          }

          case "/save": {
            if (state.graph) {
              try {
                const resp = await fetch("/api/graph/save", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(state.graph),
                });
                if (resp.ok) {
                  addMessage("system", "Graph saved.");
                } else {
                  addMessage("system", "Save failed.");
                }
              } catch {
                addMessage("system", "Save request failed.");
              }
            }
            break;
          }

          case "/load": {
            await loadGraph();
            addMessage("system", "Graph reloaded from server.");
            break;
          }

          case "/reset": {
            await loadGraph();
            addMessage("system", "Graph reset to original state.");
            break;
          }

          case "/stats": {
            if (state.graph) {
              addMessage(
                "system",
                `Nodes: ${state.graph.nodes.length}\n` +
                  `Edges: ${state.graph.edges.length}\n` +
                  `Floors: ${state.graph.metadata.floor_range[0]} ~ ${state.graph.metadata.floor_range[1]}`
              );
            }
            break;
          }

          default:
            addMessage("system", `Unknown command: ${cmd}`);
        }
      } else {
        // Forum feedback injection
        if (forum.state.sessionId) {
          try {
            await fetch(`/api/forum/${forum.state.sessionId}/inject`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ feedback: trimmed }),
            });
            addMessage("system", "Feedback injected into forum session.");
          } catch {
            addMessage("system", "Failed to inject feedback.");
          }
        } else {
          addMessage("system", "No active forum session. Start a forum first or use /commands.");
        }
      }
    },
    [state, dispatch, editDispatch, undo, redo, loadGraph, addMessage, forum.state.sessionId]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleCommand(input);
    setInput("");
  };

  return (
    <div style={containerStyle}>
      <div ref={scrollRef} style={messagesStyle}>
        {messages.map((msg) => (
          <div key={msg.id} style={msg.role === "user" ? userMsgStyle : sysMsgStyle}>
            <span style={{ color: msg.role === "user" ? "#4488cc" : "#555", marginRight: 8, fontSize: 9 }}>
              {msg.role === "user" ? ">" : "#"}
            </span>
            <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} style={inputBarStyle}>
        <span style={{ color: "#4488cc", marginRight: 6 }}>$</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a command or feedback..."
          style={inputFieldStyle}
          autoFocus
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
  fontFamily: "inherit",
};

const userMsgStyle: React.CSSProperties = {
  color: "#ccc",
  padding: "3px 0",
  display: "flex",
};

const sysMsgStyle: React.CSSProperties = {
  color: "#888",
  padding: "3px 0",
  display: "flex",
};

const inputBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "8px 16px",
  borderTop: "1px solid #1a1a2e",
  background: "#0d0d15",
};

const inputFieldStyle: React.CSSProperties = {
  flex: 1,
  background: "transparent",
  border: "none",
  outline: "none",
  color: "#e0e0e0",
  fontSize: 11,
  fontFamily: "inherit",
};
