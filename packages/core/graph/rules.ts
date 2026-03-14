// ============================================================
// Corporate HQ Design Rule Engine
// Encodes architectural rules for mid-rise corporate buildings
// ============================================================

import type {
  DesignRules,
  AdjacencyRule,
  FloorZone,
  NodeFunction,
  FloorNode,
  AbstractProperties,
} from "./types";

// ============================================================
// Default Rules
// ============================================================

export function getDefaultRules(): DesignRules {
  return {
    structural: {
      max_cantilever_span: 8,        // meters, without reinforcement
      max_span_without_column: 15,   // meters, column-free space
      fire_stair_count: 2,           // 6층 이상 직통계단 2개소 이상
    },
    vertical_zoning: {
      floor_heights: {
        parking: 3.6,
        loading_dock: 3.6,
        bicycle_storage: 3.0,
        retail: 4.5,
        restaurant: 4.0,
        cafe: 3.5,
        flagship_store: 5.0,
        brand_showroom: 5.0,
        exhibition_hall: 5.5,
        experiential_retail: 5.0,
        installation_space: 6.0,
        gallery: 5.0,
        lobby: 6.0,
        public_void: 10.0,
        atrium: 8.0,
        community_space: 4.0,
        event_space: 5.0,
        open_office: 3.5,
        premium_office: 3.8,
        executive_suite: 4.0,
        coworking: 3.5,
        focus_room: 3.0,
        lounge: 3.5,
        rooftop_bar: 4.0,
        sky_garden: 5.0,
        fitness: 4.0,
        library: 4.0,
        meditation_room: 3.5,
        cafeteria: 3.8,
        meeting_room: 3.0,
        conference: 3.5,
        auditorium: 5.0,
        nursery: 3.0,
        mechanical_room: 4.0,
        electrical_room: 3.5,
        server_room: 3.5,
        elevator_core: 3.5,
        stairwell: 3.5,
        elevator_lobby: 3.5,
        service_shaft: 3.5,
      },
    },
    core: {
      min_per_floor: 1,
    },
    adjacency: getDefaultAdjacencyRules(),
  };
}

// ============================================================
// Floor Height by Function
// ============================================================

export function getFloorHeight(func: NodeFunction): number {
  const rules = getDefaultRules();
  return rules.vertical_zoning.floor_heights[func] ?? 3.5;
}

// ============================================================
// Floor Zone Classification (Corporate HQ)
// ============================================================

export function classifyFloorZone(floor: number, totalFloors: number): FloorZone {
  if (floor < 0) return "basement";
  if (floor <= 1) return "ground";

  const ratio = floor / totalFloors;

  if (ratio <= 0.25) return "lower";
  if (ratio <= 0.6) return "middle";
  if (ratio <= 0.85) return "upper";
  if (ratio <= 0.95) return "penthouse";
  return "rooftop";
}

// ============================================================
// Abstract Properties Computation (Corporate HQ)
// ============================================================

