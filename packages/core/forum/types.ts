// ============================================================
// Architect Clone Types
// ============================================================

export interface ArchitectProfile {
  id: string;
  reference: string;
  category: "supertall_specialist" | "architectural_visionary";

  supertall_principles: string[];

  vertical_preferences: {
    base_strategy: string;
    tower_form: string;
    top_strategy: string;
    core_philosophy: string;
    sky_lobby_preference: boolean;
    mixed_use_transition: string;
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
// Discussion Protocol Types
// ============================================================

export type DiscussionPhase =
  | "proposal"
  | "cross_critique"
  | "convergence"
  | "finalization";

export interface VerticalZoneProposal {
  zone: string;
  floors: [number, number];
  primary_function: string;
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

export interface ArchitectResponse {
  architect_id: string;
  phase: DiscussionPhase;
  stance: string;
  reasoning: string;
  proposal: DesignProposal;
  critique?: {
    target_architect_id: string;
    point: string;
    counter_proposal?: string;
  }[];
  compromise?: string;
}

// ============================================================
// Forum Session Types
// ============================================================

export interface ProjectContext {
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
  trigger: "initial_context" | "evaluation_feedback" | "user_intervention";
  responses: ArchitectResponse[];
  consensus?: string;
  dissent?: string[];
}
