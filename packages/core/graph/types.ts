// ============================================================
// Building Node Graph Types
// Based on Building-GAN 3-Graph Structure
// ============================================================

import type {
  ProjectContext,
  ArchitectResponse,
  ForumRound,
  VerticalZoneProposal,
} from "../forum/types";

// ============================================================
// Floor Zone Classification (7 zones — Corporate HQ)
// ============================================================

export type FloorZone =
  | "basement"
  | "ground"
  | "lower"
  | "middle"
  | "upper"
  | "penthouse"
  | "rooftop";

// ============================================================
// Node Function Classification (Corporate HQ — 9 categories)
// ============================================================

export type NodeFunction =
  // CORE (4)
  | "elevator_core"
  | "stairwell"
  | "elevator_lobby"
  | "service_shaft"
  // OFFICE (5)
  | "open_office"
  | "premium_office"
  | "executive_suite"
  | "coworking"
  | "focus_room"
  // EXPERIENCE (5)
  | "brand_showroom"
  | "exhibition_hall"
  | "experiential_retail"
  | "gallery"
  | "installation_space"
  // RETAIL (4)
  | "retail"
  | "restaurant"
  | "cafe"
  | "flagship_store"
  // PUBLIC (5)
  | "lobby"
  | "public_void"
  | "atrium"
  | "community_space"
  | "event_space"
  // SOCIAL (6)
  | "lounge"
  | "rooftop_bar"
  | "sky_garden"
  | "fitness"
  | "library"
  | "meditation_room"
  // AMENITY (5)
  | "cafeteria"
  | "meeting_room"
  | "conference"
  | "auditorium"
  | "nursery"
  // MECHANICAL (3)
  | "mechanical_room"
  | "electrical_room"
  | "server_room"
  // PARKING (3)
  | "parking"
  | "loading_dock"
  | "bicycle_storage";

export const NODE_FUNCTION_CATEGORY: Record<string, NodeFunction[]> = {
  CORE: ["elevator_core", "stairwell", "elevator_lobby", "service_shaft"],
  OFFICE: ["open_office", "premium_office", "executive_suite", "coworking", "focus_room"],
  EXPERIENCE: ["brand_showroom", "exhibition_hall", "experiential_retail", "gallery", "installation_space"],
  RETAIL: ["retail", "restaurant", "cafe", "flagship_store"],
  PUBLIC: ["lobby", "public_void", "atrium", "community_space", "event_space"],
  SOCIAL: ["lounge", "rooftop_bar", "sky_garden", "fitness", "library", "meditation_room"],
  AMENITY: ["cafeteria", "meeting_room", "conference", "auditorium", "nursery"],
  MECHANICAL: ["mechanical_room", "electrical_room", "server_room"],
  PARKING: ["parking", "loading_dock", "bicycle_storage"],
};

// ============================================================
// Graph 1: Global Graph
// ============================================================

export interface GlobalGraph {
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
  total_floors: number;
  basement_floors: number;
}

// ============================================================
// Graph 2: Program Graph
// ============================================================

export interface ProgramNode {
  id: string;
  program_type: NodeFunction;
  target_zone: FloorZone;
  floor_range: [number, number];
  area_ratio: number;
}

export type ProgramEdgeType =
  | "ADJACENCY_POSITIVE"
  | "ADJACENCY_NEGATIVE"
  | "VERTICAL_CONTINUITY"
  | "PROGRAM_DEPENDENCY";

export interface ProgramEdge {
  source: string;
  target: string;
  type: ProgramEdgeType;
  weight: number;
  rationale: string;
}

export interface ProgramGraph {
  nodes: ProgramNode[];
  edges: ProgramEdge[];
}

// ============================================================
// Graph 3: Voxel/Floor Node Graph
// ============================================================

export interface AbstractProperties {
  view_premium: number;        // 0-1, height-based view quality
  publicity: number;           // 0-1, public accessibility
  brand_expression: number;    // 0-1, brand identity expression intensity
  spatial_quality: number;     // 0-1, spatial quality (ceiling height, natural light, views)
  prestige: number;            // 0-1, perceived prestige
  flexibility: number;         // 0-1, spatial flexibility
}

// Cardinal positions on floor plan
export type FloorPosition =
  | "center"
  | "north"
  | "south"
  | "east"
  | "west"
  | "northeast"
  | "southeast"
  | "southwest"
  | "northwest";

export interface FloorNode {
  id: string;
  name: string;
  floor_level: number;
  floor_zone: FloorZone;
  function: NodeFunction;
  position: FloorPosition;
  constraints: string[];
  abstract: AbstractProperties;
  style_ref?: string;
  tags: string[];
  geometry_ref?: string;

  // Dimensional data (meters)
  area?: number;
  dimensions?: { width: number; depth: number };
  ceiling_height?: number;

  // Spatial topology
  facade_exposure?: ("north" | "south" | "east" | "west")[];
  is_double_height?: boolean;
  has_void?: boolean;
  has_terrace?: boolean;

  // Form modifiers
  form?: {
    cantilever?: { direction: string; distance: number };
    setback?: number;
    rotation?: number;
  };

