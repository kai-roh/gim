// ============================================================
// Architect FormDNA — Design Language → 3D Form Generation
// Each architect defines distinctive operations that transform
// the building mass into their signature style.
// ============================================================

export interface ArchitectFormDNA {
  id: string;
  // Floor plate shape generator
  plateShape: "rectangular" | "rounded" | "elliptical" | "hexagonal" | "organic" | "L_shape" | "chamfered";
  // Per-floor transformations
  twist: number;                   // degrees rotation per floor
  taper: number;                   // 0=no taper, 1=full pyramid (linear scaling factor)
  bulge: number;                   // 0=none, >0 = mid-section wider
  shiftX: number;                  // accumulated X offset per floor (meters)
  shiftZ: number;                  // accumulated Z offset per floor (meters)
  // Corner operations (0-1)
  cornerChamfer: number;           // chamfer corner ratio
  cornerRound: number;             // round corner ratio (alternative to chamfer)
  // Mass operations
  voidCuts: VoidCut[];
  terraceFrequency: number;        // 0-1, probability per floor of creating terrace
  terraceDepth: number;            // meters of setback for terrace
  // Facade
  facadeColor: number;
  facadeOpacity: number;
  facadeMetalness: number;
  facadeRoughness: number;
  interiorWarmth: number;          // 0-1, warm emissive light from inside
  // Ground floor
  pilotis: boolean;                // lift building on columns
  groundExpansion: number;         // 0-2, how much ground floor expands vs upper
  // Roof
  roofStyle: "flat" | "sloped" | "garden" | "crown" | "sculptural";
  // Structural expression
  showDiagrid: boolean;
  showExoskeleton: boolean;
  columnExpression: boolean;

  // Transition style (controls loft interpolation between floors)
  transitionStyle: "smooth" | "crisp" | "abrupt" | "minimal" | "sculptural";
  // Facade inclination (degrees, 0 = vertical, + = lean outward)
  facadeInclination: number;
}

export interface VoidCut {
  startFloorRatio: number;   // 0-1 ratio within building height
  endFloorRatio: number;
  direction: "north" | "south" | "east" | "west";
  depthRatio: number;        // 0-1, how deep into the mass
  widthRatio: number;        // 0-1, how wide
}

// ============================================================
// 20 Architect FormDNA Definitions
// ============================================================

