// ============================================================
// Shared color constants for D3 and Three.js viewers
// Extracted from viewer.html / viewer3d.html
// ============================================================

export const ZONE_COLORS: Record<string, string> = {
  basement: "#4a3728",
  podium: "#6b5b3a",
  low_rise: "#3a6b4a",
  mid_rise: "#3a5a8a",
  sky_lobby: "#8a5a9a",
  high_rise: "#8a3a3a",
  mechanical: "#5a5a3a",
  crown: "#9a7a2a",
  rooftop: "#6a6a7a",
};

export const ZONE_COLORS_HEX: Record<string, number> = {
  basement: 0x4a3728,
  podium: 0x6b5b3a,
  low_rise: 0x3a6b4a,
  mid_rise: 0x3a5a8a,
  sky_lobby: 0x8a5a9a,
  high_rise: 0x8a3a3a,
  mechanical: 0x5a5a3a,
  crown: 0x9a7a2a,
  rooftop: 0x6a6a7a,
};

export const FUNC_COLORS: Record<string, string> = {
  elevator_core: "#555",
  stairwell: "#444",
  service_shaft: "#3a3a3a",
  parking: "#5a4a3a",
  loading_dock: "#4a3a2a",
  retail: "#d4a844",
  restaurant: "#c49434",
  cultural_facility: "#b48424",
  public_void: "#44b4a4",
  sky_garden: "#44c464",
  observation_deck: "#e4c444",
  sky_lounge: "#d4a444",
  refuge_area: "#e45444",
  open_office: "#4488cc",
  premium_office: "#5498dc",
  executive_suite: "#64a8ec",
  coworking: "#3478bc",
  hotel_room: "#c45464",
  hotel_suite: "#d46474",
  hotel_lobby: "#b44454",
  hotel_amenity: "#a43444",
  mechanical_room: "#7a7a4a",
  electrical_room: "#6a6a3a",
  water_tank: "#5a6a4a",
  outrigger: "#aa6633",
  belt_truss: "#996633",
  conference: "#5a78aa",
  fitness: "#4a98aa",
  spa: "#4a88ba",
  library: "#6a78aa",
  gallery: "#7a68aa",
  rooftop_bar: "#ba7a4a",
  elevator_lobby: "#666",
};

export const FUNC_COLORS_HEX: Record<string, number> = {
  elevator_core: 0x666666,
  stairwell: 0x555555,
  service_shaft: 0x444444,
  parking: 0x5a4a3a,
  loading_dock: 0x4a3a2a,
  retail: 0xd4a844,
  restaurant: 0xc49434,
  cultural_facility: 0xb48424,
  public_void: 0x44b4a4,
  sky_garden: 0x44c464,
  observation_deck: 0xe4c444,
  sky_lounge: 0xd4a444,
  refuge_area: 0xe45444,
  open_office: 0x4488cc,
  premium_office: 0x5498dc,
  executive_suite: 0x64a8ec,
  coworking: 0x3478bc,
  hotel_room: 0xc45464,
  hotel_suite: 0xd46474,
  hotel_lobby: 0xb44454,
  hotel_amenity: 0xa43444,
  mechanical_room: 0x7a7a4a,
  electrical_room: 0x6a6a3a,
  water_tank: 0x5a6a4a,
  outrigger: 0xaa6633,
  belt_truss: 0x996633,
  conference: 0x5a78aa,
  fitness: 0x4a98aa,
  spa: 0x4a88ba,
  library: 0x6a78aa,
  gallery: 0x7a68aa,
  rooftop_bar: 0xba7a4a,
  elevator_lobby: 0x666666,
};

export const EDGE_COLORS: Record<string, string> = {
  STACKED_ON: "#334",
  ADJACENT_TO: "#343",
  VERTICAL_CONNECT: "#a6f",
  SERVED_BY: "#6af",
  ZONE_BOUNDARY: "#fa6",
  FACES: "#6fa",
  STRUCTURAL_TRANSFER: "#f66",
  PROGRAM_LINK: "#ff6",
};

export const EDGE_COLORS_HEX: Record<string, number> = {
  STACKED_ON: 0x334455,
  ADJACENT_TO: 0x335544,
  VERTICAL_CONNECT: 0xaa66ff,
  SERVED_BY: 0x66aaff,
  ZONE_BOUNDARY: 0xffaa66,
  FACES: 0x66ffaa,
  STRUCTURAL_TRANSFER: 0xff6666,
  PROGRAM_LINK: 0xffff66,
};

export const FUNC_ORDER = [
  "elevator_core", "stairwell", "service_shaft", "parking", "loading_dock",
  "retail", "restaurant", "cultural_facility", "public_void", "sky_garden", "refuge_area",
  "premium_office", "open_office", "executive_suite", "coworking", "elevator_lobby",
  "hotel_room", "hotel_suite", "hotel_lobby", "hotel_amenity",
  "sky_lounge", "observation_deck", "rooftop_bar",
  "mechanical_room", "electrical_room", "water_tank", "outrigger", "belt_truss",
  "conference", "fitness", "spa", "library", "gallery",
];

export function floorLabel(f: number): string {
  return f < 0 ? "B" + Math.abs(f) : f + "F";
}
