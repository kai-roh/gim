// ============================================================
// Spatial Mass Graph Helpers
// ============================================================

import type {
  MassGeometryProposal,
  MassNodeKind,
  MassPrimitive,
  MassNodeVariantSpaceProposal,
  MassRelationRule,
  MassRelationVariantSpaceProposal,
  NodeHierarchy,
  NumericRange,
  RelativePlacement,
  RelativeProportion,
  RelativeScale,
  SkinTransparency,
  Porosity,
  StorySpan,
  SpanCharacter,
  SurfaceOrientation,
  VariantFreedom,
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
  story_count: null,
  floor_to_floor_m: null,
  target_gfa_m2: null,
  height_m: null,
  plan_aspect_ratio: null,
  story_span: {
    start: null,
    end: null,
  },
};

export const DEFAULT_NODE_VARIANT_SPACE: MassNodeVariantSpaceProposal = {
  alternative_primitives: [],
  aspect_ratio_range: { min: 1, max: 1 },
  footprint_scale_range: { min: 1, max: 1 },
  height_scale_range: { min: 1, max: 1 },
  radial_distance_scale_range: { min: 1, max: 1 },
  angle_jitter_deg: 0,
  freedom: "fixed",
};

export const DEFAULT_RELATION_VARIANT_SPACE: MassRelationVariantSpaceProposal = {
  distance_scale_range: { min: 1, max: 1 },
  lateral_offset_range_m: { min: 0, max: 0 },
};

function normalizeStorySpan(span?: Partial<StorySpan>): StorySpan {
  return {
    start:
      typeof span?.start === "number" && Number.isFinite(span.start)
        ? Math.max(1, Math.round(span.start))
        : null,
    end:
      typeof span?.end === "number" && Number.isFinite(span.end)
        ? Math.max(1, Math.round(span.end))
        : null,
  };
}

function freedomDefaults(freedom: VariantFreedom): Pick<
  MassNodeVariantSpaceProposal,
  | "aspect_ratio_range"
  | "footprint_scale_range"
  | "height_scale_range"
  | "radial_distance_scale_range"
  | "angle_jitter_deg"
> {
  if (freedom === "exploratory") {
    return {
      aspect_ratio_range: { min: 0.7, max: 1.45 },
      footprint_scale_range: { min: 0.8, max: 1.28 },
      height_scale_range: { min: 0.82, max: 1.24 },
      radial_distance_scale_range: { min: 0.72, max: 1.4 },
      angle_jitter_deg: 34,
    };
  }

  if (freedom === "guided") {
    return {
      aspect_ratio_range: { min: 0.85, max: 1.2 },
      footprint_scale_range: { min: 0.9, max: 1.14 },
      height_scale_range: { min: 0.9, max: 1.12 },
      radial_distance_scale_range: { min: 0.88, max: 1.18 },
      angle_jitter_deg: 18,
    };
  }

  return {
    aspect_ratio_range: DEFAULT_NODE_VARIANT_SPACE.aspect_ratio_range,
    footprint_scale_range: DEFAULT_NODE_VARIANT_SPACE.footprint_scale_range,
    height_scale_range: DEFAULT_NODE_VARIANT_SPACE.height_scale_range,
    radial_distance_scale_range:
      DEFAULT_NODE_VARIANT_SPACE.radial_distance_scale_range,
    angle_jitter_deg: DEFAULT_NODE_VARIANT_SPACE.angle_jitter_deg,
  };
}