export const ARCHITECT_FORM_DNA: Record<string, ArchitectFormDNA> = {
  // ---- Category A: Design Practice Masters ----

  adrian_smith: {
    id: "adrian_smith",
    plateShape: "chamfered",
    twist: 0.5, taper: 0.25, bulge: 0, shiftX: 0, shiftZ: 0,
    cornerChamfer: 0.3, cornerRound: 0,
    voidCuts: [],
    terraceFrequency: 0, terraceDepth: 0,
    facadeColor: 0xc0d0e0, facadeOpacity: 0.4, facadeMetalness: 0.5, facadeRoughness: 0.1,
    interiorWarmth: 0.3,
    pilotis: false, groundExpansion: 1.1,
    roofStyle: "crown",
    showDiagrid: false, showExoskeleton: false, columnExpression: false,
    transitionStyle: "crisp", facadeInclination: 0,
  },

  gensler: {
    id: "gensler",
    plateShape: "rounded",
    twist: 1.5, taper: 0.15, bulge: 0.05, shiftX: 0, shiftZ: 0,
    cornerChamfer: 0, cornerRound: 0.5,
    voidCuts: [],
    terraceFrequency: 0.15, terraceDepth: 2.0,
    facadeColor: 0xb0c8d8, facadeOpacity: 0.45, facadeMetalness: 0.35, facadeRoughness: 0.15,
    interiorWarmth: 0.25,
    pilotis: false, groundExpansion: 1.05,
    roofStyle: "garden",
    showDiagrid: false, showExoskeleton: false, columnExpression: false,
    transitionStyle: "crisp", facadeInclination: 0,
  },

  bjarke_ingels: {
    id: "bjarke_ingels",
    plateShape: "rectangular",
    twist: 0, taper: 0, bulge: 0, shiftX: 0.3, shiftZ: 0,
    cornerChamfer: 0.15, cornerRound: 0,
    voidCuts: [
      { startFloorRatio: 0.4, endFloorRatio: 0.6, direction: "south", depthRatio: 0.35, widthRatio: 0.5 },
    ],
    terraceFrequency: 0.4, terraceDepth: 3.0,
    facadeColor: 0xd0d8c8, facadeOpacity: 0.38, facadeMetalness: 0.25, facadeRoughness: 0.2,
    interiorWarmth: 0.35,
    pilotis: false, groundExpansion: 1.15,
    roofStyle: "garden",
    showDiagrid: false, showExoskeleton: false, columnExpression: false,
    transitionStyle: "crisp", facadeInclination: 3,       // slight lean for terraced slopes
  },

  mvrdv: {
    id: "mvrdv",
    plateShape: "rectangular",
    twist: 0, taper: 0, bulge: 0.15, shiftX: 0, shiftZ: 0,
    cornerChamfer: 0, cornerRound: 0,
    voidCuts: [
      { startFloorRatio: 0.2, endFloorRatio: 0.4, direction: "east", depthRatio: 0.4, widthRatio: 0.35 },
      { startFloorRatio: 0.6, endFloorRatio: 0.8, direction: "west", depthRatio: 0.3, widthRatio: 0.4 },
    ],
    terraceFrequency: 0.3, terraceDepth: 2.5,
    facadeColor: 0xc8c8c8, facadeOpacity: 0.35, facadeMetalness: 0.2, facadeRoughness: 0.3,
    interiorWarmth: 0.4,
    pilotis: false, groundExpansion: 1.0,
    roofStyle: "garden",
    showDiagrid: false, showExoskeleton: false, columnExpression: false,
    transitionStyle: "abrupt", facadeInclination: 0,       // pixelated stacking
  },

  renzo_piano: {
    id: "renzo_piano",
    plateShape: "chamfered",
    twist: 0, taper: 0.3, bulge: 0, shiftX: 0, shiftZ: 0,
    cornerChamfer: 0.15, cornerRound: 0.1,
    voidCuts: [],
    terraceFrequency: 0.1, terraceDepth: 1.5,
    facadeColor: 0xd0dce0, facadeOpacity: 0.5, facadeMetalness: 0.35, facadeRoughness: 0.1,
    interiorWarmth: 0.3,
    pilotis: false, groundExpansion: 1.2,
    roofStyle: "sloped",
    showDiagrid: false, showExoskeleton: false, columnExpression: true,
    transitionStyle: "crisp", facadeInclination: 1,        // precision engineering
  },

  fazlur_khan: {
    id: "fazlur_khan",
    plateShape: "rectangular",
    twist: 0, taper: 0.1, bulge: 0, shiftX: 0, shiftZ: 0,
    cornerChamfer: 0, cornerRound: 0,
    voidCuts: [],
    terraceFrequency: 0, terraceDepth: 0,
    facadeColor: 0xb0b8c0, facadeOpacity: 0.3, facadeMetalness: 0.4, facadeRoughness: 0.2,
    interiorWarmth: 0.2,
    pilotis: false, groundExpansion: 1.0,
    roofStyle: "flat",
    showDiagrid: false, showExoskeleton: true, columnExpression: false,
    transitionStyle: "minimal", facadeInclination: 0,      // pure structure
  },

  snohetta: {
    id: "snohetta",
    plateShape: "organic",
    twist: 0.8, taper: 0.05, bulge: 0.1, shiftX: 0, shiftZ: 0.15,
    cornerChamfer: 0, cornerRound: 0.7,
    voidCuts: [],
    terraceFrequency: 0.25, terraceDepth: 4.0,
    facadeColor: 0xc8c0b0, facadeOpacity: 0.3, facadeMetalness: 0.15, facadeRoughness: 0.5,
    interiorWarmth: 0.35,
    pilotis: false, groundExpansion: 1.3,
    roofStyle: "sloped",
    showDiagrid: false, showExoskeleton: false, columnExpression: false,
    transitionStyle: "smooth", facadeInclination: 5,       // landscape-like lean
  },

  ole_scheeren: {
    id: "ole_scheeren",
    plateShape: "rectangular",
    twist: 0, taper: 0, bulge: 0, shiftX: 0.8, shiftZ: 0.4,
    cornerChamfer: 0.1, cornerRound: 0,
    voidCuts: [
      { startFloorRatio: 0.35, endFloorRatio: 0.55, direction: "south", depthRatio: 0.5, widthRatio: 0.6 },
    ],
    terraceFrequency: 0.2, terraceDepth: 3.5,
    facadeColor: 0xb8b8c0, facadeOpacity: 0.35, facadeMetalness: 0.3, facadeRoughness: 0.2,
    interiorWarmth: 0.25,
    pilotis: false, groundExpansion: 1.0,
    roofStyle: "flat",
    showDiagrid: false, showExoskeleton: false, columnExpression: false,
    transitionStyle: "abrupt", facadeInclination: 0,       // dramatic volume shifts
  },

  thomas_heatherwick: {
    id: "thomas_heatherwick",
    plateShape: "hexagonal",
    twist: 2.0, taper: 0.05, bulge: 0.12, shiftX: 0, shiftZ: 0,
    cornerChamfer: 0, cornerRound: 0.2,
    voidCuts: [],
    terraceFrequency: 0.35, terraceDepth: 2.0,
    facadeColor: 0xd8c8b0, facadeOpacity: 0.25, facadeMetalness: 0.15, facadeRoughness: 0.6,
    interiorWarmth: 0.45,
    pilotis: false, groundExpansion: 1.1,
    roofStyle: "sculptural",
    showDiagrid: false, showExoskeleton: false, columnExpression: false,
    transitionStyle: "sculptural", facadeInclination: 4,   // craft-driven surfaces
  },

  kpf: {
    id: "kpf",
    plateShape: "chamfered",
    twist: 0, taper: 0.2, bulge: 0, shiftX: 0, shiftZ: 0,
    cornerChamfer: 0.2, cornerRound: 0,
    voidCuts: [],
    terraceFrequency: 0.05, terraceDepth: 1.5,
    facadeColor: 0xc0c8d0, facadeOpacity: 0.45, facadeMetalness: 0.4, facadeRoughness: 0.12,
    interiorWarmth: 0.25,
    pilotis: false, groundExpansion: 1.05,
    roofStyle: "crown",
    showDiagrid: false, showExoskeleton: false, columnExpression: false,
    transitionStyle: "crisp", facadeInclination: 0,        // corporate precision
  },

  // ---- Category B: Architectural Visionaries ----

  le_corbusier: {
    id: "le_corbusier",
    plateShape: "rectangular",
    twist: 0, taper: 0, bulge: 0, shiftX: 0, shiftZ: 0,
    cornerChamfer: 0, cornerRound: 0,
    voidCuts: [],
    terraceFrequency: 0.15, terraceDepth: 2.0,
    facadeColor: 0xe0e0e0, facadeOpacity: 0.3, facadeMetalness: 0.1, facadeRoughness: 0.5,
    interiorWarmth: 0.3,
    pilotis: true, groundExpansion: 0.85,
    roofStyle: "garden",
    showDiagrid: false, showExoskeleton: false, columnExpression: true,
    transitionStyle: "minimal", facadeInclination: 0,      // platonic clarity
  },

  frank_lloyd_wright: {
    id: "frank_lloyd_wright",
    plateShape: "rectangular",
    twist: 0, taper: 0, bulge: 0, shiftX: 0, shiftZ: 0,
    cornerChamfer: 0, cornerRound: 0,
    voidCuts: [],
    terraceFrequency: 0.5, terraceDepth: 4.0,
    facadeColor: 0xc8b8a0, facadeOpacity: 0.2, facadeMetalness: 0.1, facadeRoughness: 0.7,
    interiorWarmth: 0.5,
    pilotis: false, groundExpansion: 1.4,
    roofStyle: "flat",
    showDiagrid: false, showExoskeleton: false, columnExpression: false,
    transitionStyle: "crisp", facadeInclination: -2,       // cantilevered horizontality
  },

  mies: {
    id: "mies",
    plateShape: "rectangular",
    twist: 0, taper: 0, bulge: 0, shiftX: 0, shiftZ: 0,
    cornerChamfer: 0, cornerRound: 0,
    voidCuts: [],
    terraceFrequency: 0, terraceDepth: 0,
    facadeColor: 0xc0d4e8, facadeOpacity: 0.55, facadeMetalness: 0.6, facadeRoughness: 0.05,
    interiorWarmth: 0.15,
    pilotis: false, groundExpansion: 1.0,
    roofStyle: "flat",
    showDiagrid: false, showExoskeleton: false, columnExpression: true,
    transitionStyle: "minimal", facadeInclination: 0,      // "less is more"
  },

  gaudi: {
    id: "gaudi",
    plateShape: "organic",
    twist: 3.0, taper: 0.1, bulge: 0.2, shiftX: 0, shiftZ: 0,
    cornerChamfer: 0, cornerRound: 1.0,
    voidCuts: [],
    terraceFrequency: 0.2, terraceDepth: 2.0,
    facadeColor: 0xd0c0a0, facadeOpacity: 0.2, facadeMetalness: 0.1, facadeRoughness: 0.8,
    interiorWarmth: 0.5,
    pilotis: false, groundExpansion: 1.15,
    roofStyle: "sculptural",
    showDiagrid: false, showExoskeleton: false, columnExpression: false,
    transitionStyle: "smooth", facadeInclination: 6,       // organic curves everywhere
  },

  kahn: {
    id: "kahn",
    plateShape: "rectangular",
    twist: 0, taper: 0, bulge: 0, shiftX: 0, shiftZ: 0,
    cornerChamfer: 0, cornerRound: 0,
    voidCuts: [
      { startFloorRatio: 0.3, endFloorRatio: 0.7, direction: "east", depthRatio: 0.15, widthRatio: 0.3 },
    ],
    terraceFrequency: 0, terraceDepth: 0,
    facadeColor: 0xb0a898, facadeOpacity: 0.15, facadeMetalness: 0.05, facadeRoughness: 0.85,
    interiorWarmth: 0.4,
    pilotis: false, groundExpansion: 1.0,
    roofStyle: "flat",
    showDiagrid: false, showExoskeleton: false, columnExpression: false,
    transitionStyle: "minimal", facadeInclination: 0,      // servant/served clarity
  },

  aalto: {
    id: "aalto",
    plateShape: "organic",
    twist: 0, taper: 0.05, bulge: 0.08, shiftX: 0, shiftZ: 0,
    cornerChamfer: 0, cornerRound: 0.6,
    voidCuts: [],
    terraceFrequency: 0.2, terraceDepth: 2.5,
    facadeColor: 0xd8d0c0, facadeOpacity: 0.25, facadeMetalness: 0.1, facadeRoughness: 0.6,
    interiorWarmth: 0.5,
    pilotis: false, groundExpansion: 1.1,
    roofStyle: "sloped",
    showDiagrid: false, showExoskeleton: false, columnExpression: false,
    transitionStyle: "smooth", facadeInclination: 2,       // gentle organic flow
  },

  ando: {
    id: "ando",
    plateShape: "rectangular",
    twist: 0, taper: 0, bulge: 0, shiftX: 0, shiftZ: 0,
    cornerChamfer: 0, cornerRound: 0,
    voidCuts: [
      { startFloorRatio: 0.2, endFloorRatio: 0.8, direction: "south", depthRatio: 0.1, widthRatio: 0.15 },
    ],
    terraceFrequency: 0, terraceDepth: 0,
    facadeColor: 0xa8a8a0, facadeOpacity: 0.12, facadeMetalness: 0.03, facadeRoughness: 0.92,
    interiorWarmth: 0.15,
    pilotis: false, groundExpansion: 1.0,
    roofStyle: "flat",
    showDiagrid: false, showExoskeleton: false, columnExpression: false,
    transitionStyle: "minimal", facadeInclination: 0,      // concrete precision, light slits
  },

  foster: {
    id: "foster",
    plateShape: "rounded",
    twist: 0, taper: 0.15, bulge: 0.05, shiftX: 0, shiftZ: 0,
    cornerChamfer: 0, cornerRound: 0.4,
    voidCuts: [],
    terraceFrequency: 0.1, terraceDepth: 1.5,
    facadeColor: 0xb8d0e8, facadeOpacity: 0.5, facadeMetalness: 0.5, facadeRoughness: 0.08,
    interiorWarmth: 0.2,
    pilotis: false, groundExpansion: 1.0,
    roofStyle: "crown",
    showDiagrid: true, showExoskeleton: false, columnExpression: false,
    transitionStyle: "crisp", facadeInclination: 0,        // high-tech precision
  },

  hadid: {
    id: "hadid",
    plateShape: "elliptical",
    twist: 2.5, taper: 0.1, bulge: 0.15, shiftX: 0.15, shiftZ: 0.1,
    cornerChamfer: 0, cornerRound: 1.0,
    voidCuts: [],
    terraceFrequency: 0.15, terraceDepth: 2.0,
    facadeColor: 0xd0d8e8, facadeOpacity: 0.4, facadeMetalness: 0.45, facadeRoughness: 0.1,
    interiorWarmth: 0.2,
    pilotis: false, groundExpansion: 1.2,
    roofStyle: "sculptural",
    showDiagrid: false, showExoskeleton: false, columnExpression: false,
    transitionStyle: "smooth", facadeInclination: 8,       // flowing parametric surfaces
  },

  koolhaas: {
    id: "koolhaas",
    plateShape: "rectangular",
    twist: 0, taper: 0, bulge: 0, shiftX: 1.2, shiftZ: 0.5,
    cornerChamfer: 0.2, cornerRound: 0,
    voidCuts: [
      { startFloorRatio: 0.25, endFloorRatio: 0.45, direction: "south", depthRatio: 0.45, widthRatio: 0.5 },
      { startFloorRatio: 0.55, endFloorRatio: 0.75, direction: "north", depthRatio: 0.3, widthRatio: 0.4 },
    ],
    terraceFrequency: 0.2, terraceDepth: 3.0,
    facadeColor: 0xc8c8d0, facadeOpacity: 0.4, facadeMetalness: 0.3, facadeRoughness: 0.2,
    interiorWarmth: 0.3,
    pilotis: false, groundExpansion: 1.0,
    roofStyle: "flat",
    showDiagrid: false, showExoskeleton: false, columnExpression: false,
    transitionStyle: "abrupt", facadeInclination: 0,       // programmatic collision, no smoothing
  },
};

