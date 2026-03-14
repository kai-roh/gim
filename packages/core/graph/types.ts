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
