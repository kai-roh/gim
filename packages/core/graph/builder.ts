// ============================================================
// Program Graph → Vertical Node Graph Builder
// Core transformation: ProgramGraph + GlobalGraph → FloorNodes + VoxelEdges
// ============================================================

import type {
  GlobalGraph,
  ProgramGraph,
  VerticalNodeGraph,
  FloorNode,
  VoxelEdge,
  FloorZone,
  NodeFunction,
  FloorPosition,
  DesignRules,
  ConsensusZone,
} from "./types";
import {
  classifyFloorZone,
  computeAbstractProperties,
  getDefaultRules,
  getRefugeFloors,
  getMechanicalFloors,
  getOutriggerFloors,
} from "./rules";

// ============================================================
// Main Builder
// ============================================================

export function buildVerticalNodeGraph(
  global: GlobalGraph,
  program: ProgramGraph,
  consensusZones?: ConsensusZone[],
  rules?: DesignRules
): VerticalNodeGraph {
  const effectiveRules = rules ?? getDefaultRules();
  const totalFloors = global.total_floors;
  const basementFloors = global.basement_floors;

  const floorFunctionMap = buildFloorFunctionMap(
    program, consensusZones, totalFloors, basementFloors
  );

  const nodes = createFloorNodes(floorFunctionMap, totalFloors, basementFloors, effectiveRules);
  const edges = createEdges(nodes, totalFloors, effectiveRules, global);

  validateAgainstProgram(program, nodes, edges);

  return {
    global, program, nodes, edges,
    metadata: {
      created_at: new Date().toISOString(),
      source_forum: "forum_result",
      total_nodes: nodes.length,
      total_edges: edges.length,
      floor_range: [-basementFloors, totalFloors],
    },
  };
}

// ============================================================
// Floor Function Map
// ============================================================

interface FloorAssignment {
  zone: FloorZone;
  primaryFunction: NodeFunction;
  tags: string[];
}

function buildFloorFunctionMap(
  program: ProgramGraph,
  consensusZones: ConsensusZone[] | undefined,
  totalFloors: number,
  basementFloors: number
): Map<number, FloorAssignment> {
  const map = new Map<number, FloorAssignment>();

  if (consensusZones && consensusZones.length > 0) {
    for (const cz of consensusZones) {
      map.set(cz.floor, {
        zone: cz.zone,
        primaryFunction: cz.function,
        tags: cz.sources,
      });
    }
  } else {
    for (const pn of program.nodes) {
      for (let f = pn.floor_range[0]; f <= pn.floor_range[1]; f++) {
        if (!map.has(f)) {
          map.set(f, { zone: pn.target_zone, primaryFunction: pn.program_type, tags: [] });
        }
      }
    }
  }

  for (let f = -basementFloors; f <= totalFloors; f++) {
    if (!map.has(f)) {
      const zone = classifyFloorZone(f, totalFloors);
      const func = getDefaultFunctionForZone(zone);
      map.set(f, { zone, primaryFunction: func, tags: [] });
    }
  }

  return map;
}

function getDefaultFunctionForZone(zone: FloorZone): NodeFunction {
  switch (zone) {
    case "basement": return "parking";
    case "podium": return "retail";
    case "low_rise": return "premium_office";
    case "mid_rise": return "open_office";
    case "sky_lobby": return "elevator_lobby";
    case "high_rise": return "hotel_room";
    case "mechanical": return "mechanical_room";
    case "crown": return "sky_lounge";
    case "rooftop": return "observation_deck";
  }
}

// ============================================================
// Horizontal Node Templates
// Defines what spatial nodes each floor type should have
// ============================================================

interface HorizontalNodeSpec {
  function: NodeFunction;
  position: FloorPosition;
  tags: string[];
}