// ============================================================
// Shape Generation
// ============================================================

/**
 * Generate a 2D floor plate outline based on architect FormDNA
 * Returns [x, z] coordinate pairs (meters, centered at origin)
 */
export function generateFloorOutline(
  dna: ArchitectFormDNA,
  baseW: number,
  baseD: number,
  floorIndex: number,
  totalFloors: number,
): [number, number][] {
  const t = totalFloors > 1 ? floorIndex / (totalFloors - 1) : 0.5; // 0=bottom, 1=top

  // Apply taper
  const taperScale = 1 - dna.taper * t;
  // Apply bulge (max at middle)
  const bulgeScale = 1 + dna.bulge * Math.sin(t * Math.PI);
  const scale = taperScale * bulgeScale;
  const w = baseW * scale * 0.5;
  const d = baseD * scale * 0.5;

  let points: [number, number][];

  switch (dna.plateShape) {
    case "elliptical":
      points = generateEllipse(w, d, 32);
      break;
    case "hexagonal":
      points = generatePolygon(Math.min(w, d), 6);
      // Scale to fit bounding box
      points = points.map(([x, z]) => [x * (w / Math.min(w, d)), z * (d / Math.min(w, d))]);
      break;
    case "rounded":
      points = generateRoundedRect(w, d, Math.min(w, d) * dna.cornerRound * 0.4);
      break;
    case "chamfered":
      points = generateChamferedRect(w, d, Math.min(w, d) * Math.max(dna.cornerChamfer, 0.15) * 0.4);
      break;
    case "organic":
      points = generateOrganic(w, d, floorIndex);
      break;
    case "L_shape":
      points = generateLShape(w, d, 0.4);
      break;
    default: // rectangular
      if (dna.cornerChamfer > 0) {
        points = generateChamferedRect(w, d, Math.min(w, d) * dna.cornerChamfer * 0.3);
      } else if (dna.cornerRound > 0) {
        points = generateRoundedRect(w, d, Math.min(w, d) * dna.cornerRound * 0.3);
      } else {
        points = [[-w, -d], [w, -d], [w, d], [-w, d]];
      }
  }

  // Apply twist rotation
  if (dna.twist !== 0) {
    const angle = (dna.twist * floorIndex * Math.PI) / 180;
    points = points.map(([x, z]) => [
      x * Math.cos(angle) - z * Math.sin(angle),
      x * Math.sin(angle) + z * Math.cos(angle),
    ]);
  }

  // Apply per-floor shift
  if (dna.shiftX !== 0 || dna.shiftZ !== 0) {
    const sx = dna.shiftX * floorIndex;
    const sz = dna.shiftZ * floorIndex;
    points = points.map(([x, z]) => [x + sx, z + sz]);
  }

  return points;
}

