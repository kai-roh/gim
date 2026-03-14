import type { ForumSession, ArchitectResponse, DiscussionPhase } from "@gim/core";

export interface SessionEntry {
  session: ForumSession;
  status: "idle" | "running" | "completed" | "error";
  currentPhaseResponses: { id: string; response: ArchitectResponse }[];
  error?: string;
  abortController?: AbortController;
}

// In-memory session store (MVP — no persistence needed)
export const sessionStore = new Map<string, SessionEntry>();
