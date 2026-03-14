// ============================================================
// Resolved Model — deterministic geometric interpretation
// Resolves a SpatialMassGraph into a ResolvedMassModel
// ============================================================

import type {
  SpatialMassGraph,
  MassNode,
  MassRelation,
  ResolvedMassNode,
  ResolvedModelRelation,
  ResolvedBooleanOperation,
  ResolvedMassModel,
  MassPrimitive,
} from "./types";

// ============================================================
// Constants
// ============================================================

const FLOOR_HEIGHT = 3.8; // meters per floor

const MASS_IDENTITY_PALETTE = [
  "#4488cc", "#cc8844", "#44cc88", "#cc4488",
  "#88cc44", "#8844cc", "#44cccc", "#cc4444",
  "#88cc88", "#cc8888", "#4444cc", "#cccc44",
];

const BOX_FAMILY: MassPrimitive[] = ["block", "bar", "plate", "tower", "bridge"];

// ============================================================
// Color assignment
// ============================================================

export function getMassColor(index: number): string {
  return MASS_IDENTITY_PALETTE[index % MASS_IDENTITY_PALETTE.length];
}

// ============================================================
// Helpers
// ============================================================

interface NodePlacement {
  id: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

function getDimensions(node: MassNode): [number, number, number] {
  const hint = node.geometry.scale.hint;
  return [hint.width, hint.height, hint.depth];
}

function center(p: NodePlacement): [number, number, number] {
  return [p.x + p.w / 2, p.y + p.h / 2, p.z + p.d / 2];
}

function boxOverlap(
  a: NodePlacement,
  b: NodePlacement,
): { min: [number, number, number]; max: [number, number, number] } | null {
  const minX = Math.max(a.x, b.x);
  const maxX = Math.min(a.x + a.w, b.x + b.w);
  const minY = Math.max(a.y, b.y);
  const maxY = Math.min(a.y + a.h, b.y + b.h);
  const minZ = Math.max(a.z, b.z);
  const maxZ = Math.min(a.z + a.d, b.z + b.d);

  if (minX < maxX && minY < maxY && minZ < maxZ) {
    return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
  }
  return null;
}

// ============================================================
// Constraint Solver
// ============================================================

function buildTopologicalOrder(
  nodes: MassNode[],
  relations: MassRelation[],
): string[] {
  // Build adjacency for stack relations (above/below)
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const nodeIds = new Set(nodes.map((n) => n.id));

  for (const id of nodeIds) {
    adj.set(id, []);
    inDegree.set(id, 0);
  }

  for (const rel of relations) {
    if (rel.family !== "stack") continue;
    // "above": target is above source => source -> target
    // "below": target is below source => target -> source
    let src: string, tgt: string;
    if (rel.rule === "below") {
      src = rel.target;
      tgt = rel.source;
    } else {
      src = rel.source;
      tgt = rel.target;
    }
    if (nodeIds.has(src) && nodeIds.has(tgt)) {
      adj.get(src)!.push(tgt);
      inDegree.set(tgt, (inDegree.get(tgt) || 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const next of adj.get(node) || []) {
      const newDeg = (inDegree.get(next) || 1) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  // Add any remaining nodes (in case of cycles or disconnected)
  for (const id of nodeIds) {
    if (!order.includes(id)) order.push(id);
  }

  return order;
}

function solveConstraints(
  nodes: MassNode[],
  relations: MassRelation[],
): Map<string, NodePlacement> {
  const placements = new Map<string, NodePlacement>();
  const nodeMap = new Map<string, MassNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // Initialize all placements
  for (const node of nodes) {
    const [w, h, d] = getDimensions(node);
    placements.set(node.id, {
      id: node.id,
      x: 0,
      y: node.ground_contact ? 0 : node.floor_range[0] * FLOOR_HEIGHT,
      z: 0,
      w,
      h,
      d,
    });
  }

  // Phase 1: Topological sort for stacks — place Y positions
  const order = buildTopologicalOrder(nodes, relations);

  for (const id of order) {
    const p = placements.get(id)!;

    // Process stack relations where this node is the source
    for (const rel of relations) {
      if (rel.family !== "stack") continue;

      let srcId: string, tgtId: string;
      if (rel.rule === "below") {
        srcId = rel.target;
        tgtId = rel.source;
      } else {
        srcId = rel.source;
        tgtId = rel.target;
      }

      if (srcId === id) {
        const srcP = placements.get(srcId)!;
        const tgtP = placements.get(tgtId)!;
        tgtP.y = srcP.y + srcP.h;
      }
    }
  }

  // Phase 2: Contact relations — place side by side
  for (const rel of relations) {
    if (rel.family !== "contact") continue;
    if (rel.rule !== "adjacent" && rel.rule !== "touching") continue;

    const srcP = placements.get(rel.source);
    const tgtP = placements.get(rel.target);
    if (!srcP || !tgtP) continue;

    // Place target adjacent to source along X
    tgtP.x = srcP.x + srcP.w + 1; // 1m gap
  }

  // Phase 3: Force-based XZ spread (30 iterations)
  const allPlacements = Array.from(placements.values());
  const REPULSION = 5.0;
  const DAMPING = 0.3;

  for (let iter = 0; iter < 30; iter++) {
    const forces = new Map<string, { fx: number; fz: number }>();
    for (const p of allPlacements) {
      forces.set(p.id, { fx: 0, fz: 0 });
    }

    // Repulsion between all pairs
    for (let i = 0; i < allPlacements.length; i++) {
      for (let j = i + 1; j < allPlacements.length; j++) {
        const a = allPlacements[i];
        const b = allPlacements[j];
        const dx = (b.x + b.w / 2) - (a.x + a.w / 2);
        const dz = (b.z + b.d / 2) - (a.z + a.d / 2);
        const dist = Math.sqrt(dx * dx + dz * dz) + 0.1;

        // Check if overlapping in XZ
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapZ = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z);

        if (overlapX > 0 && overlapZ > 0) {
          // Overlapping — strong repulsion
          const force = REPULSION * (overlapX + overlapZ) / dist;
          const fx = (dx / dist) * force;
          const fz = (dz / dist) * force;
          forces.get(a.id)!.fx -= fx;
          forces.get(a.id)!.fz -= fz;
          forces.get(b.id)!.fx += fx;
          forces.get(b.id)!.fz += fz;
        }
      }
    }

    // Attraction for contact relations
    for (const rel of relations) {
      if (rel.family !== "contact") continue;
      const srcP = placements.get(rel.source);
      const tgtP = placements.get(rel.target);
      if (!srcP || !tgtP) continue;

      const dx = (tgtP.x + tgtP.w / 2) - (srcP.x + srcP.w / 2);
      const dz = (tgtP.z + tgtP.d / 2) - (srcP.z + srcP.d / 2);
      const dist = Math.sqrt(dx * dx + dz * dz) + 0.1;

      // Gentle attraction
      const idealDist = (srcP.w + tgtP.w) / 2 + 1;
      if (dist > idealDist) {
        const force = 0.5 * (dist - idealDist) / dist;
        forces.get(srcP.id)!.fx += dx * force;
        forces.get(srcP.id)!.fz += dz * force;
        forces.get(tgtP.id)!.fx -= dx * force;
        forces.get(tgtP.id)!.fz -= dz * force;
      }
    }

    // Apply forces
    for (const p of allPlacements) {
      const f = forces.get(p.id)!;
      // Don't move ground-contact nodes too far
      const factor = DAMPING;
      p.x += f.fx * factor;
      p.z += f.fz * factor;
    }
  }

  return placements;
}

// ============================================================
// Boolean Subtraction
// ============================================================

function computeBooleans(
  nodes: MassNode[],
  placements: Map<string, NodePlacement>,
): ResolvedBooleanOperation[] {
  const operations: ResolvedBooleanOperation[] = [];
  const voidNodes = nodes.filter((n) => n.type === "void");
  const solidNodes = nodes.filter(
    (n) => n.type === "solid" && BOX_FAMILY.includes(n.geometry.primitive),
  );

  for (const voidNode of voidNodes) {
    const voidP = placements.get(voidNode.id);
    if (!voidP) continue;
    if (!BOX_FAMILY.includes(voidNode.geometry.primitive)) continue;

    for (const solidNode of solidNodes) {
      const solidP = placements.get(solidNode.id);
      if (!solidP) continue;

      const overlap = boxOverlap(solidP, voidP);
      if (!overlap) continue;

      // Fragment the solid by subtracting the void overlap
      const fragments = subtractBox(solidP, overlap);
      if (fragments.length > 0) {
        operations.push({
          hostId: solidNode.id,
          voidId: voidNode.id,
          operation: "subtract",
          resultFragments: fragments.map((f) => ({
            position: [f.x, f.y, f.z] as [number, number, number],
            dimensions: [f.w, f.h, f.d] as [number, number, number],
          })),
        });
      }
    }
  }

  return operations;
}

function subtractBox(
  solid: NodePlacement,
  hole: { min: [number, number, number]; max: [number, number, number] },
): NodePlacement[] {
  const fragments: NodePlacement[] = [];
  const [hMinX, hMinY, hMinZ] = hole.min;
  const [hMaxX, hMaxY, hMaxZ] = hole.max;

  const sMinX = solid.x;
  const sMaxX = solid.x + solid.w;
  const sMinY = solid.y;
  const sMaxY = solid.y + solid.h;
  const sMinZ = solid.z;
  const sMaxZ = solid.z + solid.d;

  // Left fragment (X < hole min X)
  if (hMinX > sMinX) {
    fragments.push({
      id: solid.id,
      x: sMinX, y: sMinY, z: sMinZ,
      w: hMinX - sMinX, h: solid.h, d: solid.d,
    });
  }

  // Right fragment (X > hole max X)
  if (hMaxX < sMaxX) {
    fragments.push({
      id: solid.id,
      x: hMaxX, y: sMinY, z: sMinZ,
      w: sMaxX - hMaxX, h: solid.h, d: solid.d,
    });
  }

  // Bottom fragment (Y < hole min Y), within hole X range
  if (hMinY > sMinY) {
    fragments.push({
      id: solid.id,
      x: hMinX, y: sMinY, z: sMinZ,
      w: hMaxX - hMinX, h: hMinY - sMinY, d: solid.d,
    });
  }

  // Top fragment (Y > hole max Y), within hole X range
  if (hMaxY < sMaxY) {
    fragments.push({
      id: solid.id,
      x: hMinX, y: hMaxY, z: sMinZ,
      w: hMaxX - hMinX, h: sMaxY - hMaxY, d: solid.d,
    });
  }

  // Front fragment (Z < hole min Z), within hole X and Y range
  if (hMinZ > sMinZ) {
    fragments.push({
      id: solid.id,
      x: hMinX, y: hMinY, z: sMinZ,
      w: hMaxX - hMinX, h: hMaxY - hMinY, d: hMinZ - sMinZ,
    });
  }

  // Back fragment (Z > hole max Z), within hole X and Y range
  if (hMaxZ < sMaxZ) {
    fragments.push({
      id: solid.id,
      x: hMinX, y: hMinY, z: hMaxZ,
      w: hMaxX - hMinX, h: hMaxY - hMinY, d: sMaxZ - hMaxZ,
    });
  }

  return fragments;
}

// ============================================================
// Relation Satisfaction Check
// ============================================================

function checkRelations(
  relations: MassRelation[],
  placements: Map<string, NodePlacement>,
): ResolvedModelRelation[] {
  return relations.map((rel) => {
    const srcP = placements.get(rel.source);
    const tgtP = placements.get(rel.target);

    if (!srcP || !tgtP) {
      return {
        id: rel.id,
        satisfied: false,
        deviation: 1,
        visual: {
          from: [0, 0, 0] as [number, number, number],
          to: [0, 0, 0] as [number, number, number],
          style: "dashed" as const,
        },
      };
    }

    const srcCenter = center(srcP);
    const tgtCenter = center(tgtP);

    let satisfied = false;
    let deviation = 0;

    switch (rel.family) {
      case "stack": {
        if (rel.rule === "above" || rel.rule === "floating") {
          // Target should be above source
          const expectedY = srcP.y + srcP.h;
          const actualY = tgtP.y;
          deviation = Math.abs(actualY - expectedY) / (srcP.h + tgtP.h);
          satisfied = deviation < 0.1;
        } else if (rel.rule === "below") {
          const expectedY = tgtP.y + tgtP.h;
          const actualY = srcP.y;
          deviation = Math.abs(actualY - expectedY) / (srcP.h + tgtP.h);
          satisfied = deviation < 0.1;
        }
        break;
      }
      case "contact": {
        // Check if nodes are adjacent (touching or close)
        const gapX = Math.max(0, Math.max(srcP.x, tgtP.x) - Math.min(srcP.x + srcP.w, tgtP.x + tgtP.w));
        const gapZ = Math.max(0, Math.max(srcP.z, tgtP.z) - Math.min(srcP.z + srcP.d, tgtP.z + tgtP.d));
        const gap = Math.sqrt(gapX * gapX + gapZ * gapZ);
        deviation = Math.min(1, gap / 10);
        satisfied = gap < 2; // within 2m is "touching"
        break;
      }
      case "enclosure":
      case "intersection": {
        // Check overlap
        const overlap = boxOverlap(srcP, tgtP);
        satisfied = overlap !== null;
        deviation = satisfied ? 0 : 0.5;
        break;
      }
      default: {
        // connection, alignment — soft constraints
        satisfied = true;
        deviation = 0;
        break;
      }
    }

    return {
      id: rel.id,
      satisfied,
      deviation: Math.min(1, Math.max(0, deviation)),
      visual: {
        from: srcCenter,
        to: tgtCenter,
        style: satisfied ? ("solid" as const) : ("dashed" as const),
      },
    };
  });
}

// ============================================================
// Main Entry Point
// ============================================================

export function resolveModel(graph: SpatialMassGraph): ResolvedMassModel {
  // 1. Solve constraints — get placements
  const placements = solveConstraints(graph.nodes, graph.relations);

  // 2. Build resolved nodes
  const resolvedNodes: ResolvedMassNode[] = graph.nodes.map((node, idx) => {
    const p = placements.get(node.id)!;
    return {
      id: node.id,
      position: [p.x, p.y, p.z] as [number, number, number],
      dimensions: [p.w, p.h, p.d] as [number, number, number],
      rotation: 0,
      color: getMassColor(idx),
      primitive: node.geometry.primitive,
      opacity: node.type === "void" ? 0.3 : 1,
      visible: true,
    };
  });

  // 3. Check relation satisfaction
  const resolvedRelations = checkRelations(graph.relations, placements);

  // 4. Boolean subtraction
  const booleans = computeBooleans(graph.nodes, placements);

  // 5. Compute bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const p of placements.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x + p.w);
    maxY = Math.max(maxY, p.y + p.h);
    maxZ = Math.max(maxZ, p.z + p.d);
  }

  // Handle empty graph
  if (!isFinite(minX)) {
    minX = minY = minZ = 0;
    maxX = maxY = maxZ = 0;
  }

  return {
    nodes: resolvedNodes,
    relations: resolvedRelations,
    booleans,
    bounds: {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    },
    created_at: new Date().toISOString(),
  };
}
