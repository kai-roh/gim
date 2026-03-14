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
// Floor Zone Classification (9 zones)
// ============================================================

export type FloorZone =
  | "basement"
  | "podium"
  | "low_rise"
  | "mid_rise"
  | "sky_lobby"
  | "high_rise"
  | "mechanical"
  | "crown"
  | "rooftop";

// ============================================================
// Node Function Classification (30 types, 9 categories)
// ============================================================

export type NodeFunction =
  // CORE (4)
  | "elevator_core"
  | "stairwell"
  | "elevator_lobby"
  | "service_shaft"
  // OFFICE (4)
  | "open_office"
  | "premium_office"
  | "executive_suite"
  | "coworking"
  // HOTEL (4)
  | "hotel_room"
  | "hotel_suite"
  | "hotel_lobby"
  | "hotel_amenity"
  // RETAIL (3)
  | "retail"
  | "restaurant"
  | "cultural_facility"
  // PUBLIC (5)
  | "public_void"
  | "sky_garden"
  | "observation_deck"
  | "sky_lounge"
  | "refuge_area"
  // SOCIAL (6)
  | "conference"
  | "fitness"
  | "spa"
  | "library"
  | "gallery"
  | "rooftop_bar"
  // MECHANICAL (3)
  | "mechanical_room"
  | "electrical_room"
  | "water_tank"
  // PARKING (2)
  | "parking"
  | "loading_dock"
  // STRUCTURAL (2)
  | "outrigger"
  | "belt_truss";

export const NODE_FUNCTION_CATEGORY: Record<string, NodeFunction[]> = {
  CORE: ["elevator_core", "stairwell", "elevator_lobby", "service_shaft"],
  OFFICE: ["open_office", "premium_office", "executive_suite", "coworking"],
  HOTEL: ["hotel_room", "hotel_suite", "hotel_lobby", "hotel_amenity"],
  RETAIL: ["retail", "restaurant", "cultural_facility"],
  PUBLIC: ["public_void", "sky_garden", "observation_deck", "sky_lounge", "refuge_area"],
  SOCIAL: ["conference", "fitness", "spa", "library", "gallery", "rooftop_bar"],
  MECHANICAL: ["mechanical_room", "electrical_room", "water_tank"],
  PARKING: ["parking", "loading_dock"],
  STRUCTURAL: ["outrigger", "belt_truss"],
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
  view_premium: number;      // 0-1, height-based view quality
  publicity: number;         // 0-1, public accessibility
  structural_load: number;   // 0-1, load on this floor
  vertical_flow: number;     // 0-1, vertical circulation intensity
  prestige: number;          // 0-1, perceived prestige
  flexibility: number;       // 0-1, spatial flexibility
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
    outrigger_interval: [number, number];
    mechanical_interval: [number, number];
    refuge_interval: number;
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
