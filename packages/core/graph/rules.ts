// ============================================================
// Spatial Mass Graph Helpers
// ============================================================

import type {
  MassGeometryProposal,
  MassNodeKind,
  MassPrimitive,
  MassRelationRule,
  NodeHierarchy,
  RelativePlacement,
  RelativeProportion,
  RelativeScale,
  SkinTransparency,
  Porosity,
  SpanCharacter,
  SurfaceOrientation,
} from "../forum/types";

export const SCALE_ORDER: RelativeScale[] = ["xs", "small", "medium", "large", "xl"];

export const DEFAULT_GEOMETRY: MassGeometryProposal = {
  primitive: "block",
  width: "medium",
  depth: "medium",
  height: "medium",
  proportion: "compact",
  skin: "mixed",
  porosity: "solid",
  vertical_placement: "mid",
  span_character: "single",
  orientation: "orthogonal",
};

const INVERSE_RULES: Record<MassRelationRule, MassRelationRule> = {
  above: "below",
  below: "above",
  adjacent: "adjacent",
  wraps: "inside",
  inside: "contains",
  contains: "inside",
  penetrates: "penetrates",
  linked: "linked",
  offset_from: "offset_from",
  aligned_with: "aligned_with",
  bridges_to: "linked",
  rests_on: "above",
};

export function inverseRuleFor(rule: MassRelationRule): MassRelationRule {
  return INVERSE_RULES[rule] ?? rule;
}

export function normalizeId(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || `mass_${Date.now()}`;
}

export function clampInfluence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function pickMostCommon<T extends string>(values: T[], fallback: T): T {
  if (values.length === 0) return fallback;
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let maxKey = fallback;
  let maxValue = -1;
  for (const [key, count] of counts) {
    if (count > maxValue) {
      maxKey = key;
      maxValue = count;
    }
  }
  return maxKey;
}

export function pickLongest(values: string[], fallback = ""): string {
  const filtered = values.map((value) => value.trim()).filter(Boolean);
  if (filtered.length === 0) return fallback;
  return filtered.sort((a, b) => b.length - a.length)[0];
}

export function average(values: number[], fallback = 0): number {
  if (values.length === 0) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function mergeKeywords(keywordSets: string[][]): string[] {
  const counts = new Map<string, number>();
  for (const set of keywordSets) {
    for (const keyword of set.map((value) => value.trim()).filter(Boolean)) {
      counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([keyword]) => keyword);
}

export function ensureGeometry(
  geometry?: Partial<MassGeometryProposal>
): MassGeometryProposal {
  return {
    primitive: (geometry?.primitive as MassPrimitive) ?? DEFAULT_GEOMETRY.primitive,
    width: (geometry?.width as RelativeScale) ?? DEFAULT_GEOMETRY.width,
    depth: (geometry?.depth as RelativeScale) ?? DEFAULT_GEOMETRY.depth,
    height: (geometry?.height as RelativeScale) ?? DEFAULT_GEOMETRY.height,
    proportion:
      (geometry?.proportion as RelativeProportion) ?? DEFAULT_GEOMETRY.proportion,
    skin: (geometry?.skin as SkinTransparency) ?? DEFAULT_GEOMETRY.skin,
    porosity: (geometry?.porosity as Porosity) ?? DEFAULT_GEOMETRY.porosity,
    vertical_placement:
      (geometry?.vertical_placement as RelativePlacement) ??
      DEFAULT_GEOMETRY.vertical_placement,
    span_character:
      (geometry?.span_character as SpanCharacter) ?? DEFAULT_GEOMETRY.span_character,
    orientation:
      (geometry?.orientation as SurfaceOrientation) ?? DEFAULT_GEOMETRY.orientation,
  };
}

export function defaultNodeName(
  kind: MassNodeKind,
  hierarchy: NodeHierarchy,
  role: string
): string {
  return `${hierarchy}_${kind}_${role || "mass"}`.replace(/\s+/g, "_");
}
