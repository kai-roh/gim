// ============================================================
// Forum Result → Program Graph Conversion
// Parses convergence responses into ProgramGraph
// ============================================================

import type {
  ForumResult,
  GlobalGraph,
  ProgramGraph,
  ProgramNode,
  ProgramEdge,
  FloorZone,
  NodeFunction,
  ConsensusZone,
  DesignRules,
  VerticalNodeGraph,
} from "./types";
import type { ArchitectResponse, VerticalZoneProposal } from "../forum/types";
import { classifyFloorZone, getDefaultRules, getDefaultAdjacencyRules } from "./rules";

// ============================================================
// Function Name Normalization
// Maps Korean/free-form strings to NodeFunction enum
// ============================================================

const FUNCTION_MAPPINGS: Record<string, NodeFunction> = {
  // Korean mappings
  "주차장": "parking",
  "주차": "parking",
  "기계실": "mechanical_room",
  "기계층": "mechanical_room",
  "오피스": "open_office",
  "사무실": "open_office",
  "프리미엄 오피스": "premium_office",
  "임원실": "executive_suite",
  "브랜드 쇼룸": "brand_showroom",
  "쇼룸": "brand_showroom",
  "전시홀": "exhibition_hall",
  "전시": "exhibition_hall",
  "체험형 리테일": "experiential_retail",
  "리테일": "experiential_retail",
  "상업": "experiential_retail",
  "인스톨레이션": "installation_space",
  "카페": "cafe",
  "플래그십": "flagship_store",
  "플래그십 스토어": "flagship_store",
  "로비": "lobby",
  "아트리움": "atrium",
  "공공보이드": "public_void",
  "공공 보이드": "public_void",
  "커뮤니티": "community_space",
  "이벤트": "event_space",
  "이벤트 공간": "event_space",
  "라운지": "lounge",
  "명상실": "meditation_room",
  "구내식당": "cafeteria",
  "카페테리아": "cafeteria",
  "회의실": "meeting_room",
  "미팅룸": "meeting_room",
  "오디토리움": "auditorium",
  "강당": "auditorium",
  "어린이집": "nursery",
  "스카이가든": "sky_garden",
  "스카이 가든": "sky_garden",
  "루프탑가든": "sky_garden",
  "옥상정원": "sky_garden",
  "루프탑바": "rooftop_bar",
  "갤러리": "gallery",
  "코워킹": "coworking",
  "포커스룸": "focus_room",
  "집중근무실": "focus_room",
  "전기실": "electrical_room",
  "서버룸": "server_room",
  "자전거": "bicycle_storage",
  "로딩독": "loading_dock",

  // English mappings
  "parking": "parking",
  "mechanical": "mechanical_room",
  "mechanical_room": "mechanical_room",
  "office": "open_office",
  "open_office": "open_office",
  "premium_office": "premium_office",
  "executive_suite": "executive_suite",
  "brand_showroom": "brand_showroom",
  "brand_experience": "brand_showroom",
  "exhibition_hall": "exhibition_hall",
  "experiential_retail": "experiential_retail",
  "retail": "experiential_retail",
  "retail_culture": "experiential_retail",
  "installation_space": "installation_space",
  "installation": "installation_space",
  "cafe": "cafe",
  "flagship_store": "flagship_store",
  "lobby": "lobby",
  "atrium": "atrium",
  "public_void": "public_void",
  "void": "public_void",
  "community_space": "community_space",
  "event_space": "event_space",
  "lounge": "lounge",
  "meditation_room": "meditation_room",
  "cafeteria": "cafeteria",
  "meeting_room": "meeting_room",
  "auditorium": "auditorium",
  "nursery": "nursery",
  "sky_garden": "sky_garden",
  "sky_park": "sky_garden",
  "rooftop_bar": "rooftop_bar",
  "rooftop": "sky_garden",
  "gallery": "gallery",
  "coworking": "coworking",
  "focus_room": "focus_room",
  "electrical_room": "electrical_room",
  "server_room": "server_room",
  "bicycle_storage": "bicycle_storage",
  "loading_dock": "loading_dock",
  "elevator_core": "elevator_core",
  "stairwell": "stairwell",
  "elevator_lobby": "elevator_lobby",
  "service_shaft": "service_shaft",
  "parking_mechanical": "parking",
  "creative_lab": "coworking",
  "executive_lounge": "lounge",
  "support": "mechanical_room",
  "transit": "elevator_lobby",
};