function generateEllipse(rx: number, ry: number, segments: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    pts.push([rx * Math.cos(angle), ry * Math.sin(angle)]);
  }
  return pts;
}

function generatePolygon(radius: number, sides: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    pts.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
  }
  return pts;
}

function generateRoundedRect(hw: number, hd: number, radius: number): [number, number][] {
  const r = Math.min(radius, hw * 0.45, hd * 0.45);
  const pts: [number, number][] = [];
  const segs = 6;
  // Bottom-right corner
  for (let i = 0; i <= segs; i++) {
    const a = -Math.PI / 2 + (i / segs) * (Math.PI / 2);
    pts.push([hw - r + r * Math.cos(a), -hd + r + r * Math.sin(a)]);
  }
  // Top-right
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * (Math.PI / 2);
    pts.push([hw - r + r * Math.cos(a), hd - r + r * Math.sin(a)]);
  }
  // Top-left
  for (let i = 0; i <= segs; i++) {
    const a = Math.PI / 2 + (i / segs) * (Math.PI / 2);
    pts.push([-hw + r + r * Math.cos(a), hd - r + r * Math.sin(a)]);
  }
  // Bottom-left
  for (let i = 0; i <= segs; i++) {
    const a = Math.PI + (i / segs) * (Math.PI / 2);
    pts.push([-hw + r + r * Math.cos(a), -hd + r + r * Math.sin(a)]);
  }
  return pts;
}