export function computeAbstractProperties(
  node: Pick<FloorNode, "floor_level" | "floor_zone" | "function">,
  totalFloors: number
): AbstractProperties {
  const heightRatio = Math.max(0, node.floor_level) / Math.max(totalFloors, 1);
  const func = node.function;
  const zone = node.floor_zone;

  // view_premium: proportional to height
  const view_premium = Math.min(1, heightRatio * 1.1 + (zone === "rooftop" ? 0.1 : 0));

  // publicity: high for ground/lobby/public spaces, low for executive/office
  const publicFunctions: NodeFunction[] = [
    "lobby", "public_void", "atrium", "community_space", "event_space",
    "retail", "restaurant", "cafe", "gallery", "brand_showroom",
    "experiential_retail", "flagship_store",
  ];
  const publicity = publicFunctions.includes(func)
    ? 0.8 + (zone === "ground" ? 0.2 : 0)
    : zone === "ground"
      ? 0.6
      : func === "elevator_lobby"
        ? 0.4
        : 0.2;

  // brand_expression: high for experience/retail/showroom spaces
  const brandFunctions: NodeFunction[] = [
    "brand_showroom", "experiential_retail", "installation_space",
    "exhibition_hall", "flagship_store", "gallery", "lobby",
  ];
  const brand_expression = brandFunctions.includes(func)
    ? 0.9
    : func === "event_space" || func === "public_void" || func === "atrium"
      ? 0.7
      : func === "lounge" || func === "rooftop_bar"
        ? 0.5
        : 0.2;

  // spatial_quality: based on function type and floor height
  const highQualityFunctions: NodeFunction[] = [
    "executive_suite", "lounge", "sky_garden", "gallery",
    "lobby", "public_void", "atrium", "brand_showroom",
    "installation_space", "event_space", "rooftop_bar",
  ];
  const spatial_quality = highQualityFunctions.includes(func)
    ? 0.85
    : func === "open_office" || func === "premium_office"
      ? 0.6 + heightRatio * 0.2
      : func === "cafeteria" || func === "fitness"
        ? 0.5
        : 0.3;

  // prestige: height * function weight
  const prestigeWeights: Partial<Record<NodeFunction, number>> = {
    executive_suite: 0.9,
    premium_office: 0.7,
    lounge: 0.8,
    rooftop_bar: 0.9,
    sky_garden: 0.85,
    brand_showroom: 0.8,
    flagship_store: 0.75,
    lobby: 0.6,
    open_office: 0.4,
  };
  const funcWeight = prestigeWeights[func] ?? 0.3;
  const prestige = Math.min(1, heightRatio * 0.4 + funcWeight * 0.6);

  // flexibility: open_office high, core low
  const flexibilityMap: Partial<Record<NodeFunction, number>> = {
    open_office: 0.9,
    coworking: 0.85,
    premium_office: 0.7,
    meeting_room: 0.6,
    conference: 0.5,
    event_space: 0.7,
    community_space: 0.65,
    elevator_core: 0.05,
    stairwell: 0.05,
    service_shaft: 0.05,
    mechanical_room: 0.1,
    server_room: 0.1,
  };
  const flexibility = flexibilityMap[func] ?? 0.4;

  return {
    view_premium: round2(view_premium),
    publicity: round2(publicity),
    brand_expression: round2(brand_expression),
    spatial_quality: round2(spatial_quality),
    prestige: round2(prestige),
    flexibility: round2(flexibility),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================
// Default Adjacency Rules (Corporate HQ)
// ============================================================

export function getDefaultAdjacencyRules(): AdjacencyRule[] {
  return [
    // Positive adjacencies
    { source: "elevator_core", target: "elevator_lobby", type: "positive", weight: 1.0, reason: "Core must connect to lobby" },
    { source: "elevator_core", target: "open_office", type: "positive", weight: 0.8, reason: "Office needs core access" },
    { source: "elevator_core", target: "premium_office", type: "positive", weight: 0.8, reason: "Premium office needs core access" },
    { source: "lobby", target: "retail", type: "positive", weight: 0.8, reason: "Retail benefits from lobby proximity" },
    { source: "lobby", target: "brand_showroom", type: "positive", weight: 0.9, reason: "Brand showroom anchors the lobby experience" },
    { source: "retail", target: "public_void", type: "positive", weight: 0.7, reason: "Retail benefits from public space" },
    { source: "retail", target: "experiential_retail", type: "positive", weight: 0.7, reason: "Retail and experience spaces complement" },
    { source: "brand_showroom", target: "gallery", type: "positive", weight: 0.7, reason: "Showroom and gallery create brand experience" },
    { source: "restaurant", target: "lounge", type: "positive", weight: 0.6, reason: "Dining pairs with lounge" },
    { source: "cafeteria", target: "open_office", type: "positive", weight: 0.7, reason: "Cafeteria serves office workers" },
    { source: "meeting_room", target: "open_office", type: "positive", weight: 0.8, reason: "Meeting rooms near offices" },
    { source: "stairwell", target: "elevator_core", type: "positive", weight: 0.9, reason: "Egress near core" },

    // Negative adjacencies
    { source: "parking", target: "executive_suite", type: "negative", weight: 0.9, reason: "Parking noise/fumes incompatible with executive" },
    { source: "parking", target: "brand_showroom", type: "negative", weight: 1.0, reason: "Parking incompatible with brand experience" },
    { source: "mechanical_room", target: "meditation_room", type: "negative", weight: 0.8, reason: "Mechanical noise disturbs meditation" },
    { source: "mechanical_room", target: "executive_suite", type: "negative", weight: 0.7, reason: "Mechanical noise disturbs executives" },
    { source: "loading_dock", target: "lobby", type: "negative", weight: 0.8, reason: "Service areas separated from main entry" },
    { source: "loading_dock", target: "brand_showroom", type: "negative", weight: 0.9, reason: "Service areas away from brand spaces" },
    { source: "server_room", target: "gallery", type: "negative", weight: 0.6, reason: "Server heat/noise away from gallery" },
  ];
}

// ============================================================
// Special Floor Detection (Corporate HQ — simplified)
// ============================================================

export function getRefugeFloors(_totalFloors: number, _interval: number = 25): number[] {
  // Corporate HQ (under 20 floors) typically doesn't require refuge floors
  return [];
}

export function getMechanicalFloors(totalFloors: number, _interval: number = 20): number[] {
  // For corporate HQ, mechanical is typically in basement or a single mid-floor
  if (totalFloors > 10) {
    return [Math.floor(totalFloors / 2)];
  }
  return [];
}

export function getOutriggerFloors(_totalFloors: number, _interval: number = 25): number[] {
  // Corporate HQ (mid-rise) doesn't need outriggers
  return [];
}