export function normalizeFunctionName(raw: string): NodeFunction {
  const lower = raw.toLowerCase().trim();

  // Direct match
  if (FUNCTION_MAPPINGS[lower]) return FUNCTION_MAPPINGS[lower];

  // Partial match
  for (const [key, value] of Object.entries(FUNCTION_MAPPINGS)) {
    if (lower.includes(key) || key.includes(lower)) return value;
  }

  // Keyword-based fallback
  if (lower.includes("parking") || lower.includes("주차")) return "parking";
  if (lower.includes("mechani") || lower.includes("기계")) return "mechanical_room";
  if (lower.includes("office") || lower.includes("오피스") || lower.includes("사무")) return "open_office";
  if (lower.includes("showroom") || lower.includes("쇼룸")) return "brand_showroom";
  if (lower.includes("brand") || lower.includes("브랜드")) return "brand_showroom";
  if (lower.includes("exhib") || lower.includes("전시")) return "exhibition_hall";
  if (lower.includes("retail") || lower.includes("상업") || lower.includes("리테일")) return "experiential_retail";
  if (lower.includes("install") || lower.includes("인스톨")) return "installation_space";
  if (lower.includes("cafe") || lower.includes("카페")) return "cafe";
  if (lower.includes("lounge") || lower.includes("라운지")) return "lounge";
  if (lower.includes("garden") || lower.includes("가든") || lower.includes("park") || lower.includes("공원")) return "sky_garden";
  if (lower.includes("void") || lower.includes("보이드")) return "public_void";
  if (lower.includes("atrium") || lower.includes("아트리움")) return "atrium";
  if (lower.includes("gallery") || lower.includes("갤러리")) return "gallery";
  if (lower.includes("lobby") || lower.includes("로비")) return "lobby";
  if (lower.includes("event") || lower.includes("이벤트")) return "event_space";
  if (lower.includes("meeting") || lower.includes("회의")) return "meeting_room";
  if (lower.includes("executive") || lower.includes("임원")) return "executive_suite";

  // Default fallback
  return "open_office";
}

// ============================================================
// Zone Name Normalization
// ============================================================

function normalizeZoneName(raw: string): FloorZone {
  const lower = raw.toLowerCase().trim();
  const zoneMap: Record<string, FloorZone> = {
    basement: "basement",
    ground: "ground",
    lower: "lower",
    middle: "middle",
    upper: "upper",
    penthouse: "penthouse",
    rooftop: "rooftop",
  };
  return zoneMap[lower] ?? "middle";
}

// ============================================================
// Merge Vertical Zones from Multiple Architects
// ============================================================

export function mergeVerticalZones(
  responses: ArchitectResponse[],
  totalFloors: number
): ConsensusZone[] {
  // Collect per-floor votes from each architect
  const floorVotes = new Map<number, { zone: string; func: string; architect: string }[]>();

  for (const resp of responses) {
    if (!resp.proposal?.vertical_zoning) continue;

    for (const vz of resp.proposal.vertical_zoning) {
      const [startRaw, endRaw] = vz.floors;
      const start = typeof startRaw === "string" ? parseFloorString(startRaw) : startRaw;
      const end = typeof endRaw === "string" ? parseFloorString(endRaw) : endRaw;

      for (let f = start; f <= end; f++) {
        if (!floorVotes.has(f)) floorVotes.set(f, []);
        floorVotes.get(f)!.push({
          zone: vz.zone,
          func: extractPrimaryFunction(vz.primary_function),
          architect: resp.architect_id,
        });
      }
    }
  }

  // Majority vote per floor
  const consensus: ConsensusZone[] = [];
  const allFloors = Array.from(floorVotes.keys()).sort((a, b) => a - b);

  for (const floor of allFloors) {
    const votes = floorVotes.get(floor)!;

    // Vote on zone
    const zoneCounts = new Map<string, number>();
    const funcCounts = new Map<string, number>();
    const sources: string[] = [];

    for (const v of votes) {
      zoneCounts.set(v.zone, (zoneCounts.get(v.zone) ?? 0) + 1);
      funcCounts.set(v.func, (funcCounts.get(v.func) ?? 0) + 1);
      if (!sources.includes(v.architect)) sources.push(v.architect);
    }

    const winningZone = getMaxKey(zoneCounts);
    const winningFunc = getMaxKey(funcCounts);

    consensus.push({
      floor,
      zone: normalizeZoneName(winningZone),
      function: normalizeFunctionName(winningFunc),
      votes: Math.max(...zoneCounts.values()),
      sources,
    });
  }

  return consensus;
}

function parseFloorString(s: string): number {
  const match = s.match(/B(\d+)/i);
  if (match) return -parseInt(match[1]);
  return parseInt(s) || 0;
}

