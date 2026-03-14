// ============================================================
// Supertall Design Rule Engine
// Encodes architectural rules from Tech Spec Chapter 6
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
      outrigger_interval: [20, 30],   // floors between outriggers
      mechanical_interval: [15, 25],  // floors between mechanical floors
      refuge_interval: 25,            // max floors between refuge areas
    },
    vertical_zoning: {
      floor_heights: {
        parking: 3.6,
        retail: 5.0,
        cultural_facility: 6.0,
        public_void: 15.0,
        open_office: 4.1,
        premium_office: 4.2,
        executive_suite: 4.5,
        coworking: 4.0,
        hotel_room: 3.4,
        hotel_suite: 3.6,
        hotel_lobby: 6.0,
        hotel_amenity: 4.0,
        sky_garden: 8.0,
        sky_lounge: 5.0,
        observation_deck: 5.0,
        refuge_area: 4.0,
        mechanical_room: 5.5,
        electrical_room: 4.0,
        water_tank: 4.5,
        elevator_core: 4.1,
        stairwell: 4.1,
        elevator_lobby: 4.1,
        service_shaft: 4.1,
        conference: 4.0,
        fitness: 4.5,
        spa: 4.0,
        library: 4.5,
        gallery: 5.0,
        rooftop_bar: 4.5,
        loading_dock: 4.5,
        outrigger: 5.5,
        belt_truss: 5.5,
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
  return rules.vertical_zoning.floor_heights[func] ?? 4.1;
}

// ============================================================
// Floor Zone Classification
// ============================================================

export function classifyFloorZone(floor: number, totalFloors: number): FloorZone {
  if (floor < 0) return "basement";
  if (floor === 0) return "podium";

  const ratio = floor / totalFloors;

  if (floor <= 5) return "podium";
  if (ratio <= 0.23) return "low_rise";
  if (ratio <= 0.55) return "mid_rise";
  if (ratio <= 0.60) return "sky_lobby";
  if (ratio <= 0.88) return "high_rise";
  if (ratio <= 0.93) return "mechanical";
  return "crown";
}

// ============================================================
// Abstract Properties Computation
// ============================================================

export function computeAbstractProperties(
  node: Pick<FloorNode, "floor_level" | "floor_zone" | "function">,
  totalFloors: number
): AbstractProperties {
  const heightRatio = Math.max(0, node.floor_level) / totalFloors;
  const func = node.function;
  const zone = node.floor_zone;

  // view_premium: proportional to height, south-facing bonus
  const view_premium = Math.min(1, heightRatio * 1.1 + (zone === "crown" ? 0.1 : 0));

  // publicity: high for podium/lobby/public spaces, low for hotel/office
  const publicFunctions: NodeFunction[] = [
    "public_void", "sky_garden", "observation_deck", "sky_lounge",
    "refuge_area", "retail", "cultural_facility", "gallery",
  ];
  const publicity = publicFunctions.includes(func)
    ? 0.8 + (zone === "podium" ? 0.2 : 0)
    : zone === "podium"
      ? 0.6
      : func === "elevator_lobby" || func === "hotel_lobby"
        ? 0.5
        : 0.2;

  // structural_load: higher at lower floors, spike at outrigger
  const baseLoad = Math.max(0.1, 1 - heightRatio * 0.8);
  const structural_load =
    func === "outrigger" || func === "belt_truss"
      ? Math.min(1, baseLoad + 0.3)
      : baseLoad;

  // vertical_flow: high for core/lobby
  const coreFunctions: NodeFunction[] = [
    "elevator_core", "stairwell", "elevator_lobby", "service_shaft",
  ];
  const vertical_flow = coreFunctions.includes(func)
    ? 0.9
    : func === "hotel_lobby" || func === "sky_lounge"
      ? 0.7
      : zone === "sky_lobby"
        ? 0.8
        : 0.3;

  // prestige: height * function weight
  const prestigeWeights: Partial<Record<NodeFunction, number>> = {
    executive_suite: 0.9,
    hotel_suite: 0.85,
    premium_office: 0.7,
    sky_lounge: 0.95,
    observation_deck: 1.0,
    rooftop_bar: 0.9,
    hotel_room: 0.6,
    open_office: 0.4,
  };
  const funcWeight = prestigeWeights[func] ?? 0.3;
  const prestige = Math.min(1, heightRatio * 0.5 + funcWeight * 0.5);

  // flexibility: open_office high, core low
  const flexibilityMap: Partial<Record<NodeFunction, number>> = {
    open_office: 0.9,
    coworking: 0.85,
    premium_office: 0.7,
    conference: 0.6,
    hotel_room: 0.3,
    elevator_core: 0.05,
    stairwell: 0.05,
    service_shaft: 0.05,
    outrigger: 0.0,
    belt_truss: 0.0,
    mechanical_room: 0.1,
  };
  const flexibility = flexibilityMap[func] ?? 0.4;

  return {
    view_premium: round2(view_premium),
    publicity: round2(publicity),
    structural_load: round2(structural_load),
    vertical_flow: round2(vertical_flow),
    prestige: round2(prestige),
    flexibility: round2(flexibility),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================
// Default Adjacency Rules
// ============================================================

export function getDefaultAdjacencyRules(): AdjacencyRule[] {
  return [
    // Positive adjacencies
    { source: "elevator_core", target: "elevator_lobby", type: "positive", weight: 1.0, reason: "Core must connect to lobby" },
    { source: "elevator_core", target: "open_office", type: "positive", weight: 0.8, reason: "Office needs core access" },
    { source: "elevator_core", target: "hotel_room", type: "positive", weight: 0.8, reason: "Hotel rooms need core access" },
    { source: "elevator_core", target: "premium_office", type: "positive", weight: 0.8, reason: "Premium office needs core access" },
    { source: "hotel_lobby", target: "hotel_room", type: "positive", weight: 0.9, reason: "Hotel lobby serves rooms" },
    { source: "retail", target: "public_void", type: "positive", weight: 0.7, reason: "Retail benefits from public space" },
    { source: "retail", target: "cultural_facility", type: "positive", weight: 0.6, reason: "Cultural facility draws retail traffic" },
    { source: "restaurant", target: "sky_lounge", type: "positive", weight: 0.7, reason: "Dining pairs with lounge" },
    { source: "mechanical_room", target: "outrigger", type: "positive", weight: 0.9, reason: "Mechanical floors at outrigger levels" },
    { source: "refuge_area", target: "stairwell", type: "positive", weight: 1.0, reason: "Refuge must be near stairs" },
    { source: "observation_deck", target: "sky_lounge", type: "positive", weight: 0.8, reason: "Observation pairs with lounge" },

    // Negative adjacencies
    { source: "parking", target: "hotel_room", type: "negative", weight: 0.9, reason: "Parking noise/fumes incompatible with hotel" },
    { source: "parking", target: "hotel_suite", type: "negative", weight: 1.0, reason: "Parking incompatible with premium hotel" },
    { source: "mechanical_room", target: "hotel_room", type: "negative", weight: 0.7, reason: "Mechanical noise disturbs hotel" },
    { source: "mechanical_room", target: "hotel_suite", type: "negative", weight: 0.8, reason: "Mechanical noise disturbs suite" },
    { source: "loading_dock", target: "hotel_lobby", type: "negative", weight: 0.8, reason: "Service areas separated from hotel entry" },
    { source: "loading_dock", target: "sky_lounge", type: "negative", weight: 0.9, reason: "Service areas away from premium spaces" },
  ];
}

// ============================================================
// Special Floor Detection
// ============================================================

export function getRefugeFloors(totalFloors: number, interval: number = 25): number[] {
  const floors: number[] = [];
  for (let f = interval; f < totalFloors; f += interval) {
    floors.push(f);
  }
  return floors;
}

export function getMechanicalFloors(totalFloors: number, interval: number = 20): number[] {
  const floors: number[] = [];
  for (let f = interval; f < totalFloors; f += interval) {
    floors.push(f);
  }
  return floors;
}

export function getOutriggerFloors(totalFloors: number, interval: number = 25): number[] {
  const floors: number[] = [];
  for (let f = interval; f < totalFloors; f += interval) {
    floors.push(f);
  }
  return floors;
}
