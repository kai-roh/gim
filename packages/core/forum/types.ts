// ============================================================
// Architect Clone Types (Corporate HQ)
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

// ============================================================
// Expert Profile Types
// ============================================================

export interface ExpertProfile {
  id: string;
  type: "legal_regulatory" | "structural_engineering";
  focus_areas: string[];
  review_criteria: string[];
}

// ============================================================
// Discussion Protocol Types
// ============================================================

export type DiscussionPhase =
  | "proposal"
  | "cross_critique"
  | "mass_consensus"    // Phase 3a: 매스 분절 합의
  | "convergence"
  | "expert_review"
  | "finalization"
  | "feedback_opinion";

export interface VerticalZoneProposal {
  zone: string;
  floors: [number, number];
  primary_function: string;
  style_ref?: string;
  rationale: string;
}

export interface StructuralProposal {
  system: string;
  core_type: string;
  special_elements: string[];
}

export interface DesignProposal {
  vertical_zoning: VerticalZoneProposal[];
  structural_system: StructuralProposal;
  key_features: string[];
  form_concept: string;
}

// ============================================================
// Mass Proposal Types (SpatialMassGraph transition)
// ============================================================

export interface MassEntityProposal {
  label: string;
  type: "solid" | "void" | "core" | "connector";
  floor_range: [number, number];
  programs: string[];
  description: string;
  geometry_intent: string;     // e.g. "broad plate, transparent, porous"
}

export interface MassRelationProposal {
  source: string;               // label reference
  target: string;               // label reference
  family: string;               // stack | contact | enclosure | intersection | connection | alignment
  rule: string;                 // above | below | adjacent | wraps | ...
  rationale: string;
}

export interface MassProposal {
  entities: MassEntityProposal[];
  key_relations: MassRelationProposal[];
  form_concept: string;
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
  // v2: mass 기반 (mass_consensus / convergence에서 사용)
  mass_proposal?: MassProposal;
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

// ============================================================
// Forum Session Types
// ============================================================

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
