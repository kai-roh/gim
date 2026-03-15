import * as fs from "fs/promises";
import * as path from "path";
import { loadArchitectProfile, type SpatialMassGraph } from "@gim/core";

const DATA_DIR = path.resolve(process.cwd(), "../../data");
const PROMPT_TEMPLATE_PATH = path.join(DATA_DIR, "templates", "image_generation_prompt.md");
const ARCHITECT_SUMMARIES_PATH = path.join(
  DATA_DIR,
  "references",
  "architect_image_summaries.md"
);

type ArchitectImageSummary = {
  id: string;
  name: string;
  summary: string;
  materials: string[];
};

type ArchitectInfluenceAverage = {
  id: string;
  name: string;
  averageWeight: number;
  normalizedWeight: number;
  summary: string;
  materials: string[];
};

function parseArchitectSummaries(markdown: string) {
  const summaries = new Map<string, ArchitectImageSummary>();
  const sections = markdown.split(/^##\s+/m).slice(1);

  for (const section of sections) {
    const lines = section
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const id = lines[0];
    let name = id;
    let summary = "";
    let materials = "";

    for (const line of lines.slice(1)) {
      if (line.startsWith("Name:")) {
        name = line.replace("Name:", "").trim();
      } else if (line.startsWith("Summary:")) {
        summary = line.replace("Summary:", "").trim();
      } else if (line.startsWith("Materials:")) {
        materials = line.replace("Materials:", "").trim();
      }
    }

    summaries.set(id, {
      id,
      name,
      summary,
      materials: materials
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    });
  }

  return summaries;
}

function dedupeList(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function fallbackArchitectSummary(architectId: string): ArchitectImageSummary {
  const profile = loadArchitectProfile(architectId, DATA_DIR);
  return {
    id: architectId,
    name: profile.reference,
    summary: [
      profile.knowledge_base.design_philosophy.trim(),
      profile.design_principles[0],
      profile.spatial_preferences.form_language,
      profile.spatial_preferences.facade_approach,
    ]
      .filter(Boolean)
      .join(" "),
    materials: dedupeList([
      profile.spatial_preferences.material_expression,
      ...profile.expression_rules.material_palette,
    ]),
  };
}

function averageArchitectInfluences(
  graph: SpatialMassGraph,
  summaries: Map<string, ArchitectImageSummary>
): ArchitectInfluenceAverage[] {
  const totals = new Map<string, number>();
  const nodeCount = Math.max(graph.nodes.length, 1);

  for (const node of graph.nodes) {
    for (const influence of node.architect_influences) {
      totals.set(
        influence.architect_id,
        (totals.get(influence.architect_id) ?? 0) + Math.max(influence.weight, 0)
      );
    }
  }

  if (totals.size === 0) {
    const architects = graph.provenance.architect_contributions.map(
      (contribution) => contribution.architect_id
    );
    const equalWeight = architects.length > 0 ? 1 / architects.length : 0;
    for (const architectId of architects) {
      totals.set(architectId, equalWeight);
    }
  }

  const averaged = Array.from(totals.entries())
    .map(([architectId, total]) => {
      const summary = summaries.get(architectId) ?? fallbackArchitectSummary(architectId);
      return {
        id: architectId,
        name: summary.name,
        averageWeight: total / nodeCount,
        normalizedWeight: 0,
        summary: summary.summary,
        materials: summary.materials,
      };
    })
    .filter((entry) => entry.averageWeight > 0)
    .sort((left, right) => right.averageWeight - left.averageWeight);

  const totalWeight = averaged.reduce((sum, entry) => sum + entry.averageWeight, 0);
  if (totalWeight <= 0) return averaged;

  return averaged.map((entry) => ({
    ...entry,
    normalizedWeight: entry.averageWeight / totalWeight,
  }));
}

function roundPercentages(values: number[]) {
  const scaled = values.map((value) => value * 100);
  const floors = scaled.map((value) => Math.floor(value));
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0);

  const order = scaled
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((left, right) => right.fraction - left.fraction);

  for (const item of order) {
    if (remainder <= 0) break;
    floors[item.index] += 1;
    remainder -= 1;
  }

  return floors;
}

function buildArchitectMixSentence(architects: ArchitectInfluenceAverage[]) {
  const visible = architects.slice(0, 4);
  const rounded = roundPercentages(visible.map((architect) => architect.normalizedWeight));
  const parts = visible.map(
    (architect, index) => `${rounded[index]}% ${architect.name}`
  );

  if (parts.length === 0) return "100% contemporary architectural clarity";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function buildArchitectSummaryBlocks(architects: ArchitectInfluenceAverage[]) {
  const labels = [
    "dominant",
    "secondary but clear",
    "supporting",
    "subtle trace",
  ];

  return architects
    .slice(0, 4)
    .map((architect, index) => {
      const label = labels[index] ?? "supporting";
      return `${architect.name} influence ${label}: ${architect.summary}`;
    })
    .join("\n\n");
}

function buildMaterialLanguage(graph: SpatialMassGraph, architects: ArchitectInfluenceAverage[]) {
  const architectMaterials = architects.slice(0, 4).flatMap((architect) => architect.materials);
  const facadeSummary = graph.narrative.facade_and_material_summary.trim();
  const materialList = dedupeList(architectMaterials).slice(0, 12).join(", ");

  if (!facadeSummary) return materialList;
  if (!materialList) return facadeSummary;
  return `${materialList}. Align with this agreed facade direction: ${facadeSummary}`;
}

function fillTemplate(template: string, replacements: Record<string, string>) {
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

export async function buildImageGenerationPrompt(graph: SpatialMassGraph) {
  const [templateMarkdown, summariesMarkdown] = await Promise.all([
    fs.readFile(PROMPT_TEMPLATE_PATH, "utf-8"),
    fs.readFile(ARCHITECT_SUMMARIES_PATH, "utf-8"),
  ]);

  const summaries = parseArchitectSummaries(summariesMarkdown);
  const architects = averageArchitectInfluences(graph, summaries);
  const prompt = fillTemplate(templateMarkdown, {
    architect_mix_sentence: buildArchitectMixSentence(architects),
    architect_summary_blocks: buildArchitectSummaryBlocks(architects),
    material_language: buildMaterialLanguage(graph, architects),
    overall_concept:
      graph.narrative.overall_architectural_concept.trim() ||
      graph.narrative.project_intro.trim(),
    spatial_character:
      graph.narrative.spatial_character_summary.trim() ||
      graph.narrative.public_to_private_sequence.trim(),
    facade_direction:
      graph.narrative.facade_and_material_summary.trim() ||
      graph.narrative.massing_strategy_summary.trim(),
    image_direction:
      graph.narrative.image_direction.trim() ||
      graph.narrative.project_intro.trim(),
  });

  return {
    prompt,
    architects: architects.map((architect) => ({
      id: architect.id,
      name: architect.name,
      normalized_weight: architect.normalizedWeight,
      materials: architect.materials,
    })),
    material_language: buildMaterialLanguage(graph, architects),
  };
}
