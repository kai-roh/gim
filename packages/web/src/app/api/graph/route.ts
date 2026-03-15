import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { withResolvedMassModel } from "@gim/core";
import type { SpatialMassGraph, MassNode, MassRelation, RelativeScale, RelativePlacement } from "@gim/core";
import { inverseRuleFor } from "@gim/core";

/** Convert legacy graph JSON (v0 format) to SpatialMassGraph (v2) */
function normalizeLegacyGraph(raw: Record<string, any>): SpatialMassGraph {
  const project = raw.project ?? raw.global ?? {
    site: { location: "", dimensions: [40, 35], far: 300, bcr: 60, height_limit: 50, context: { north: "", south: "", east: "", west: "" } },
    program: { total_gfa: 0, uses: [] },
    constraints: [],
  };

  const PLACEMENT_MAP: Record<string, RelativePlacement> = {
    basement: "subgrade",
    ground: "grounded",
    low: "low",
    mid: "mid",
    upper: "upper",
    crown: "crown",
    top: "crown",
  };

  const SCALE_MAP: Record<string, RelativeScale> = {
    xs: "xs",
    small: "small",
    medium: "medium",
    large: "large",
    xl: "xl",
  };

  const nodes: MassNode[] = (raw.nodes ?? []).map((n: any) => {
    const scaleHint = n.geometry?.scale?.hint ?? {};
    const scaleCategory = n.geometry?.scale?.category ?? "medium";

    return {
      id: n.id,
      name: n.label ?? n.name ?? n.id,
      kind: n.kind ?? n.type ?? "solid",
      hierarchy: n.hierarchy ?? "primary",
      spatial_role: n.spatial_role ?? n.narrative?.intent_text ?? "",
      geometry: {
        primitive: n.geometry?.primitive ?? "block",
        width: SCALE_MAP[scaleCategory] ?? "medium",
        depth: SCALE_MAP[scaleCategory] ?? "medium",
        height: SCALE_MAP[scaleCategory] ?? "medium",
        proportion: n.geometry?.proportion ?? "compact",
        skin: n.geometry?.skin ?? "opaque",
        porosity: n.geometry?.porosity ?? "solid",
        vertical_placement: PLACEMENT_MAP[n.floor_zone ?? ""] ?? n.geometry?.vertical_placement ?? "grounded",
        span_character: n.geometry?.span_character ?? "single",
        orientation: n.geometry?.orientation ?? "orthogonal",
        story_count: n.geometry?.story_count ?? null,
        floor_to_floor_m: n.geometry?.floor_to_floor_m ?? null,
        target_gfa_m2: n.geometry?.target_gfa_m2 ?? null,
        height_m: n.geometry?.height_m ?? null,
        plan_aspect_ratio: n.geometry?.plan_aspect_ratio ?? null,
        story_span: n.geometry?.story_span ?? { start: null, end: null },
      },
      variant_space: n.variant_space ?? {
        alternative_primitives: [],
        aspect_ratio_range: { min: null, max: null },
        footprint_scale_range: { min: null, max: null },
        height_scale_range: { min: null, max: null },
        radial_distance_scale_range: { min: null, max: null },
        angle_jitter_deg: null,
        freedom: "fixed",
      },
      relative_position: n.relative_position ?? {
        anchor_to: null,
        relation_hint: null,
      },
      narrative: {
        role: n.narrative?.role ?? n.narrative?.intent_text ?? "",
        intent: n.narrative?.intent ?? n.narrative?.intent_text ?? "",
        spatial_character: n.narrative?.spatial_character ?? n.narrative?.architectural_description ?? "",
        facade_material_light: n.narrative?.facade_material_light ?? n.narrative?.facade_text ?? "",
        image_prompt_notes: n.narrative?.image_prompt_notes ?? "",
        keywords: n.narrative?.keywords ?? n.programs ?? [],
      },
      architect_influences: n.architect_influences ?? Object.entries(n.narrative?.architect_influence ?? {}).map(
        ([id, weight]: [string, any]) => ({ architect_id: id, weight: weight as number, contribution: "" })
      ),
      discussion_trace: n.discussion_trace ?? (n.narrative?.discussion_trace
        ? [{ architect_id: "consensus", phase: "convergence" as const, summary: n.narrative.discussion_trace }]
        : []),
      properties: n.properties ?? {},
    } satisfies MassNode;
  });

  const relations: MassRelation[] = (raw.relations ?? []).map((r: any) => ({
    id: r.id,
    source: r.source ?? r.source_id,
    target: r.target ?? r.target_id,
    family: r.family ?? "contact",
    rule: r.rule ?? "adjacent",
    inverse_rule: r.inverse_rule ?? inverseRuleFor(r.rule ?? "adjacent"),
    strength: r.strength ?? "soft",
    weight: r.weight ?? 1,
    rationale: r.rationale ?? r.description ?? "",
    constraints: r.constraints ?? {
      geometry_effect: r.geometry_effect ?? "attach",
      clearance: "medium",
    },
    evidence: r.evidence ?? [],
    variant_space: r.variant_space ?? {
      distance_scale_range: { min: null, max: null },
      lateral_offset_range_m: { min: null, max: null },
    },
  } satisfies MassRelation));

  return {
    project,
    nodes,
    relations,
    narrative: raw.narrative ?? {
      project_intro: raw.composition_summary ?? "",
      overall_architectural_concept: "",
      massing_strategy_summary: "",
      facade_and_material_summary: "",
      public_to_private_sequence: "",
      spatial_character_summary: "",
      image_direction: "",
    },
    provenance: raw.provenance ?? {
      architect_contributions: [],
      key_decisions: [],
    },
    resolved_model: raw.resolved_model ?? {
      nodes: [],
      relations: [],
      variant_id: "legacy",
      variant_label: "Legacy Import",
    },
    metadata: raw.metadata ?? {
      created_at: new Date().toISOString(),
      source_forum: "legacy",
      node_count: nodes.length,
      relation_count: relations.length,
    },
  };
}

function isLegacyFormat(data: Record<string, any>): boolean {
  if (data.global && !data.project) return true;
  const firstNode = data.nodes?.[0];
  if (firstNode && ("type" in firstNode || "label" in firstNode) && !("kind" in firstNode)) return true;
  return false;
}

export async function GET() {
  const graphPath = path.resolve(process.cwd(), "../../graph_output/spatial_mass_graph.json");

  if (!fs.existsSync(graphPath)) {
    return NextResponse.json(
      { error: "Graph data not found. Run `npm run graph` first." },
      { status: 404 }
    );
  }

  const raw = JSON.parse(fs.readFileSync(graphPath, "utf-8"));
  const graph = isLegacyFormat(raw) ? normalizeLegacyGraph(raw) : raw;

  return NextResponse.json(withResolvedMassModel(graph));
}
