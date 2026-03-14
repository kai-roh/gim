// ============================================================
// Program Graph → Vertical Node Graph Builder
// Core transformation: ProgramGraph + GlobalGraph → FloorNodes + VoxelEdges
// Optimized for Corporate HQ (5~20 floors)
// ============================================================

import type {
  GlobalGraph,
  ProgramGraph,
  VerticalNodeGraph,
  FloorNode,
  FloorPlateData,
  FloorGeometry,
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
} from "./rules";
import {
  getDominantFormDNA,
  getFloorFormDNA,
  generateFloorOutline,
  isInVoidCut,
  shouldHaveTerrace,
} from "../form/architect-form";

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
  computeFloorGeometries(nodes, global);
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
  styleRef?: string;
}

function buildFloorFunctionMap(
  program: ProgramGraph,
  consensusZones: ConsensusZone[] | undefined,
  totalFloors: number,
  basementFloors: number
): Map<number, FloorAssignment> {
  const map = new Map<number, FloorAssignment>();

  if (consensusZones && consensusZones.length > 0) {
    // Count architect votes across all zones to find dominant style
    const architectVotes = new Map<string, number>();
    for (const cz of consensusZones) {
      for (const src of cz.sources) {
        architectVotes.set(src, (architectVotes.get(src) || 0) + cz.votes);
      }
    }
    // Pick dominant architect as default style_ref
    let dominantArchitect = "";
    let maxVotes = 0;
    for (const [arch, votes] of architectVotes) {
      if (votes > maxVotes) { maxVotes = votes; dominantArchitect = arch; }
    }

    for (const cz of consensusZones) {
      if (cz.floor === 0) continue; // No 0F — buildings go B1 → 1F
      // Per-floor style: use the top-voted source for this zone, fallback to dominant
      const floorStyle = cz.sources.length > 0 ? cz.sources[0] : dominantArchitect;
      map.set(cz.floor, {
        zone: cz.zone,
        primaryFunction: cz.function,
        tags: cz.sources,
        styleRef: floorStyle || undefined,
      });
    }
  } else {
    for (const pn of program.nodes) {
      for (let f = pn.floor_range[0]; f <= pn.floor_range[1]; f++) {
        if (f === 0) continue; // No 0F
        if (!map.has(f)) {
          map.set(f, { zone: pn.target_zone, primaryFunction: pn.program_type, tags: [] });
        }
      }
    }
  }

  for (let f = -basementFloors; f <= totalFloors; f++) {
    if (f === 0) continue; // No 0F — buildings go B1 → 1F
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
    case "ground": return "lobby";
    case "lower": return "brand_showroom";
    case "middle": return "open_office";
    case "upper": return "premium_office";
    case "penthouse": return "executive_suite";
    case "rooftop": return "sky_garden";
  }
}

// ============================================================
// Horizontal Node Templates (Corporate HQ)
// ============================================================

interface HorizontalNodeSpec {
  function: NodeFunction;
  position: FloorPosition;
  tags: string[];
}

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

    case "ground":
      return [
        ...coreSpine,
        { function: "lobby",               position: "south",     tags: ["entrance", "brand_experience"] },
        { function: "brand_showroom",      position: "west",      tags: ["brand", "experience"] },
        { function: "experiential_retail", position: "southwest", tags: ["retail", "experience"] },
        { function: "public_void",         position: "center",    tags: ["atrium", "public_space"] },
        { function: "cafe",                position: "northwest", tags: ["F&B", "casual"] },
      ];

    case "lower":
      if (primaryFunc === "brand_showroom" || primaryFunc === "experiential_retail" || primaryFunc === "exhibition_hall") {
        return [
          ...coreSpine,
          { function: "brand_showroom",      position: "south",     tags: ["brand", "experience"] },
          { function: "experiential_retail", position: "west",      tags: ["retail", "interactive"] },
          { function: "gallery",             position: "southwest", tags: ["exhibition", "art"] },
          { function: "installation_space",  position: "northwest", tags: ["art", "immersive"] },
        ];
      }
      return [
        ...coreSpine,
        { function: primaryFunc,     position: "south",     tags: ["primary"] },
        { function: "gallery",       position: "west",      tags: ["exhibition"] },
        { function: "retail",        position: "southwest", tags: ["commercial"] },
      ];

    case "middle":
      if (primaryFunc === "cafeteria" || primaryFunc === "fitness") {
        return [
          ...coreSpine,
          { function: "cafeteria",     position: "south",     tags: ["F&B", "social"] },
          { function: "fitness",       position: "west",      tags: ["wellness"] },
          { function: "community_space", position: "northwest", tags: ["social", "flexible"] },
          { function: "meeting_room",  position: "northeast", tags: ["meeting", "shared"] },
        ];
      }
      return [
        ...coreSpine,
        { function: "open_office",    position: "south",     tags: ["primary", "views"] },
        { function: "open_office",    position: "west",      tags: ["primary"] },
        { function: "open_office",    position: "north",     tags: ["primary"] },
        { function: "meeting_room",   position: "northeast", tags: ["meeting", "shared"] },
        { function: "coworking",      position: "northwest", tags: ["flexible", "shared"] },
      ];

    case "upper":
      return [
        ...coreSpine,
        { function: "premium_office", position: "south",     tags: ["primary", "views"] },
        { function: "premium_office", position: "west",      tags: ["primary"] },
        { function: "conference",     position: "north",     tags: ["meeting"] },
        { function: "focus_room",     position: "northeast", tags: ["focus", "quiet"] },
      ];

    case "penthouse":
      return [
        ...coreSpine,
        { function: "executive_suite", position: "south",     tags: ["premium", "corner_suite"] },
        { function: "lounge",          position: "southwest", tags: ["social", "premium"] },
        { function: "meeting_room",    position: "north",     tags: ["meeting", "executive"] },
        { function: "meditation_room", position: "northwest", tags: ["wellness", "quiet"] },
      ];

    case "rooftop":
      return [
        ...coreSpine,
        { function: "sky_garden",     position: "south",     tags: ["landscape", "green"] },
        { function: "event_space",    position: "west",      tags: ["event", "flexible"] },
        { function: "rooftop_bar",    position: "southeast", tags: ["F&B", "premium"] },
        { function: "lounge",         position: "northwest", tags: ["social", "relaxation"] },
      ];
  }
}