  // Per-floor computed geometry (from FormDNA at build time)
  geometry?: FloorGeometry;
}

/**
 * Per-floor geometry parameters — computed from ArchitectFormDNA
 * and stored on each FloorNode so the graph is geometrically self-describing.
 */
export interface FloorGeometry {
  // Plan transform (relative to base footprint)
  rotation: number;          // degrees from base orientation
  scale_x: number;           // X-axis scale (1.0 = base footprint)
  scale_z: number;           // Z-axis scale
  offset_x: number;          // X shift (meters, cantilever/setback)
  offset_z: number;          // Z shift (meters)

  // Section
  floor_height: number;      // floor-to-floor height (meters)
  slab_thickness: number;    // slab thickness (meters)
  is_void: boolean;          // this floor is a void (open air)

  // Facade
  corner_treatment: "sharp" | "rounded" | "chamfered" | "sculpted";
  corner_radius: number;     // meters
  facade_opacity: number;    // 0-1 (0 = solid wall, 1 = full glass)
  facade_inclination: number; // degrees (0 = vertical, + = lean out)

  // Outline (pre-computed 2D polygon)
  outline: [number, number][];
}

// ============================================================
// Floor Plate Geometry (per-floor outline for 3D rendering)
// ============================================================

export interface FloorPlateData {
  floor_level: number;
  outline: [number, number][];  // 2D polygon vertices (x, z) in meters
  height: number;               // floor-to-floor height in meters
  rotation: number;             // degrees from base orientation
  offset: [number, number];     // [x, z] shift from building center
  scale: [number, number];      // [x, z] scale factors
  style_ref?: string;
  is_underground: boolean;
  is_void?: boolean;            // void floor (open air sky garden etc.)
  corner_treatment?: "sharp" | "rounded" | "chamfered" | "sculpted";
  corner_radius?: number;
}

export type VoxelEdgeType =
  | "STACKED_ON"
  | "ADJACENT_TO"
  | "VERTICAL_CONNECT"
  | "SERVED_BY"
  | "ZONE_BOUNDARY"
  | "FACES"
  | "STRUCTURAL_TRANSFER"
  | "STYLE_BOUNDARY"
  | "PROGRAM_LINK";

export interface VoxelEdge {
  source: string;
  target: string;
  type: VoxelEdgeType;
  properties: Record<string, unknown>;
}

// ============================================================
// Combined Vertical Node Graph
// ============================================================

export interface VerticalNodeGraph {
  global: GlobalGraph;
  program: ProgramGraph;
  nodes: FloorNode[];
  edges: VoxelEdge[];
  floor_plates?: FloorPlateData[];
  metadata: {
    created_at: string;
    source_forum: string;
    total_nodes: number;
    total_edges: number;
    floor_range: [number, number];
  };
}

// ============================================================
// Forum Result (top-level structure for parsing)
// ============================================================

export interface ForumResult {
  project: ProjectContext;
  panel: string[];
  rounds: ForumRound[];
}

// ============================================================
// Design Rules
// ============================================================

export interface DesignRules {
  structural: {
    max_cantilever_span: number;
    max_span_without_column: number;
    fire_stair_count: number;
  };
  vertical_zoning: {
    floor_heights: Record<string, number>;
  };
  core: {
    min_per_floor: number;
  };
  adjacency: AdjacencyRule[];
}

export interface AdjacencyRule {
  source: NodeFunction | string;
  target: NodeFunction | string;
  type: "positive" | "negative";
  weight: number;
  reason: string;
}

// ============================================================
// Consensus Zone (merged from multiple architects)
// ============================================================

export interface ConsensusZone {
  floor: number;
  zone: FloorZone;
  function: NodeFunction;
  votes: number;
  sources: string[];
}

// ============================================================
// SpatialMassGraph — Mass-level abstraction (6~12 nodes)
// Replaces VerticalNodeGraph for architectural mass composition
// ============================================================

export type MassNodeType = "solid" | "void" | "core" | "connector";

export type MassPrimitive = "block" | "bar" | "plate" | "ring" | "tower" | "bridge";

export type MassScaleCategory = "small" | "medium" | "large" | "extra_large";

export type MassProportion = "compact" | "elongated" | "slender" | "broad";

export type MassSkin = "opaque" | "mixed" | "transparent";

export type MassPorosity = "solid" | "porous" | "open";

export type MassSpanCharacter = "single" | "stacked" | "multi_level";

export interface MassGeometry {
  primitive: MassPrimitive;
  scale: {
    category: MassScaleCategory;
    hint: {
      width: number;   // meters
      depth: number;    // meters
      height: number;   // meters
    };
  };
  proportion: MassProportion;
  skin: MassSkin;
  porosity: MassPorosity;
  span_character: MassSpanCharacter;
}

export interface MassNarrative {
  intent_text: string;
  architectural_description: string;
  facade_text: string;
  architect_influence: Record<string, number>;  // e.g. { "koolhaas": 0.6, "hadid": 0.4 }
  discussion_trace: string;
}

export interface MassNode {
  id: string;
  type: MassNodeType;
  label: string;
  ground_contact: boolean;
  floor_range: [number, number];
  floor_zone: FloorZone;
  geometry: MassGeometry;
  narrative: MassNarrative;
  programs: NodeFunction[];
  mesh_id?: string;
}