function extractPrimaryFunction(raw: string): string {
  // Take the first meaningful function from a compound string like "retail_culture + public_void"
  const parts = raw.split(/[+,/]/).map((s) => s.trim());
  return parts[0] || raw;
}

function getMaxKey(map: Map<string, number>): string {
  let maxKey = "";
  let maxVal = -1;
  for (const [k, v] of map) {
    if (v > maxVal) {
      maxKey = k;
      maxVal = v;
    }
  }
  return maxKey;
}

// ============================================================
// Build Program Graph
// ============================================================

export function buildProgramGraph(
  forumResult: ForumResult,
  rules?: DesignRules
): ProgramGraph {
  const effectiveRules = rules ?? getDefaultRules();

  // Get convergence responses (last round) or fallback to latest round
  const convergenceRound = forumResult.rounds.find((r) => r.phase === "convergence");
  const responses = convergenceRound?.responses ?? forumResult.rounds[forumResult.rounds.length - 1].responses;

  const totalFloors = extractTotalFloors(forumResult);

  // Merge vertical zones
  const consensus = mergeVerticalZones(responses, totalFloors);

  // Extract unique (program_type, zone) pairs as ProgramNodes
  const nodeMap = new Map<string, ProgramNode>();

  for (const cz of consensus) {
    const key = `${cz.function}_${cz.zone}`;
    if (!nodeMap.has(key)) {
      nodeMap.set(key, {
        id: key,
        program_type: cz.function,
        target_zone: cz.zone,
        floor_range: [cz.floor, cz.floor],
        area_ratio: 0,
      });
    } else {
      const existing = nodeMap.get(key)!;
      existing.floor_range = [
        Math.min(existing.floor_range[0], cz.floor),
        Math.max(existing.floor_range[1], cz.floor),
      ];
    }
  }

  // Map area ratios from project program uses
  const programUses = forumResult.project.program.uses;
  for (const node of nodeMap.values()) {
    const matchingUse = programUses.find((u) => {
      const normalized = normalizeFunctionName(u.type);
      return normalized === node.program_type;
    });
    if (matchingUse) {
      node.area_ratio = matchingUse.ratio;
    } else {
      // Estimate ratio from floor count
      const totalConsensusFloors = consensus.length;
      const nodeFloorCount = node.floor_range[1] - node.floor_range[0] + 1;
      node.area_ratio = Math.round((nodeFloorCount / totalConsensusFloors) * 100) / 100;
    }
  }

  const nodes = Array.from(nodeMap.values());

  // Build edges
  const edges = inferAdjacencyEdges(nodes, consensus, effectiveRules);

  return { nodes, edges };
}

// ============================================================
// Infer Adjacency Edges
// ============================================================