function normalizeNumericRange(
  range: Partial<NumericRange> | undefined,
  fallback: NumericRange
): NumericRange {
  const fallbackMin =
    typeof fallback.min === "number" && Number.isFinite(fallback.min)
      ? fallback.min
      : null;
  const fallbackMax =
    typeof fallback.max === "number" && Number.isFinite(fallback.max)
      ? fallback.max
      : null;

  let min =
    typeof range?.min === "number" && Number.isFinite(range.min) ? range.min : fallbackMin;
  let max =
    typeof range?.max === "number" && Number.isFinite(range.max) ? range.max : fallbackMax;

  if (min === null && max !== null) min = max;
  if (max === null && min !== null) max = min;
  if (min === null && max === null) {
    min = fallbackMin ?? 0;
    max = fallbackMax ?? min;
  }
  if (min !== null && max !== null && min > max) {
    [min, max] = [max, min];
  }

  return {
    min,
    max,
  };
}

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
    story_count:
      typeof geometry?.story_count === "number" && Number.isFinite(geometry.story_count)
        ? Math.max(1, Math.round(geometry.story_count))
        : DEFAULT_GEOMETRY.story_count,
    floor_to_floor_m:
      typeof geometry?.floor_to_floor_m === "number" && Number.isFinite(geometry.floor_to_floor_m)
        ? Math.max(0.1, geometry.floor_to_floor_m)
        : DEFAULT_GEOMETRY.floor_to_floor_m,
    target_gfa_m2:
      typeof geometry?.target_gfa_m2 === "number" && Number.isFinite(geometry.target_gfa_m2)
        ? Math.max(0, geometry.target_gfa_m2)
        : DEFAULT_GEOMETRY.target_gfa_m2,
    height_m:
      typeof geometry?.height_m === "number" && Number.isFinite(geometry.height_m)
        ? Math.max(0.1, geometry.height_m)
        : DEFAULT_GEOMETRY.height_m,
    plan_aspect_ratio:
      typeof geometry?.plan_aspect_ratio === "number" &&
      Number.isFinite(geometry.plan_aspect_ratio)
        ? Math.max(0.2, geometry.plan_aspect_ratio)
        : DEFAULT_GEOMETRY.plan_aspect_ratio,
    story_span: normalizeStorySpan(geometry?.story_span),
  };
}

export function ensureNodeVariantSpace(
  variantSpace: Partial<MassNodeVariantSpaceProposal> | undefined,
  geometry?: Partial<MassGeometryProposal>
): MassNodeVariantSpaceProposal {
  const freedom = (variantSpace?.freedom as VariantFreedom) ?? DEFAULT_NODE_VARIANT_SPACE.freedom;
  const defaults = freedomDefaults(freedom);
  const basePrimitive = (geometry?.primitive as MassPrimitive) ?? DEFAULT_GEOMETRY.primitive;
  const alternativePrimitives = Array.from(
    new Set(
      [...(variantSpace?.alternative_primitives ?? []), basePrimitive].filter(
        (value): value is MassPrimitive => Boolean(value)
      )
    )
  );

  return {
    alternative_primitives:
      alternativePrimitives.length > 0 ? alternativePrimitives : [basePrimitive],
    aspect_ratio_range: normalizeNumericRange(
      variantSpace?.aspect_ratio_range,
      defaults.aspect_ratio_range
    ),
    footprint_scale_range: normalizeNumericRange(
      variantSpace?.footprint_scale_range,
      defaults.footprint_scale_range
    ),
    height_scale_range: normalizeNumericRange(
      variantSpace?.height_scale_range,
      defaults.height_scale_range
    ),
    radial_distance_scale_range: normalizeNumericRange(
      variantSpace?.radial_distance_scale_range,
      defaults.radial_distance_scale_range
    ),
    angle_jitter_deg:
      typeof variantSpace?.angle_jitter_deg === "number" &&
      Number.isFinite(variantSpace.angle_jitter_deg)
        ? Math.max(0, variantSpace.angle_jitter_deg)
        : defaults.angle_jitter_deg,
    freedom,
  };
}

export function ensureRelationVariantSpace(
  variantSpace?: Partial<MassRelationVariantSpaceProposal>
): MassRelationVariantSpaceProposal {
  return {
    distance_scale_range: normalizeNumericRange(
      variantSpace?.distance_scale_range,
      DEFAULT_RELATION_VARIANT_SPACE.distance_scale_range
    ),
    lateral_offset_range_m: normalizeNumericRange(
      variantSpace?.lateral_offset_range_m,
      DEFAULT_RELATION_VARIANT_SPACE.lateral_offset_range_m
    ),
  };
}

export function defaultNodeName(
  kind: MassNodeKind,
  hierarchy: NodeHierarchy,
  role: string
): string {
  return `${hierarchy}_${kind}_${role || "mass"}`.replace(/\s+/g, "_");
}
