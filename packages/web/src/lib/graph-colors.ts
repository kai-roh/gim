// ============================================================
// Shared color constants for D3 and Three.js viewers
// Corporate HQ zones and functions
// ============================================================

export const ZONE_COLORS: Record<string, string> = {
  basement: "#4a3728",
  ground: "#6b5b3a",
  lower: "#3a6b4a",
  middle: "#3a5a8a",
  upper: "#5a4a8a",
  penthouse: "#8a5a3a",
  rooftop: "#6a7a4a",
};

export const ZONE_COLORS_HEX: Record<string, number> = {
  basement: 0x4a3728,
  ground: 0x6b5b3a,
  lower: 0x3a6b4a,
  middle: 0x3a5a8a,
  upper: 0x5a4a8a,
  penthouse: 0x8a5a3a,
  rooftop: 0x6a7a4a,
};

export const FUNC_COLORS: Record<string, string> = {
  // CORE
  elevator_core: "#555",
  stairwell: "#444",
  elevator_lobby: "#666",
  service_shaft: "#3a3a3a",
  // OFFICE
  open_office: "#4488cc",
  premium_office: "#5498dc",
  executive_suite: "#64a8ec",
  coworking: "#3478bc",
  focus_room: "#4478ac",
  // EXPERIENCE
  brand_showroom: "#e4a844",
  exhibition_hall: "#d49834",
  experiential_retail: "#c48824",
  installation_space: "#b47814",
  // RETAIL
  cafe: "#a4884a",
  flagship_store: "#c49844",
  // PUBLIC
  lobby: "#44b4a4",
  atrium: "#34a494",
  public_void: "#44c4b4",
  community_space: "#54a484",
  event_space: "#44a474",
  // SOCIAL
  lounge: "#7a88aa",
  meditation_room: "#6a78aa",
  // AMENITY
  cafeteria: "#8a7854",
  meeting_room: "#5a78aa",
  auditorium: "#6a68ba",
  nursery: "#7a9a6a",
  // OUTDOOR
  sky_garden: "#44c464",
  rooftop_bar: "#ba7a4a",
  // MECHANICAL
  mechanical_room: "#7a7a4a",
  electrical_room: "#6a6a3a",
  server_room: "#5a6a5a",
  // PARKING
  parking: "#5a4a3a",
  loading_dock: "#4a3a2a",
  bicycle_storage: "#5a5a4a",
  // GALLERY
  gallery: "#7a68aa",
};

export const FUNC_COLORS_HEX: Record<string, number> = {
  // CORE
  elevator_core: 0x666666,
  stairwell: 0x555555,
  elevator_lobby: 0x666666,
  service_shaft: 0x444444,
  // OFFICE
  open_office: 0x4488cc,
  premium_office: 0x5498dc,
  executive_suite: 0x64a8ec,
  coworking: 0x3478bc,
  focus_room: 0x4478ac,
  // EXPERIENCE
  brand_showroom: 0xe4a844,
  exhibition_hall: 0xd49834,
  experiential_retail: 0xc48824,
  installation_space: 0xb47814,
  // RETAIL
  cafe: 0xa4884a,
  flagship_store: 0xc49844,
  // PUBLIC
  lobby: 0x44b4a4,
  atrium: 0x34a494,
  public_void: 0x44c4b4,
  community_space: 0x54a484,
  event_space: 0x44a474,
  // SOCIAL
  lounge: 0x7a88aa,
  meditation_room: 0x6a78aa,
  // AMENITY
  cafeteria: 0x8a7854,
  meeting_room: 0x5a78aa,
  auditorium: 0x6a68ba,
  nursery: 0x7a9a6a,
  // OUTDOOR
  sky_garden: 0x44c464,
  rooftop_bar: 0xba7a4a,
  // MECHANICAL
  mechanical_room: 0x7a7a4a,
  electrical_room: 0x6a6a3a,
  server_room: 0x5a6a5a,
  // PARKING
  parking: 0x5a4a3a,
  loading_dock: 0x4a3a2a,
  bicycle_storage: 0x5a5a4a,
  // GALLERY
  gallery: 0x7a68aa,
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
  STYLE_BOUNDARY: "#f6a",
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
  STYLE_BOUNDARY: 0xff66aa,
};

export const FUNC_ORDER = [
  "elevator_core", "stairwell", "elevator_lobby", "service_shaft",
  "lobby", "atrium", "public_void", "community_space", "event_space",
  "brand_showroom", "exhibition_hall", "experiential_retail", "installation_space",
  "cafe", "flagship_store",
  "open_office", "premium_office", "executive_suite", "coworking", "focus_room",
  "lounge", "meditation_room",
  "cafeteria", "meeting_room", "auditorium", "nursery",
  "sky_garden", "rooftop_bar", "gallery",
  "mechanical_room", "electrical_room", "server_room",
  "parking", "loading_dock", "bicycle_storage",
];

export function floorLabel(f: number): string {
  return f < 0 ? "B" + Math.abs(f) : f + "F";
}