function inferAdjacencyEdges(
  nodes: ProgramNode[],
  consensus: ConsensusZone[],
  rules: DesignRules
): ProgramEdge[] {
  const edges: ProgramEdge[] = [];
  const edgeSet = new Set<string>();

  function addEdge(edge: ProgramEdge) {
    const key = `${edge.source}-${edge.target}-${edge.type}`;
    const reverseKey = `${edge.target}-${edge.source}-${edge.type}`;
    if (!edgeSet.has(key) && !edgeSet.has(reverseKey)) {
      edgeSet.add(key);
      edges.push(edge);
    }
  }

  // 1. Default adjacency rules
  for (const rule of rules.adjacency) {
    const sourceNodes = nodes.filter(
      (n) => n.program_type === rule.source || n.program_type.includes(rule.source)
    );
    const targetNodes = nodes.filter(
      (n) => n.program_type === rule.target || n.program_type.includes(rule.target)
    );

    for (const s of sourceNodes) {
      for (const t of targetNodes) {
        if (s.id === t.id) continue;
        addEdge({
          source: s.id,
          target: t.id,
          type: rule.type === "positive" ? "ADJACENCY_POSITIVE" : "ADJACENCY_NEGATIVE",
          weight: rule.weight,
          rationale: rule.reason,
        });
      }
    }
  }

  // 2. Consensus-based edges: programs co-located in same zone by 2+ architects
  const zonePrograms = new Map<FloorZone, Map<string, Set<string>>>();
  for (const cz of consensus) {
    if (!zonePrograms.has(cz.zone)) zonePrograms.set(cz.zone, new Map());
    const funcMap = zonePrograms.get(cz.zone)!;
    if (!funcMap.has(cz.function)) funcMap.set(cz.function, new Set());
    for (const src of cz.sources) {
      funcMap.get(cz.function)!.add(src);
    }
  }

  for (const [zone, funcMap] of zonePrograms) {
    const funcsInZone = Array.from(funcMap.keys());
    for (let i = 0; i < funcsInZone.length; i++) {
      for (let j = i + 1; j < funcsInZone.length; j++) {
        const f1 = funcsInZone[i];
        const f2 = funcsInZone[j];
        const sources1 = funcMap.get(f1)!;
        const sources2 = funcMap.get(f2)!;
        const sharedSources = [...sources1].filter((s) => sources2.has(s));

        if (sharedSources.length >= 2) {
          const nodeA = nodes.find((n) => n.program_type === (f1 as NodeFunction) && n.target_zone === zone);
          const nodeB = nodes.find((n) => n.program_type === (f2 as NodeFunction) && n.target_zone === zone);
          if (nodeA && nodeB) {
            addEdge({
              source: nodeA.id,
              target: nodeB.id,
              type: "ADJACENCY_POSITIVE",
              weight: 0.6 + sharedSources.length * 0.1,
              rationale: `Co-located in ${zone} by ${sharedSources.length} architects`,
            });
          }
        }
      }
    }
  }

  // 3. VERTICAL_CONTINUITY for core-related nodes
  const coreNodes = nodes.filter(
    (n) => n.program_type === "elevator_core" || n.program_type === "stairwell" || n.program_type === "service_shaft"
  );
  for (const coreNode of coreNodes) {
    for (const otherNode of nodes) {
      if (coreNode.id === otherNode.id) continue;
      // Core runs through all zones that have other programs
      if (rangesOverlap(coreNode.floor_range, otherNode.floor_range)) {
        addEdge({
          source: coreNode.id,
          target: otherNode.id,
          type: "VERTICAL_CONTINUITY",
          weight: 0.9,
          rationale: "Core provides vertical continuity to this program",
        });
      }
    }
  }

  // 4. PROGRAM_DEPENDENCY edges
  for (const node of nodes) {
    // Brand showroom depends on lobby
    if (node.program_type === "brand_showroom" || node.program_type === "experiential_retail") {
      const lobby = nodes.find((n) => n.program_type === "lobby" || n.program_type === "elevator_lobby");
      if (lobby) {
        addEdge({
          source: node.id,
          target: lobby.id,
          type: "PROGRAM_DEPENDENCY",
          weight: 0.8,
          rationale: "Brand experience spaces depend on lobby access",
        });
      }
    }
    // Executive suite depends on lounge
    if (node.program_type === "executive_suite") {
      const lounge = nodes.find((n) => n.program_type === "lounge");
      if (lounge) {
        addEdge({
          source: node.id,
          target: lounge.id,
          type: "PROGRAM_DEPENDENCY",
          weight: 0.7,
          rationale: "Executive suite connected to lounge",
        });
      }
    }
  }

  return edges;
}

function rangesOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

function extractTotalFloors(forumResult: ForumResult): number {
  // Try to extract from constraints — look for "N층 규모" pattern first
  for (const c of forumResult.project.constraints) {
    const match = c.match(/(\d+)층\s*규모/);
    if (match) return parseInt(match[1]);
  }

  // Fallback: scan vertical zoning for max floor
  let maxFloor = 0;
  for (const round of forumResult.rounds) {
    for (const resp of round.responses) {
      if (!resp.proposal?.vertical_zoning) continue;
      for (const vz of resp.proposal.vertical_zoning) {
        const end = typeof vz.floors[1] === "string" ? parseFloorString(vz.floors[1] as string) : vz.floors[1];
        maxFloor = Math.max(maxFloor, end);
      }
    }
  }
  return maxFloor || 8;
}

// ============================================================
// Full Pipeline: ForumResult → VerticalNodeGraph
// ============================================================

import { buildVerticalNodeGraph } from "./builder";

function extractGlobalGraph(forumResult: ForumResult): GlobalGraph {
  const project = forumResult.project;
  const totalFloors = extractTotalFloors(forumResult);

  let basementFloors = 1;
  for (const c of project.constraints) {
    const match = c.match(/지하\s*(\d+)/);
    if (match) basementFloors = parseInt(match[1]);
  }

  return {
    site: project.site,
    program: project.program,
    constraints: project.constraints,
    total_floors: totalFloors,
    basement_floors: basementFloors,
  };
}

export function buildGraphFromForumResult(
  forumResult: ForumResult,
): VerticalNodeGraph {
  const global = extractGlobalGraph(forumResult);
  const program = buildProgramGraph(forumResult);

  const convergenceRound = forumResult.rounds.find((r) => r.phase === "convergence");
  const responses = convergenceRound?.responses ?? forumResult.rounds[forumResult.rounds.length - 1].responses;
  const consensus = mergeVerticalZones(responses, global.total_floors);

  return buildVerticalNodeGraph(global, program, consensus);
}