// ---- Mass Relations ----

export type MassRelationFamily =
  | "stack"
  | "contact"
  | "enclosure"
  | "intersection"
  | "connection"
  | "alignment";

export type MassRelationStrength = "hard" | "soft";

export type MassProgramConstraint =
  | "PROGRAM_ADJACENT"
  | "PROGRAM_SEPARATE"
  | "VERTICAL_CONTINUITY";

export interface MassRelation {
  id: string;
  source: string;
  target: string;
  family: MassRelationFamily;
  rule: string;       // above | below | floating | adjacent | touching | wraps | inside | penetrates | overlaps | linked | ramped | axis | offset
  strength: MassRelationStrength;
  description: string;
  program_constraint?: MassProgramConstraint;
  constraint_rationale?: string;
}

// ---- SpatialMassGraph (top-level) ----

export interface SpatialMassGraph {
  global: GlobalGraph;
  nodes: MassNode[];
  relations: MassRelation[];
  composition_summary: string;
  // NEW fields
  narrative?: {
    design_concept: string;
    spatial_strategy: string;
    key_decisions: string[];
  };
  provenance?: {
    created_by: string;
    session_id?: string;
    phase: string;
    timestamp: string;
  };
  resolved_model?: ResolvedMassModel;
  metadata: {
    created_at: string;
    source_forum: string;
    total_nodes: number;
    total_relations: number;
    floor_range: [number, number];
    version: number;    // 2 for SpatialMassGraph
  };
}

// ============================================================
// Resolved Model — deterministic geometric interpretation
// ============================================================

export interface ResolvedMassNode {
  id: string;                    // matches MassNode.id
  position: [number, number, number]; // world XYZ (meters)
  dimensions: [number, number, number]; // width, height, depth (meters)
  rotation: number;              // Y-axis rotation (degrees)
  color: string;                 // per-mass identity color (hex)
  primitive: MassPrimitive;
  opacity: number;               // 0-1
  visible: boolean;
}

export interface ResolvedModelRelation {
  id: string;                    // matches MassRelation.id
  satisfied: boolean;            // whether the constraint is geometrically satisfied
  deviation: number;             // 0-1, how far from ideal
  visual: {
    from: [number, number, number];
    to: [number, number, number];
    style: "solid" | "dashed";
  };
}

export interface ResolvedBooleanOperation {
  hostId: string;                // the solid mass being subtracted from
  voidId: string;                // the void mass doing the subtracting
  operation: "subtract";
  resultFragments: {
    position: [number, number, number];
    dimensions: [number, number, number];
  }[];
}

export interface ResolvedMassModel {
  nodes: ResolvedMassNode[];
  relations: ResolvedModelRelation[];
  booleans: ResolvedBooleanOperation[];
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  created_at: string;
}

// ---- Validation ----

export interface MassValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateSpatialMassGraph(graph: SpatialMassGraph): MassValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Node count check (6~12)
  if (graph.nodes.length < 6) {
    errors.push(`노드 ${graph.nodes.length}개 < 최소 6개`);
  }
  if (graph.nodes.length > 12) {
    errors.push(`노드 ${graph.nodes.length}개 > 최대 12개`);
  }

  // Core node check
  if (!graph.nodes.some((n) => n.type === "core")) {
    errors.push("core 타입 노드 없음");
  }

  // Relation reference integrity
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  for (const rel of graph.relations) {
    if (!nodeIds.has(rel.source)) {
      errors.push(`relation ${rel.id}: source "${rel.source}" 존재하지 않음`);
    }
    if (!nodeIds.has(rel.target)) {
      errors.push(`relation ${rel.id}: target "${rel.target}" 존재하지 않음`);
    }
  }

  // Cycle detection in stack relations (must be DAG)
  const stackEdges = graph.relations.filter((r) => r.family === "stack");
  const adj = new Map<string, string[]>();
  for (const e of stackEdges) {
    const src = e.rule === "below" ? e.target : e.source;
    const tgt = e.rule === "below" ? e.source : e.target;
    if (!adj.has(src)) adj.set(src, []);
    adj.get(src)!.push(tgt);
  }
  const visited = new Set<string>();
  const inStack = new Set<string>();
  function hasCycle(node: string): boolean {
    if (inStack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    inStack.add(node);
    for (const next of adj.get(node) || []) {
      if (hasCycle(next)) return true;
    }
    inStack.delete(node);
    return false;
  }
  for (const id of nodeIds) {
    if (hasCycle(id)) {
      errors.push("stack 관계에 순환 참조 존재");
      break;
    }
  }

  // Duplicate node id check
  const seen = new Set<string>();
  for (const n of graph.nodes) {
    if (seen.has(n.id)) errors.push(`중복 노드 id: "${n.id}"`);
    seen.add(n.id);
  }

  // Programs check — warn if empty
  for (const n of graph.nodes) {
    if (n.type === "solid" && n.programs.length === 0) {
      warnings.push(`노드 "${n.label}" (${n.id}): programs 비어있음`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
