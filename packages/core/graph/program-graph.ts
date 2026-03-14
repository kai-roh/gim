// ============================================================
// Forum Result -> Spatial Mass Graph
// ============================================================

import type { ArchitectResponse } from "../forum/types";
import type { ForumResult, SpatialMassGraph } from "./types";
import { buildSpatialMassGraph } from "./builder";

export function getLatestResponses(forumResult: ForumResult): ArchitectResponse[] {
  const convergenceRound = forumResult.rounds.find((round) => round.phase === "convergence");
  const fallback = forumResult.rounds[forumResult.rounds.length - 1];
  return convergenceRound?.responses ?? fallback?.responses ?? [];
}

export function buildGraphFromForumResult(forumResult: ForumResult): SpatialMassGraph {
  const responses = getLatestResponses(forumResult);
  return buildSpatialMassGraph(forumResult.project, responses);
}