function generateChamferedRect(hw: number, hd: number, chamfer: number): [number, number][] {
  const c = Math.min(chamfer, hw * 0.45, hd * 0.45);
  return [
    [-hw + c, -hd], [hw - c, -hd],     // bottom
    [hw, -hd + c], [hw, hd - c],        // right
    [hw - c, hd], [-hw + c, hd],        // top
    [-hw, hd - c], [-hw, -hd + c],      // left
  ];
}

function generateOrganic(hw: number, hd: number, seed: number): [number, number][] {
  const pts: [number, number][] = [];
  const segs = 24;
  for (let i = 0; i < segs; i++) {
    const angle = (i / segs) * Math.PI * 2;
    // Organic noise based on seed
    const noise = 1 + 0.08 * Math.sin(angle * 3 + seed * 0.5) + 0.04 * Math.cos(angle * 5 + seed * 0.7);
    pts.push([hw * noise * Math.cos(angle), hd * noise * Math.sin(angle)]);
  }
  return pts;
}

function generateLShape(hw: number, hd: number, cutRatio: number): [number, number][] {
  const cx = hw * cutRatio;
  const cz = hd * cutRatio;
  return [
    [-hw, -hd], [hw, -hd], [hw, hd - cz],
    [hw - cx, hd - cz], [hw - cx, hd], [-hw, hd],
  ];
}

