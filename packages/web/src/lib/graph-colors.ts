import { displayColorForNodeId } from "@gim/core/graph/colors";

export const KIND_COLORS: Record<string, string> = {
  solid: "#63d58a",
  void: "#ff9f43",
  core: "#5b8cff",
  connector: "#d56dff",
};

export const HIERARCHY_COLORS: Record<string, string> = {
  primary: "#ffffff",
  secondary: "#b5c1d8",
  tertiary: "#708090",
};

export const RELATION_COLORS: Record<string, string> = {
  stack: "#5bc0eb",
  contact: "#52b788",
  enclosure: "#f4a261",
  intersection: "#e76f51",
  connection: "#b565f5",
  alignment: "#90be6d",
};

export const PRIMITIVE_COLORS: Record<string, string> = {
  block: "#8bd3dd",
  bar: "#fcbf49",
  plate: "#ef476f",
  ring: "#06d6a0",
  tower: "#7b2cbf",
  bridge: "#ffd166",
  cylinder: "#a9def9",
};

export const SCALE_LABELS: Record<string, string> = {
  xs: "XS",
  small: "S",
  medium: "M",
  large: "L",
  xl: "XL",
};

export function massColor(nodeId: string): string {
  return displayColorForNodeId(nodeId);
}

export function nodeColor(kind: string, primitive?: string): string {
  return KIND_COLORS[kind] || PRIMITIVE_COLORS[primitive || ""] || "#6c757d";
}

// ============================================================
// SpatialMassGraph colors (v2)
// ============================================================

export const MASS_TYPE_COLORS: Record<string, string> = {
  solid: "#4488cc",
  void: "#cc4444",
  core: "#888888",
  connector: "#44cc88",
};

export const MASS_TYPE_COLORS_HEX: Record<string, number> = {
  solid: 0x4488cc,
  void: 0xcc4444,
  core: 0x888888,
  connector: 0x44cc88,
};

export const MASS_RELATION_COLORS: Record<string, string> = {
  stack: "#5566aa",
  contact: "#55aa66",
  enclosure: "#ffaa66",
  intersection: "#ff6666",
  connection: "#66aaff",
  alignment: "#66ffaa",
};

export const MASS_RELATION_COLORS_HEX: Record<string, number> = {
  stack: 0x5566aa,
  contact: 0x55aa66,
  enclosure: 0xffaa66,
  intersection: 0xff6666,
  connection: 0x66aaff,
  alignment: 0x66ffaa,
};

// Per-mass identity palette (12 distinct colors)
export const MASS_IDENTITY_PALETTE = [
  "#4488cc", "#cc8844", "#44cc88", "#cc4488",
  "#88cc44", "#8844cc", "#44cccc", "#cc4444",
  "#88cc88", "#cc8888", "#4444cc", "#cccc44",
];

export const MASS_IDENTITY_PALETTE_HEX = [
  0x4488cc, 0xcc8844, 0x44cc88, 0xcc4488,
  0x88cc44, 0x8844cc, 0x44cccc, 0xcc4444,
  0x88cc88, 0xcc8888, 0x4444cc, 0xcccc44,
];

export function getMassIdentityColor(index: number): string {
  return MASS_IDENTITY_PALETTE[index % MASS_IDENTITY_PALETTE.length];
}

export function getMassIdentityColorHex(index: number): number {
  return MASS_IDENTITY_PALETTE_HEX[index % MASS_IDENTITY_PALETTE_HEX.length];
}
