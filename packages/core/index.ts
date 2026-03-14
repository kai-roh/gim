// ============================================================
// @gim/core — Barrel Export
// ============================================================

// Forum
export {
  createForumSession,
  runPhase,
  runPhaseStreaming,
  runFullForum,
  sessionToForumResult,
  buildContextPrompt,
  buildPhasePrompt,
} from "./forum/forum-engine";
export type { ForumSessionOptions, StreamCallbacks } from "./forum/forum-engine";

export {
  loadArchitectProfile,
  listArchitectIds,
  loadAllArchitects,
  buildSystemPrompt,
  buildPanel,
} from "./forum/architect-loader";

export type {
  ArchitectProfile,
  ExpertProfile,
  ArchitectResponse,
  ExpertReviewResponse,
  DiscussionPhase,
  DesignProposal,
  VerticalZoneProposal,
  StructuralProposal,
  ProjectContext,
  ForumSession,
  ForumRound,
} from "./forum/types";

// Graph — Types
export type {
  FloorZone,
  NodeFunction,
  FloorPosition,
  GlobalGraph,
  ProgramGraph,
  ProgramNode,
  ProgramEdge,
  ProgramEdgeType,
  VerticalNodeGraph,
  FloorNode,
  VoxelEdge,
  VoxelEdgeType,
  AbstractProperties,
  DesignRules,
  AdjacencyRule,
  ConsensusZone,
  ForumResult,
  FloorPlateData,
  FloorGeometry,
} from "./graph/types";

export { NODE_FUNCTION_CATEGORY } from "./graph/types";

// Graph — Builder
export { buildVerticalNodeGraph } from "./graph/builder";

// Graph — Program Graph
export {
  buildProgramGraph,
  buildGraphFromForumResult,
  mergeVerticalZones,
  normalizeFunctionName,
} from "./graph/program-graph";

// Graph — Operations
export {
  addNode,
  removeNode,
  updateNode,
  moveNode,
  addEdge,
  removeEdge,
  getNodesByFloor,
  getNodesByZone,
  getNodesByFunction,
  getNeighbors,
  toJSON,
  fromJSON,
} from "./graph/operations";

// Graph — Metrics
export {
  evaluateGraph,
  connectivityAccuracy,
  verticalContinuityScore,
  zoneCoverageScore,
} from "./graph/metrics";
export type { GraphMetrics } from "./graph/metrics";

// Graph — Evaluation (7-dimension)
export {
  evaluateGraphFull,
} from "./graph/evaluation";
export type { EvaluationResult, EvaluationIssue } from "./graph/evaluation";

// Form — Architect FormDNA
export {
  ARCHITECT_FORM_DNA,
  generateFloorOutline,
  isInVoidCut,
  shouldHaveTerrace,
  getDominantFormDNA,
  getFloorFormDNA,
} from "./form/architect-form";
export type { ArchitectFormDNA, VoidCut } from "./form/architect-form";

// Graph — Rules
export {
  getDefaultRules,
  getDefaultAdjacencyRules,
  classifyFloorZone,
  computeAbstractProperties,
  getFloorHeight,
  getRefugeFloors,
  getMechanicalFloors,
  getOutriggerFloors,
} from "./graph/rules";
