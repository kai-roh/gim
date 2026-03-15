// ============================================================
// Architect Forum Types
// Primary output is now a spatial mass graph, not floor zoning.
// ============================================================

export interface ArchitectProfile {
  id: string;
  reference: string;
  category: "design_practice_master" | "architectural_visionary";

  design_principles: string[];

  spatial_preferences: {
    ground_strategy: string;
    form_language: string;
    facade_approach: string;
    interior_philosophy: string;
    material_expression: string;
    light_strategy: string;
  };

  expression_rules: {
    structure_expression: string;
    facade_language: string;
    material_palette: string[];
    sustainability_approach: string;
  };

  discussion_style: {
    assertiveness: number;
    compromise_willingness: number;
    focus_priority: string[];
  };

  knowledge_base: {
    representative_buildings: string[];
    design_philosophy: string;
    era_context: string;
  };
}

export interface ExpertProfile {
  id: string;
  type: "legal_regulatory" | "structural_engineering";
  focus_areas: string[];
  review_criteria: string[];
}

export type DiscussionPhase =
  | "proposal"
  | "cross_critique"
  | "mass_consensus"    // Phase 3a: 매스 분절 합의
  | "convergence"
  | "expert_review"
  | "finalization"
  | "feedback_opinion";

export type MassNodeKind = "solid" | "void" | "core" | "connector";
export type NodeHierarchy = "primary" | "secondary" | "tertiary";
export type MassPrimitive =
  | "block"
  | "bar"
  | "plate"
  | "ring"
  | "tower"
  | "bridge"
  | "cylinder";
export type RelativeScale = "xs" | "small" | "medium" | "large" | "xl";
export type RelativeProportion = "compact" | "elongated" | "slender" | "broad";
export type SkinTransparency = "opaque" | "mixed" | "transparent";
export type Porosity = "solid" | "porous" | "open";
export type RelativePlacement =
  | "subgrade"
  | "grounded"
  | "low"
  | "mid"
  | "upper"
  | "crown"
  | "spanning";
export type SpanCharacter = "single" | "stacked" | "multi_level";
export type SurfaceOrientation = "orthogonal" | "diagonal" | "curved" | "radial";
export type VariantFreedom = "fixed" | "guided" | "exploratory";

export interface StorySpan {
  start: number | null;
  end: number | null;
}

export interface NumericRange {
  min: number | null;
  max: number | null;
}

export interface MassGeometryProposal {
  primitive: MassPrimitive;
  width: RelativeScale;
  depth: RelativeScale;
  height: RelativeScale;
  proportion: RelativeProportion;
  skin: SkinTransparency;
  porosity: Porosity;
  vertical_placement: RelativePlacement;
  span_character: SpanCharacter;
  orientation: SurfaceOrientation;
  story_count: number | null;
  floor_to_floor_m: number | null;
  target_gfa_m2: number | null;
  height_m: number | null;
  plan_aspect_ratio: number | null;
  story_span: StorySpan;
}

export interface MassNodeVariantSpaceProposal {
  alternative_primitives: MassPrimitive[];
  aspect_ratio_range: NumericRange;
  footprint_scale_range: NumericRange;
  height_scale_range: NumericRange;
  radial_distance_scale_range: NumericRange;
  angle_jitter_deg: number | null;
  freedom: VariantFreedom;
}

export interface MassNarrativeProposal {
  role: string;
  intent: string;
  spatial_character: string;
  facade_material_light: string;
  image_prompt_notes: string;
  keywords: string[];
}

export interface ArchitectInfluenceProposal {
  architect_id: string;
  influence: number;
  rationale: string;
}

export interface MassNodeProposal {
  id: string;
  name: string;
  kind: MassNodeKind;
  hierarchy: NodeHierarchy;
  spatial_role: string;
  geometry: MassGeometryProposal;
  variant_space?: Partial<MassNodeVariantSpaceProposal>;
  relative_position: {
    anchor_to?: string;
    relation_hint?: string;
  };
  narrative: MassNarrativeProposal;
  architect_influences?: ArchitectInfluenceProposal[];
  properties?: Record<string, string>;
}

export type MassRelationFamily =
  | "stack"
  | "contact"
  | "enclosure"
  | "intersection"
  | "connection"
  | "alignment";

export type MassRelationRule =
  | "above"
  | "below"
  | "adjacent"
  | "wraps"
  | "inside"
  | "contains"
  | "penetrates"
  | "linked"
  | "offset_from"
  | "aligned_with"
  | "bridges_to"
  | "rests_on";

export interface MassRelationProposal {
  source_id: string;
  target_id: string;
  family: MassRelationFamily;
  rule: MassRelationRule;
  strength: "hard" | "soft";
  weight: number;
  rationale: string;
  geometry_effect?: "attach" | "separate" | "overlap" | "pierce" | "offset" | "bridge";
  variant_space?: Partial<MassRelationVariantSpaceProposal>;
}

export interface MassRelationVariantSpaceProposal {
  distance_scale_range: NumericRange;
  lateral_offset_range_m: NumericRange;
}

export interface StructuralProposal {
  core_strategy: string;
  load_transfer: string;
  special_elements: string[];
}

export interface DesignNarrativeProposal {
  project_intro: string;
  overall_architectural_concept: string;
  massing_strategy_summary: string;
  facade_and_material_summary: string;
  public_to_private_sequence: string;
  spatial_character_summary: string;
  image_direction: string;
}

export interface DesignProposal {
  massing_concept: string;
  structural_strategy: StructuralProposal;
  key_moves: string[];
  mass_entities: MassNodeProposal[];
  mass_relations: MassRelationProposal[];
  narrative: DesignNarrativeProposal;
}

// ============================================================
// Architect Response
// ============================================================

export interface ArchitectResponse {
  architect_id: string;
  phase: DiscussionPhase;
  stance: string;
  reasoning: string;
  // v1 (legacy): vertical_zoning 기반
  proposal: DesignProposal;
  critique?: {
    target_architect_id: string;
    point: string;
    counter_proposal?: string;
  }[];
  compromise?: string;
}

export interface ExpertReviewResponse {
  expert_id: string;
  expert_type: "legal_regulatory" | "structural_engineering";
  verdict: "approved" | "conditionally_approved" | "revision_required";
  issues: {
    severity: "info" | "warning" | "critical";
    description: string;
    recommendation: string;
  }[];
  summary: string;
}

export interface ProjectContext {
  company?: {
    name: string;
    brand_philosophy: string;
    identity_keywords: string[];
  };
  site: {
    location: string;
    dimensions: [number, number];
    far: number;
    bcr: number;
    height_limit: number;
    context: {
      north: string;
      south: string;
      east: string;
      west: string;
    };
  };
  program: {
    total_gfa: number;
    uses: {
      type: string;
      ratio: number;
      requirements?: string;
    }[];
  };
  constraints: string[];
  client_vision?: string;
}

export interface ForumSession {
  project_id: string;
  panel: string[];
  context: ProjectContext;
  rounds: ForumRound[];
  current_phase: DiscussionPhase;
  iteration: number;
}

export interface ForumRound {
  round: number;
  phase: DiscussionPhase;
  trigger: "initial_context" | "evaluation_feedback" | "user_intervention" | "expert_feedback";
  responses: ArchitectResponse[];
  expert_reviews?: ExpertReviewResponse[];
  consensus?: string;
  dissent?: string[];
}