// Each zone/primary function combination expands into a full floor plan
function getFloorTemplate(zone: FloorZone, primaryFunc: NodeFunction): HorizontalNodeSpec[] {
  // Core nodes present on every floor
  const coreSpine: HorizontalNodeSpec[] = [
    { function: "elevator_core",  position: "center",    tags: ["core", "vertical_circulation"] },
    { function: "stairwell",      position: "north",     tags: ["egress", "fire_safety"] },
    { function: "stairwell",      position: "south",     tags: ["egress", "fire_safety"] },
    { function: "service_shaft",  position: "east",      tags: ["MEP", "vertical_service"] },
    { function: "elevator_lobby", position: "center",    tags: ["circulation", "transition"] },
  ];

  switch (zone) {
    case "basement":
      return [
        ...coreSpine,
        { function: "parking",         position: "west",      tags: ["vehicular"] },
        { function: "parking",         position: "southwest", tags: ["vehicular"] },
        { function: "loading_dock",    position: "northwest", tags: ["service", "logistics"] },
        { function: "mechanical_room", position: "southeast", tags: ["MEP", "infrastructure"] },
        { function: "electrical_room", position: "northeast", tags: ["MEP", "power"] },
      ];

    case "podium":
      if (primaryFunc === "retail" || primaryFunc === "cultural_facility") {
        return [
          ...coreSpine,
          { function: "retail",            position: "south",     tags: ["commercial", "street_facing"] },
          { function: "retail",            position: "west",      tags: ["commercial", "park_facing"] },
          { function: "cultural_facility", position: "southwest", tags: ["public", "exhibition"] },
          { function: "public_void",       position: "center",    tags: ["atrium", "public_space"] },
          { function: "restaurant",        position: "northwest", tags: ["F&B", "amenity"] },
        ];
      }
      return [
        ...coreSpine,
        { function: primaryFunc,     position: "south",     tags: ["primary"] },
        { function: "public_void",   position: "center",    tags: ["atrium"] },
        { function: "retail",        position: "west",      tags: ["commercial"] },
      ];

    case "low_rise":
      return [
        ...coreSpine,
        { function: "premium_office", position: "south",     tags: ["primary", "river_view"] },
        { function: "premium_office", position: "west",      tags: ["primary", "park_view"] },
        { function: "conference",     position: "north",     tags: ["meeting", "shared"] },
        { function: "executive_suite",position: "southeast", tags: ["premium", "corner_unit"] },
      ];

    case "mid_rise":
      return [
        ...coreSpine,
        { function: "open_office",    position: "south",     tags: ["primary", "river_view"] },
        { function: "open_office",    position: "west",      tags: ["primary", "park_view"] },
        { function: "open_office",    position: "north",     tags: ["primary", "road_facing"] },
        { function: "conference",     position: "northeast", tags: ["meeting", "shared"] },
        { function: "coworking",      position: "northwest", tags: ["flexible", "shared"] },
      ];

    case "sky_lobby":
      return [
        ...coreSpine,
        { function: "sky_lounge",     position: "south",     tags: ["public", "vista", "river_view"] },
        { function: "restaurant",     position: "southwest", tags: ["F&B", "destination"] },
        { function: "sky_garden",     position: "west",      tags: ["landscape", "park_view"] },
        { function: "gallery",        position: "north",     tags: ["cultural", "exhibition"] },
        { function: "refuge_area",    position: "northeast", tags: ["safety", "refuge"] },
      ];

    case "high_rise":
      if (primaryFunc === "hotel_room" || primaryFunc === "hotel_suite") {
        return [
          ...coreSpine,
          { function: "hotel_room",   position: "south",     tags: ["guest", "river_view"] },
          { function: "hotel_room",   position: "west",      tags: ["guest", "park_view"] },
          { function: "hotel_room",   position: "north",     tags: ["guest", "city_view"] },
          { function: "hotel_suite",  position: "southeast", tags: ["premium", "corner_suite"] },
          { function: "hotel_amenity",position: "northwest", tags: ["service", "housekeeping"] },
          { function: "hotel_lobby",  position: "center",    tags: ["circulation", "reception"] },
        ];
      }
      // Office high-rise
      return [
        ...coreSpine,
        { function: "open_office",    position: "south",     tags: ["primary", "river_view"] },
        { function: "open_office",    position: "west",      tags: ["primary", "park_view"] },
        { function: "conference",     position: "north",     tags: ["meeting"] },
      ];

    case "mechanical":
      return [
        ...coreSpine,
        { function: "mechanical_room", position: "south",     tags: ["HVAC", "plant"] },
        { function: "mechanical_room", position: "north",     tags: ["HVAC", "plant"] },
        { function: "electrical_room", position: "west",      tags: ["power", "switchgear"] },
        { function: "water_tank",      position: "northwest", tags: ["water", "fire_suppression"] },
      ];

    case "crown":
      return [
        ...coreSpine,
        { function: "sky_lounge",       position: "south",     tags: ["destination", "river_panorama"] },
        { function: "observation_deck", position: "west",      tags: ["public", "park_panorama"] },
        { function: "rooftop_bar",      position: "southwest", tags: ["F&B", "premium"] },
        { function: "restaurant",       position: "southeast", tags: ["fine_dining", "destination"] },
        { function: "gallery",          position: "north",     tags: ["cultural", "exhibition"] },
      ];

    case "rooftop":
      return [
        ...coreSpine,
        { function: "observation_deck", position: "south",     tags: ["public", "panorama"] },
        { function: "sky_garden",       position: "west",      tags: ["landscape", "green"] },
        { function: "rooftop_bar",      position: "southeast", tags: ["F&B"] },
      ];
  }
}