// ============================================================
// Floor Node Creation
// ============================================================

function createFloorNodes(
  floorMap: Map<number, FloorAssignment>,
  totalFloors: number,
  _basementFloors: number,
  _rules: DesignRules
): FloorNode[] {
  const nodes: FloorNode[] = [];

  const allFloors = Array.from(floorMap.keys()).sort((a, b) => a - b);
  const usedIds = new Set<string>();

  for (const floor of allFloors) {
    const assignment = floorMap.get(floor)!;

    const template = getFloorTemplate(assignment.zone, assignment.primaryFunction);
    const seen = new Set<string>();

    for (const spec of template) {
      const dedupKey = `${spec.function}_${spec.position}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const node = createNode(floor, spec.function, spec.position, assignment.zone, totalFloors, spec.tags, usedIds, assignment.styleRef);
      nodes.push(node);
    }
  }

  return nodes;
}

// Area estimates by function (m²)
const FUNC_AREA: Record<string, number> = {
  elevator_core: 25, stairwell: 12, elevator_lobby: 30, service_shaft: 8,
  open_office: 180, premium_office: 120, executive_suite: 80, coworking: 100, focus_room: 20,
  brand_showroom: 200, exhibition_hall: 250, experiential_retail: 160, gallery: 140, installation_space: 120,
  retail: 100, restaurant: 120, cafe: 60, flagship_store: 200,
  lobby: 250, public_void: 150, atrium: 200, community_space: 100, event_space: 180,
  lounge: 80, rooftop_bar: 60, sky_garden: 300, fitness: 100, library: 80, meditation_room: 40,
  cafeteria: 200, meeting_room: 40, conference: 80, auditorium: 200, nursery: 60,
  mechanical_room: 80, electrical_room: 40, server_room: 30,
  parking: 400, loading_dock: 120, bicycle_storage: 50,
};

// Ceiling heights by function (meters)
const FUNC_CEILING: Record<string, number> = {
  lobby: 6.0, public_void: 8.0, atrium: 10.0, brand_showroom: 5.5,
  exhibition_hall: 5.5, experiential_retail: 5.0, installation_space: 6.0,
  sky_garden: 4.0, event_space: 5.0, auditorium: 6.0,
  parking: 3.0, loading_dock: 4.5, mechanical_room: 4.5,
};

// Zone default ceiling heights (meters)
const ZONE_CEILING: Record<string, number> = {
  basement: 3.5, ground: 5.0, lower: 4.5, middle: 3.8, upper: 3.8, penthouse: 4.2, rooftop: 3.5,
};

// Facade exposure by position
const POSITION_FACADE: Record<string, ("north" | "south" | "east" | "west")[]> = {
  north: ["north"], south: ["south"], east: ["east"], west: ["west"],
  northeast: ["north", "east"], northwest: ["north", "west"],
  southeast: ["south", "east"], southwest: ["south", "west"],
  center: [],
};

function createNode(
  floor: number,
  func: NodeFunction,
  position: FloorPosition,
  zone: FloorZone,
  totalFloors: number,
  tags: string[],
  usedIds: Set<string>,
  styleRef?: string,
): FloorNode {
  const floorLabel = floor < 0 ? `B${Math.abs(floor)}` : `F${floor}`;
  let id = `${floorLabel}_${func}`;

  if (usedIds.has(id)) {
    id = `${floorLabel}_${func}_${position}`;
  }
  if (usedIds.has(id)) {
    let c = 2;
    while (usedIds.has(`${id}_${c}`)) c++;
    id = `${id}_${c}`;
  }
  usedIds.add(id);

  const name = `${floorLabel} ${func.replace(/_/g, " ")} (${position})`;

  const area = FUNC_AREA[func] || 60;
  const aspect = func.includes("office") ? 1.5 : func.includes("parking") ? 2.5 : 1.2;
  const depth = Math.sqrt(area / aspect);
  const width = area / depth;
  const ceilingHeight = FUNC_CEILING[func] || ZONE_CEILING[zone] || 3.8;
  const facadeExposure = POSITION_FACADE[position] || [];
  const isDoubleHeight = ceilingHeight >= 5.5 || tags.includes("double_height") || tags.includes("atrium");
  const hasVoid = func === "public_void" || func === "atrium" || tags.includes("void");
  const hasTerrace = func === "sky_garden" || func === "rooftop_bar" || tags.includes("terrace");

  return {
    id,
    name,
    floor_level: floor,
    floor_zone: zone,
    function: func,
    position,
    constraints: [],
    abstract: computeAbstractProperties({ floor_level: floor, floor_zone: zone, function: func }, totalFloors),
    style_ref: styleRef,
    tags,
    geometry_ref: undefined,
    area,
    dimensions: { width, depth },
    ceiling_height: ceilingHeight,
    facade_exposure: facadeExposure.length > 0 ? facadeExposure : undefined,
    is_double_height: isDoubleHeight || undefined,
    has_void: hasVoid || undefined,
    has_terrace: hasTerrace || undefined,
  };
}

// ============================================================
// Floor Geometry Computation
// ============================================================

/**
 * Compute FloorGeometry for each FloorNode based on its style_ref (ArchitectFormDNA).
 * This makes the graph geometrically self-describing: 3D viewers can render
 * directly from node.geometry without needing FormDNA at render time.
 */
function computeFloorGeometries(nodes: FloorNode[], global: GlobalGraph): void {
  const [siteW, siteD] = global.site.dimensions;
  const bcr = global.site.bcr / 100;
  const footprintArea = siteW * siteD * bcr;
  const baseW = Math.sqrt(footprintArea * (siteW / siteD));
  const baseD = footprintArea / baseW;

  // Get dominant FormDNA across all nodes
  const allStyles = nodes.map((n) => n.style_ref);
  const dominantDNA = getDominantFormDNA(allStyles);

  // Group by floor
  const nodesByFloor = new Map<number, FloorNode[]>();
  for (const n of nodes) {
    if (!nodesByFloor.has(n.floor_level)) nodesByFloor.set(n.floor_level, []);
    nodesByFloor.get(n.floor_level)!.push(n);
  }
  const floors = Array.from(nodesByFloor.keys()).sort((a, b) => a - b);
  const aboveGroundFloors = floors.filter((f) => f >= 0);
  const totalAbove = aboveGroundFloors.length;

  for (const floor of floors) {
    const floorNodes = nodesByFloor.get(floor)!;
    const floorStyle = floorNodes.find((n) => n.style_ref && n.style_ref !== "none")?.style_ref;
    const floorDNA = getFloorFormDNA(floorStyle, dominantDNA);

    const aboveIdx = floor < 0 ? 0 : aboveGroundFloors.indexOf(floor);
    const floorRatio = totalAbove > 1 ? aboveIdx / (totalAbove - 1) : 0.5;
    const groundScale = floor <= 1 ? floorDNA.groundExpansion : 1;
    const fW = baseW * groundScale;
    const fD = baseD * groundScale;

    // Generate outline
    const outline = generateFloorOutline(floorDNA, fW, fD, aboveIdx, totalAbove);

    // Compute transform values
    const t = totalAbove > 1 ? aboveIdx / (totalAbove - 1) : 0.5;
    const taperScale = 1 - floorDNA.taper * t;
    const bulgeScale = 1 + floorDNA.bulge * Math.sin(t * Math.PI);
    const totalScale = taperScale * bulgeScale * groundScale;

    // Corner treatment
    let cornerTreatment: FloorGeometry["corner_treatment"] = "sharp";
    if (floorDNA.cornerRound > 0.5) cornerTreatment = "rounded";
    else if (floorDNA.cornerRound > 0) cornerTreatment = "rounded";
    else if (floorDNA.cornerChamfer > 0) cornerTreatment = "chamfered";
    if (floorDNA.plateShape === "organic") cornerTreatment = "sculpted";

    const cornerRadius = Math.max(floorDNA.cornerRound, floorDNA.cornerChamfer) * Math.min(fW, fD) * 0.3;

    // Void check
    const hwApprox = fW / 2;
    const hdApprox = fD / 2;
    const isVoid = isInVoidCut(floorDNA, floorRatio, 0, 0, hwApprox, hdApprox);

    // Ceiling height (already on node)
    const ceilingH = floorNodes[0]?.ceiling_height || ZONE_CEILING[floorNodes[0]?.floor_zone || "middle"] || 3.8;

    const geometry: FloorGeometry = {
      rotation: floorDNA.twist * aboveIdx,
      scale_x: totalScale,
      scale_z: totalScale,
      offset_x: floorDNA.shiftX * aboveIdx,
      offset_z: floorDNA.shiftZ * aboveIdx,
      floor_height: ceilingH,
      slab_thickness: 0.3,
      is_void: isVoid,
      corner_treatment: cornerTreatment,
      corner_radius: cornerRadius,
      facade_opacity: isVoid ? floorDNA.facadeOpacity * 0.3 : floorDNA.facadeOpacity,
      facade_inclination: floorDNA.facadeInclination,
      outline,
    };

    // Assign to all nodes on this floor
    for (const node of floorNodes) {
      node.geometry = geometry;
    }
  }
}

// ============================================================
// Edge Creation
// ============================================================

function createEdges(
  nodes: FloorNode[],
  totalFloors: number,
  _rules: DesignRules,
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

  // 3. VERTICAL_CONNECT: ground floor to all other floors via elevator core
  const groundFloor = floors.find((f) => f === 1) ?? floors.find((f) => f === 0) ?? floors[0];
  const groundCore = nodesByFloor.get(groundFloor)?.find((n) => n.function === "elevator_core");
  if (groundCore) {
    for (const f of floors) {
      if (f === groundFloor) continue;
      const floorCore = nodesByFloor.get(f)?.find((n) => n.function === "elevator_core");
      if (floorCore) {
        edges.push({
          source: groundCore.id, target: floorCore.id, type: "VERTICAL_CONNECT",
          properties: { connection: "elevator" },
        });
      }
    }
  }

  // 4. SERVED_BY: mechanical rooms serve nearby floors
  const mechFloors = floors.filter((f) =>
    nodesByFloor.get(f)!.some((n) => n.function === "mechanical_room")
  );
  for (const mechFloor of mechFloors) {
    const mechNode = nodesByFloor.get(mechFloor)!.find((n) => n.function === "mechanical_room");
    if (!mechNode) continue;
    for (const f of floors) {
      if (f === mechFloor) continue;
      if (Math.abs(f - mechFloor) <= 10) {
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

  // 6. FACES: directional edges
  const directionMap: Record<string, { context: string; positions: FloorPosition[] }> = {
    south: { context: global.site.context.south, positions: ["south", "southeast", "southwest"] },
    north: { context: global.site.context.north, positions: ["north", "northeast", "northwest"] },
    east:  { context: global.site.context.east,  positions: ["east", "northeast", "southeast"] },
    west:  { context: global.site.context.west,  positions: ["west", "northwest", "southwest"] },
  };

  // For corporate HQ, every 2nd floor is sufficient
  const representativeFloors = floors.filter((f) => f <= 1 || f === totalFloors || f % 2 === 0);
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

  // 7. STYLE_BOUNDARY: where architect style changes between floors
  for (let i = 1; i < floors.length; i++) {
    const lowerNodes = nodesByFloor.get(floors[i - 1])!;
    const upperNodes = nodesByFloor.get(floors[i])!;
    const lowerStyle = lowerNodes[0]?.style_ref;
    const upperStyle = upperNodes[0]?.style_ref;

    if (lowerStyle && upperStyle && lowerStyle !== upperStyle) {
      const lowerLobby = lowerNodes.find((n) => n.function === "elevator_lobby") ?? lowerNodes[0];
      const upperLobby = upperNodes.find((n) => n.function === "elevator_lobby") ?? upperNodes[0];
      edges.push({
        source: lowerLobby.id, target: upperLobby.id, type: "STYLE_BOUNDARY",
        properties: { from_style: lowerStyle, to_style: upperStyle },
      });
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
