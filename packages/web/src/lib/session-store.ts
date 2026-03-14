import type { ForumSession, ArchitectResponse, DiscussionPhase } from "@gim/core";

export interface SessionEntry {
  session: ForumSession;
  status: "idle" | "running" | "completed" | "error";
  currentPhaseResponses: { id: string; response: ArchitectResponse }[];
  error?: string;
  abortController?: AbortController;
}

// Use globalThis to persist across Next.js module reloads / route boundaries
const globalKey = "__gim_session_store__" as const;

function getStore(): Map<string, SessionEntry> {
  const g = globalThis as any;
  if (!g[globalKey]) {
    g[globalKey] = new Map<string, SessionEntry>();
  }
  return g[globalKey];
}

export const sessionStore = getStore();