// Special overlay nodes for certain floor conditions
function getSpecialOverlay(
  floor: number,
  isRefuge: boolean,
  isMechanical: boolean,
  isOutrigger: boolean,
): HorizontalNodeSpec[] {
  const extras: HorizontalNodeSpec[] = [];

  if (isRefuge) {
    extras.push({ function: "refuge_area", position: "northeast", tags: ["safety", "fire_code", "evacuation"] });
  }
  if (isMechanical) {
    extras.push({ function: "mechanical_room", position: "southeast", tags: ["MEP", "plant"] });
    extras.push({ function: "electrical_room", position: "east",      tags: ["MEP", "power"] });
  }
  if (isOutrigger) {
    extras.push({ function: "outrigger",  position: "north",     tags: ["structural", "lateral_system"] });
    extras.push({ function: "belt_truss", position: "south",     tags: ["structural", "belt"] });
  }

  return extras;
}

// ============================================================
// Floor Node Creation
// ============================================================

function createFloorNodes(
  floorMap: Map<number, FloorAssignment>,
  totalFloors: number,
  _basementFloors: number,
  rules: DesignRules
): FloorNode[] {
  const nodes: FloorNode[] = [];

  const refugeFloors = new Set(getRefugeFloors(totalFloors, rules.structural.refuge_interval));
  const mechFloors = new Set(getMechanicalFloors(totalFloors, rules.structural.mechanical_interval[0]));
  const outriggerFloors = new Set(getOutriggerFloors(totalFloors, rules.structural.outrigger_interval[0]));

  const allFloors = Array.from(floorMap.keys()).sort((a, b) => a - b);

  // Track used IDs to avoid duplicates when two stairwells or two offices exist
  const usedIds = new Set<string>();

  for (const floor of allFloors) {
    const assignment = floorMap.get(floor)!;
    const isRefuge = refugeFloors.has(floor);
    const isMech = mechFloors.has(floor);
    const isOutrigger = outriggerFloors.has(floor);

    // Get the full floor template based on zone
    const template = getFloorTemplate(assignment.zone, assignment.primaryFunction);

    // Add special overlay nodes
    const specials = getSpecialOverlay(floor, isRefuge, isMech, isOutrigger);

    // Merge: template + specials, dedup by function+position
    const allSpecs = [...template, ...specials];
    const seen = new Set<string>();

    for (const spec of allSpecs) {
      const dedupKey = `${spec.function}_${spec.position}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const node = createNode(floor, spec.function, spec.position, assignment.zone, totalFloors, spec.tags, usedIds);
      nodes.push(node);
    }
  }

  return nodes;
}

function createNode(
  floor: number,
  func: NodeFunction,
  position: FloorPosition,
  zone: FloorZone,
  totalFloors: number,
  tags: string[],
  usedIds: Set<string>,
): FloorNode {
  const floorLabel = floor < 0 ? `B${Math.abs(floor)}` : `F${floor}`;
  let id = `${floorLabel}_${func}`;

  // If ID already used (e.g. two stairwells), append position suffix
  if (usedIds.has(id)) {
    id = `${floorLabel}_${func}_${position}`;
  }
  // If still duplicated, append counter
  if (usedIds.has(id)) {
    let c = 2;
    while (usedIds.has(`${id}_${c}`)) c++;
    id = `${id}_${c}`;
  }
  usedIds.add(id);

  const name = `${floorLabel} ${func.replace(/_/g, " ")} (${position})`;

  return {
    id,
    name,
    floor_level: floor,
    floor_zone: zone,
    function: func,
    position,
    constraints: [],
    abstract: computeAbstractProperties({ floor_level: floor, floor_zone: zone, function: func }, totalFloors),
    tags,
    geometry_ref: undefined,
  };
}

// ============================================================
// Edge Creation
// ============================================================

function createEdges(
  nodes: FloorNode[],
  totalFloors: number,
  rules: DesignRules,
  global: GlobalGraph
): VoxelEdge[] {
  const edges: VoxelEdge[] = [];
  const nodesByFloor = groupByFloor(nodes);
  const floors = Array.from(nodesByFloor.keys()).sort((a, b) => a - b);

  // 1. STACKED_ON: consecutive floors, same function + same position
  for (let i = 1; i < floors.length; i++) {
    const lowerFloor = floors[i - 1];
    const upperFloor = floors[i];
    const lowerNodes = nodesByFloor.get(lowerFloor)!;
    const upperNodes = nodesByFloor.get(upperFloor)!;

    for (const lower of lowerNodes) {
      for (const upper of upperNodes) {
        if (lower.function === upper.function && lower.position === upper.position) {
          edges.push({
            source: lower.id, target: upper.id, type: "STACKED_ON",
            properties: { floor_gap: upperFloor - lowerFloor, position: lower.position },
          });
        }
      }
    }
  }

  // 2. ADJACENT_TO: same floor, spatially neighboring positions
  for (const [_floor, floorNodes] of nodesByFloor) {
    for (let i = 0; i < floorNodes.length; i++) {
      for (let j = i + 1; j < floorNodes.length; j++) {
        const a = floorNodes[i];
        const b = floorNodes[j];
        if (arePositionsAdjacent(a.position, b.position) || a.position === "center" || b.position === "center") {
          edges.push({
            source: a.id, target: b.id, type: "ADJACENT_TO",
            properties: { floor: a.floor_level, from_pos: a.position, to_pos: b.position },
          });
        }
      }
    }
  }

  // 3. VERTICAL_CONNECT: sky_lobby zones only (not every floor with elevator_lobby)
  const skyLobbyFloors = floors.filter((f) => {
    return nodesByFloor.get(f)!.some((n) => n.floor_zone === "sky_lobby");
  });
  // Connect ground floor (0 or 1) to each sky lobby, and sky lobbies to each other
  const groundFloor = floors.find((f) => f === 1) ?? floors.find((f) => f === 0) ?? floors[0];
  const connectFloors = [groundFloor, ...skyLobbyFloors.filter((f) => f !== groundFloor)];
  for (let i = 0; i < connectFloors.length; i++) {
    for (let j = i + 1; j < connectFloors.length; j++) {
      const fromCore = nodesByFloor.get(connectFloors[i])!.find((n) => n.function === "elevator_core");
      const toCore = nodesByFloor.get(connectFloors[j])!.find((n) => n.function === "elevator_core");
      if (fromCore && toCore) {
        edges.push({
          source: fromCore.id, target: toCore.id, type: "VERTICAL_CONNECT",
          properties: { connection: "express_elevator" },
        });
      }
    }
  }

  // 4. SERVED_BY: mechanical floors serve ±15 floors
  const mechFloors = floors.filter((f) =>
    nodesByFloor.get(f)!.some((n) => n.function === "mechanical_room")
  );
  for (const mechFloor of mechFloors) {
    const mechNode = nodesByFloor.get(mechFloor)!.find((n) => n.function === "mechanical_room");
    if (!mechNode) continue;
    for (const f of floors) {
      if (f === mechFloor) continue;
      if (Math.abs(f - mechFloor) <= 15) {
        // Serve the service_shaft on each floor (the mechanical duct)
        const shaftNode = nodesByFloor.get(f)!.find((n) => n.function === "service_shaft");
        if (shaftNode) {
          edges.push({
            source: mechNode.id, target: shaftNode.id, type: "SERVED_BY",
            properties: { distance: Math.abs(f - mechFloor) },
          });
        }
      }
    }
  }

  // 5. ZONE_BOUNDARY: where zone changes
  for (let i = 1; i < floors.length; i++) {
    const lowerNodes = nodesByFloor.get(floors[i - 1])!;
    const upperNodes = nodesByFloor.get(floors[i])!;
    const lowerZone = lowerNodes[0]?.floor_zone;
    const upperZone = upperNodes[0]?.floor_zone;

    if (lowerZone && upperZone && lowerZone !== upperZone) {
      const lowerLobby = lowerNodes.find((n) => n.function === "elevator_lobby") ?? lowerNodes[0];
      const upperLobby = upperNodes.find((n) => n.function === "elevator_lobby") ?? upperNodes[0];
      edges.push({
        source: lowerLobby.id, target: upperLobby.id, type: "ZONE_BOUNDARY",
        properties: { from_zone: lowerZone, to_zone: upperZone },
      });
    }
  }

  // 6. FACES: directional edges — connect south-positioned nodes to south context, etc.
  const directionMap: Record<string, { context: string; positions: FloorPosition[] }> = {
    south: { context: global.site.context.south, positions: ["south", "southeast", "southwest"] },
    north: { context: global.site.context.north, positions: ["north", "northeast", "northwest"] },
    east:  { context: global.site.context.east,  positions: ["east", "northeast", "southeast"] },
    west:  { context: global.site.context.west,  positions: ["west", "northwest", "southwest"] },
  };

  // Every 5th floor (more granular than before)
  const representativeFloors = floors.filter((f) => f <= 1 || f === totalFloors || f % 5 === 0);
  for (const f of representativeFloors) {
    const floorNodes = nodesByFloor.get(f)!;
    for (const [dir, info] of Object.entries(directionMap)) {
      const facingNode = floorNodes.find((n) => info.positions.includes(n.position) && n.function !== "stairwell" && n.function !== "service_shaft");
      if (facingNode) {
        edges.push({
          source: facingNode.id, target: `EXTERIOR_${dir.toUpperCase()}`, type: "FACES",
          properties: { direction: dir, context: info.context, floor: f },
        });
      }
    }
  }

  // 7. STRUCTURAL_TRANSFER: outrigger/belt_truss → core
  for (const f of floors) {
    const floorNodes = nodesByFloor.get(f)!;
    const structuralNodes = floorNodes.filter((n) => n.function === "outrigger" || n.function === "belt_truss");
    const coreNode = floorNodes.find((n) => n.function === "elevator_core");
    if (coreNode) {
      for (const sn of structuralNodes) {
        edges.push({
          source: sn.id, target: coreNode.id, type: "STRUCTURAL_TRANSFER",
          properties: { type: sn.function + "_to_core" },
        });
      }
    }
  }

  return edges;
}

// ============================================================
// Position Adjacency Rules
// ============================================================

const ADJACENCY_MAP: Record<FloorPosition, FloorPosition[]> = {
  center:    ["north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest"],
  north:     ["center", "northeast", "northwest"],
  south:     ["center", "southeast", "southwest"],
  east:      ["center", "northeast", "southeast"],
  west:      ["center", "northwest", "southwest"],
  northeast: ["north", "east", "center"],
  northwest: ["north", "west", "center"],
  southeast: ["south", "east", "center"],
  southwest: ["south", "west", "center"],
};

function arePositionsAdjacent(a: FloorPosition, b: FloorPosition): boolean {
  return ADJACENCY_MAP[a]?.includes(b) ?? false;
}

function groupByFloor(nodes: FloorNode[]): Map<number, FloorNode[]> {
  const map = new Map<number, FloorNode[]>();
  for (const node of nodes) {
    if (!map.has(node.floor_level)) map.set(node.floor_level, []);
    map.get(node.floor_level)!.push(node);
  }
  return map;
}

// ============================================================
// Validation
// ============================================================

function validateAgainstProgram(
  program: ProgramGraph,
  nodes: FloorNode[],
  edges: VoxelEdge[]
): void {
  const positiveEdges = program.edges.filter((e) => e.type === "ADJACENCY_POSITIVE");
  let satisfied = 0;

  for (const pe of positiveEdges) {
    const sourceProgram = program.nodes.find((n) => n.id === pe.source);
    const targetProgram = program.nodes.find((n) => n.id === pe.target);
    if (!sourceProgram || !targetProgram) continue;

    const sourceFloorNodes = nodes.filter((n) => n.function === sourceProgram.program_type);
    const targetFloorNodes = nodes.filter((n) => n.function === targetProgram.program_type);

    const hasAdjacency = edges.some(
      (e) =>
        (e.type === "ADJACENT_TO" || e.type === "STACKED_ON") &&
        ((sourceFloorNodes.some((s) => s.id === e.source) &&
          targetFloorNodes.some((t) => t.id === e.target)) ||
          (sourceFloorNodes.some((s) => s.id === e.target) &&
            targetFloorNodes.some((t) => t.id === e.source)))
    );

    if (hasAdjacency) {
      satisfied++;
    } else {
      console.warn(
        `[WARN] Positive adjacency not satisfied: ${pe.source} ↔ ${pe.target} (${pe.rationale})`
      );
    }
  }

  if (positiveEdges.length > 0) {
    const rate = (satisfied / positiveEdges.length * 100).toFixed(1);
    console.log(`[Validation] Positive adjacency satisfaction: ${satisfied}/${positiveEdges.length} (${rate}%)`);
  }
}