/**
 * Check if a point is inside a void cut for the given floor
 */
export function isInVoidCut(
  dna: ArchitectFormDNA,
  floorRatio: number,
  x: number, z: number,
  hw: number, hd: number,
): boolean {
  for (const vc of dna.voidCuts) {
    if (floorRatio < vc.startFloorRatio || floorRatio > vc.endFloorRatio) continue;

    const cutDepth = (vc.direction === "east" || vc.direction === "west") ? hw * vc.depthRatio : hd * vc.depthRatio;
    const cutWidth = (vc.direction === "east" || vc.direction === "west") ? hd * vc.widthRatio : hw * vc.widthRatio;

    switch (vc.direction) {
      case "south":
        if (z < -hd + cutDepth && Math.abs(x) < cutWidth) return true;
        break;
      case "north":
        if (z > hd - cutDepth && Math.abs(x) < cutWidth) return true;
        break;
      case "east":
        if (x > hw - cutDepth && Math.abs(z) < cutWidth) return true;
        break;
      case "west":
        if (x < -hw + cutDepth && Math.abs(z) < cutWidth) return true;
        break;
    }
  }
  return false;
}

/**
 * Determine if a floor should have a terrace on a given side
 */
export function shouldHaveTerrace(dna: ArchitectFormDNA, floorIndex: number, totalFloors: number): boolean {
  if (dna.terraceFrequency <= 0) return false;
  // Deterministic pseudo-random based on floor index
  const hash = Math.sin(floorIndex * 12.9898 + 78.233) * 43758.5453;
  return (hash - Math.floor(hash)) < dna.terraceFrequency;
}

