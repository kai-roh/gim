// ============================================================
// Spatial Mass Graph Types
// ============================================================

import type {
  ProjectContext,
  ArchitectResponse,
  ForumRound,
  DiscussionPhase,
  MassGeometryProposal,
  MassNarrativeProposal,
  MassNodeKind,
  NodeHierarchy,
  MassRelationFamily,
  MassRelationRule,
  RelativeScale,
} from "../forum/types";

export type {
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
  MassRelationFamily,
  MassRelationRule,
} from "../forum/types";

export interface ProjectFrame {
  company?: ProjectContext["company"];
  site: ProjectContext["site"];
  program: ProjectContext["program"];
  constraints: string[];
  client_vision?: string;
}

export interface ArchitectInfluence {
  architect_id: string;
  weight: number;
  contribution: string;
}

export interface DiscussionTrace {
  architect_id: string;
  phase: DiscussionPhase;
  summary: string;
}

export interface MassNode {
  id: string;
  name: string;
  kind: MassNodeKind;
  hierarchy: NodeHierarchy;
  spatial_role: string;
  geometry: MassGeometryProposal;
  relative_position: {
    anchor_to?: string;
    relation_hint?: string;
  };
  narrative: MassNarrativeProposal;
  architect_influences: ArchitectInfluence[];
  discussion_trace: DiscussionTrace[];
  properties: Record<string, string>;
}

export interface RelationEvidence {
  architect_ids: string[];
  phase: DiscussionPhase;
  summary: string;
}

export interface MassRelationConstraint {
  geometry_effect?: "attach" | "separate" | "overlap" | "pierce" | "offset" | "bridge";
  clearance?: RelativeScale;
}

export interface MassRelation {
  id: string;
  source: string;
  target: string;
  family: MassRelationFamily;
  rule: MassRelationRule;
  inverse_rule: MassRelationRule;
  strength: "hard" | "soft";
  weight: number;
  rationale: string;
  constraints: MassRelationConstraint;
  evidence: RelationEvidence[];
}

export interface ResolvedMassDimensions {
  width: number;
  depth: number;
  height: number;
}

export interface ResolvedMassTransform {
  x: number;
  y: number;
  z: number;
  rotation_x: number;
  rotation_y: number;
  rotation_z: number;
}

export interface ResolvedBooleanOperation {
  type: "subtract" | "intersect";
  target_node_id: string;
  reason: string;
}

export interface ResolvedMassNode {
  node_id: string;
  kind: MassNodeKind;
  hierarchy: NodeHierarchy;
  primitive: MassGeometryProposal["primitive"];
  anchor_to?: string;
  dimensions: ResolvedMassDimensions;
  transform: ResolvedMassTransform;
  shell: {
    skin: MassGeometryProposal["skin"];
    porosity: MassGeometryProposal["porosity"];
    opacity: number;
  };
  boolean_operations: ResolvedBooleanOperation[];
  notes: string[];
}

export interface ResolvedModelRelation {
  relation_id: string;
  source_id: string;
  target_id: string;
  rule: MassRelationRule;
  applied_strategy: string;
  satisfied: boolean;
  notes: string[];
}

export interface ResolveMassModelOptions {
  seed?: number;
  variant_id?: string;
  variant_label?: string;
}

export interface ResolvedMassModel {
  units: "meters";
  strategy: "constraint_layout_v1";
  generated_at: string;
  variant_id: string;
  variant_label: string;
  seed: number;
  nodes: ResolvedMassNode[];
  relations: ResolvedModelRelation[];
  footprint: {
    width: number;
    depth: number;
    height: number;
  };
  notes: string[];
}

export interface NodeNarrativeSummary {
  node_id: string;
  summary: string;
  spatial_character: string;
  image_prompt_notes: string;
  relationship_summary: string;
  keywords: string[];
}

export interface DesignNarrativeMetadata {
  project_intro: string;
  overall_architectural_concept: string;
  massing_strategy_summary: string;
  facade_and_material_summary: string;
  public_to_private_sequence: string;
  spatial_character_summary: string;
  image_direction: string;
  node_summaries: NodeNarrativeSummary[];
}

export interface ArchitectContribution {
  architect_id: string;
  emphasis: string;
  node_ids: string[];
  relation_ids: string[];
}

export interface DecisionProvenance {
  consensus_notes: string[];
  resolved_conflicts: string[];
  architect_contributions: ArchitectContribution[];
}

export interface SpatialMassGraph {
  project: ProjectFrame;
  nodes: MassNode[];
  relations: MassRelation[];
  narrative: DesignNarrativeMetadata;
  provenance: DecisionProvenance;
  resolved_model: ResolvedMassModel;
  metadata: {
    created_at: string;
    source_forum: string;
    node_count: number;
    relation_count: number;
  };
}

export interface ForumResult {
  project: ProjectContext;
  panel: string[];
  rounds: ForumRound[];
}

// Legacy aliases kept for compile-time compatibility in a few shared helpers.
export type VerticalNodeGraph = SpatialMassGraph;
export type FloorNode = MassNode;
export type VoxelEdge = MassRelation;
export type VoxelEdgeType = MassRelationRule;
