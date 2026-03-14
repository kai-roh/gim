// ============================================================
// @gim/core
// ============================================================

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
  StructuralProposal,
  ProjectContext,
  ForumSession,
  ForumRound,
  MassNodeKind,
  NodeHierarchy,
  MassPrimitive,
  RelativeScale,
  RelativeProportion,
  SkinTransparency,
  Porosity,
  RelativePlacement,
  SpanCharacter,
  SurfaceOrientation,
  MassGeometryProposal,
  MassNarrativeProposal,
  MassNodeProposal,
  MassRelationFamily,
  MassRelationRule,
  MassRelationProposal,
  DesignNarrativeProposal,
} from "./forum/types";

export type {
  ProjectFrame,
  SpatialMassGraph,
  MassNode,
  MassRelation,
  DesignNarrativeMetadata,
  DecisionProvenance,
  NodeNarrativeSummary,
  ArchitectContribution,
  ArchitectInfluence,
  DiscussionTrace,
  RelationEvidence,
  MassRelationConstraint,
  ResolvedMassDimensions,
  ResolvedMassTransform,
  ResolvedBooleanOperation,
  ResolvedMassNode,
  ResolvedModelRelation,
  ResolveMassModelOptions,
  ResolvedMassModel,
  ForumResult,
  VerticalNodeGraph,
  FloorNode,
  VoxelEdge,
  VoxelEdgeType,
} from "./graph/types";

export { buildSpatialMassGraph } from "./graph/builder";
export { buildGraphFromForumResult, getLatestResponses } from "./graph/program-graph";
export { resolveSpatialMassModel, withResolvedMassModel } from "./graph/resolved-model";

export {
  addNode,
  removeNode,
  updateNode,
  addRelation,
  removeRelation,
  getNeighbors,
  toJSON,
  fromJSON,
} from "./graph/operations";

export {
  evaluateGraph,
  relationClarity,
  geometryReadiness,
  narrativeCoverage,
  provenanceTraceability,
  consensusStrength,
} from "./graph/metrics";
export type { GraphMetrics } from "./graph/metrics";

export { evaluateGraphFull } from "./graph/evaluation";
export type { EvaluationResult, EvaluationIssue } from "./graph/evaluation";

export {
  SCALE_ORDER,
  DEFAULT_GEOMETRY,
  inverseRuleFor,
  normalizeId,
  clampInfluence,
  pickMostCommon,
  pickLongest,
  average,
  mergeKeywords,
  ensureGeometry,
  defaultNodeName,
} from "./graph/rules";