/**
 * Get the dominant FormDNA for a building based on style_refs across all nodes.
 * If mixed or no style, returns a default FormDNA.
 */
export function getDominantFormDNA(styleRefs: (string | undefined)[]): ArchitectFormDNA {
  const counts = new Map<string, number>();
  for (const s of styleRefs) {
    if (s && s !== "none") counts.set(s, (counts.get(s) || 0) + 1);
  }

  let dominant = "";
  let maxCount = 0;
  for (const [k, v] of counts) {
    if (v > maxCount) { maxCount = v; dominant = k; }
  }

  if (dominant && ARCHITECT_FORM_DNA[dominant]) {
    return ARCHITECT_FORM_DNA[dominant];
  }

  // Default: a balanced modern design
  return ARCHITECT_FORM_DNA["renzo_piano"];
}

/**
 * Get FormDNA for a specific floor, considering per-floor style_ref.
 * Falls back to building-level dominant DNA.
 */
export function getFloorFormDNA(
  floorStyleRef: string | undefined,
  dominantDNA: ArchitectFormDNA,
): ArchitectFormDNA {
  if (floorStyleRef && floorStyleRef !== "none" && ARCHITECT_FORM_DNA[floorStyleRef]) {
    return ARCHITECT_FORM_DNA[floorStyleRef];
  }
  return dominantDNA;
}
