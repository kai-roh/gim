// ============================================================
// Spatial Mass Graph Builder
// ============================================================

import type {
  ArchitectResponse,
  MassNodeProposal,
  MassRelationProposal,
  ProjectContext,
} from "../forum/types";
import type {
  ArchitectContribution,
  ArchitectInfluence,
  DecisionProvenance,
  DesignNarrativeMetadata,
  DiscussionTrace,
  MassNode,
  MassRelation,
  NodeNarrativeSummary,
  ProjectFrame,
  RelationEvidence,
  SpatialMassGraph,
} from "./types";
import {
  average,
  clampInfluence,
  defaultNodeName,
  ensureGeometry,
  ensureNodeVariantSpace,
  ensureRelationVariantSpace,
  inverseRuleFor,
  mergeKeywords,
  normalizeId,
  pickLongest,
  pickMostCommon,
} from "./rules";
import { withResolvedMassModel } from "./resolved-model";

interface NodeVote {
  architectId: string;
  response: ArchitectResponse;
  node: MassNodeProposal;
}

interface RelationVote {
  architectId: string;
  response: ArchitectResponse;
  relation: MassRelationProposal;
}

function normalizeProgramText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function inferProgramLabel(
  nodeSamples: MassNodeProposal[],
  requestedProgramNames: string[]
): string | null {
  const explicit =
    pickLongest(
      nodeSamples.map((sample) => sample.program_label?.trim() || ""),
      ""
    ) || null;
  if (explicit) return explicit;

  const normalizedPrograms = requestedProgramNames
    .map((name) => name.trim())
    .filter(Boolean);
  if (normalizedPrograms.length === 0) return null;

  const corpus = normalizeProgramText(
    nodeSamples
      .flatMap((sample) => [
        sample.name,
        sample.spatial_role,
        sample.narrative.role,
        sample.narrative.intent,
        ...(sample.narrative.keywords ?? []),
      ])
      .join(" ")
  );

  const matched = normalizedPrograms
    .map((name) => ({
      raw: name,
      normalized: normalizeProgramText(name),
    }))
    .filter(({ normalized }) => normalized && corpus.includes(normalized))
    .sort((left, right) => right.normalized.length - left.normalized.length);

  return matched[0]?.raw ?? null;
}

function projectToFrame(project: ProjectContext): ProjectFrame {
  return {
    company: project.company,
    site: project.site,
    program: project.program,
    constraints: project.constraints,
    client_vision: project.client_vision,
  };
}

function supportThreshold(count: number): number {
  return Math.max(1, Math.ceil(count / 2));
}

function collectNodeVotes(responses: ArchitectResponse[]): Map<string, NodeVote[]> {
  const groups = new Map<string, NodeVote[]>();

  for (const response of responses) {
    for (const node of response.proposal.mass_entities ?? []) {
      const key = normalizeId(node.id || node.name);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({
        architectId: response.architect_id,
        response,
        node: {
          ...node,
          id: key,
        },
      });
    }
  }

  return groups;
}

function roundMetric(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function averageMetric(
  values: Array<number | null | undefined>,
  digits = 2
): number | null {
  const valid = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );
  if (valid.length === 0) return null;
  return roundMetric(average(valid, 0), digits);
}

function averageIntegerMetric(values: Array<number | null | undefined>): number | null {
  const averaged = averageMetric(values, 0);
  return averaged === null ? null : Math.max(1, Math.round(averaged));
}

function mergeNumericRange(
  values: Array<{ min: number | null; max: number | null }>
): { min: number | null; max: number | null } {
  const mins = values
    .map((value) => value.min)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const maxs = values
    .map((value) => value.max)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    min: mins.length > 0 ? Math.min(...mins) : null,
    max: maxs.length > 0 ? Math.max(...maxs) : null,
  };
}

function normalizeStorySpan(
  span?: MassNodeProposal["geometry"]["story_span"]
): MassNodeProposal["geometry"]["story_span"] {
  const start =
    typeof span?.start === "number" && Number.isFinite(span.start)
      ? Math.max(1, Math.round(span.start))
      : null;
  const end =
    typeof span?.end === "number" && Number.isFinite(span.end)
      ? Math.max(1, Math.round(span.end))
      : null;

  if (start !== null && end !== null && start > end) {
    return { start: end, end: start };
  }

  return { start, end };
}

function nonNullMetricCount(node: MassNodeProposal): number {
  const metrics = [
    node.geometry.story_count,
    node.geometry.floor_to_floor_m,
    node.geometry.target_gfa_m2,
    node.geometry.height_m,
    node.geometry.plan_aspect_ratio,
    node.geometry.story_span.start,
    node.geometry.story_span.end,
  ];
  return metrics.filter((value) => typeof value === "number" && Number.isFinite(value)).length;
}

function selectRepresentativeNodeSample(nodeSamples: MassNodeProposal[]): MassNodeProposal {
  const modal = {
    kind: pickMostCommon(
      nodeSamples.map((sample) => sample.kind),
      nodeSamples[0].kind
    ),
    hierarchy: pickMostCommon(
      nodeSamples.map((sample) => sample.hierarchy),
      nodeSamples[0].hierarchy
    ),
    primitive: pickMostCommon(
      nodeSamples.map((sample) => sample.geometry.primitive),
      nodeSamples[0].geometry.primitive
    ),
    width: pickMostCommon(
      nodeSamples.map((sample) => sample.geometry.width),
      nodeSamples[0].geometry.width
    ),
    depth: pickMostCommon(
      nodeSamples.map((sample) => sample.geometry.depth),
      nodeSamples[0].geometry.depth
    ),
    height: pickMostCommon(
      nodeSamples.map((sample) => sample.geometry.height),
      nodeSamples[0].geometry.height
    ),
    proportion: pickMostCommon(
      nodeSamples.map((sample) => sample.geometry.proportion),
      nodeSamples[0].geometry.proportion
    ),
    vertical_placement: pickMostCommon(
      nodeSamples.map((sample) => sample.geometry.vertical_placement),
      nodeSamples[0].geometry.vertical_placement
    ),
    span_character: pickMostCommon(
      nodeSamples.map((sample) => sample.geometry.span_character),
      nodeSamples[0].geometry.span_character
    ),
    orientation: pickMostCommon(
      nodeSamples.map((sample) => sample.geometry.orientation),
      nodeSamples[0].geometry.orientation
    ),
  };

  return [...nodeSamples].sort((left, right) => {
    const score = (sample: MassNodeProposal) =>
      (sample.kind === modal.kind ? 2 : 0) +
      (sample.hierarchy === modal.hierarchy ? 2 : 0) +
      (sample.geometry.primitive === modal.primitive ? 4 : 0) +
      (sample.geometry.width === modal.width ? 1 : 0) +
      (sample.geometry.depth === modal.depth ? 1 : 0) +
      (sample.geometry.height === modal.height ? 1 : 0) +
      (sample.geometry.proportion === modal.proportion ? 2 : 0) +
      (sample.geometry.vertical_placement === modal.vertical_placement ? 2 : 0) +
      (sample.geometry.span_character === modal.span_character ? 2 : 0) +
      (sample.geometry.orientation === modal.orientation ? 1 : 0) +
      nonNullMetricCount(sample);

    const delta = score(right) - score(left);
    if (delta !== 0) return delta;
    return right.narrative.intent.length - left.narrative.intent.length;
  })[0];
}

function mergeStorySpan(
  nodeSamples: MassNodeProposal[],
  storyCount: number | null,
  fallback: MassNodeProposal["geometry"]["story_span"]
): MassNodeProposal["geometry"]["story_span"] {
  const starts = nodeSamples.map((sample) => sample.geometry.story_span.start);
  const ends = nodeSamples.map((sample) => sample.geometry.story_span.end);

  let start = averageIntegerMetric(starts);
  let end = averageIntegerMetric(ends);

  if (start === null) start = fallback.start;
  if (end === null) end = fallback.end;

  if (start !== null && end === null && storyCount !== null) {
    end = start + storyCount - 1;
  }
  if (end !== null && start === null && storyCount !== null) {
    start = Math.max(1, end - storyCount + 1);
  }

  return normalizeStorySpan({ start, end });
}

function mergeNodeGroup(
  nodeId: string,
  votes: NodeVote[],
  requestedProgramNames: string[]
): MassNode {
  const nodeSamples = votes.map((vote) => vote.node);
  const first = nodeSamples[0];
  const representative = selectRepresentativeNodeSample(nodeSamples);
  const representativeVariantSpace = ensureNodeVariantSpace(
    representative.variant_space,
    representative.geometry
  );
  const normalizedVariantSpaces = nodeSamples.map((sample) =>
    ensureNodeVariantSpace(sample.variant_space, sample.geometry)
  );

  const influenceMap = new Map<string, { weightSum: number; count: number; notes: string[] }>();
  for (const vote of votes) {
    const explicit = vote.node.architect_influences?.length
      ? vote.node.architect_influences
      : [
          {
            architect_id: vote.architectId,
            influence: 1,
            rationale: vote.node.narrative.intent,
          },
        ];

    for (const influence of explicit) {
      const existing = influenceMap.get(influence.architect_id) ?? {
        weightSum: 0,
        count: 0,
        notes: [],
      };
      existing.weightSum += clampInfluence(influence.influence);
      existing.count += 1;
      if (influence.rationale) existing.notes.push(influence.rationale);
      influenceMap.set(influence.architect_id, existing);
    }
  }

  const architectInfluences: ArchitectInfluence[] = Array.from(influenceMap.entries())
    .map(([architectId, data]) => ({
      architect_id: architectId,
      weight: Number(average([data.weightSum / Math.max(data.count, 1)], 0).toFixed(2)),
      contribution: pickLongest(data.notes, "노드 정의에 기여"),
    }))
    .sort((a, b) => b.weight - a.weight);

  const discussionTrace: DiscussionTrace[] = votes.map((vote) => ({
    architect_id: vote.architectId,
    phase: vote.response.phase,
    summary: pickLongest(
      [
        vote.node.narrative.intent,
        vote.response.compromise || "",
        vote.response.stance,
      ],
      vote.response.stance
    ),
  }));

  const mergedProperties: Record<string, string> = {};
  for (const sample of nodeSamples) {
    for (const [key, value] of Object.entries(sample.properties ?? {})) {
      if (!mergedProperties[key] && value) {
        mergedProperties[key] = value;
      }
    }
  }

  return {
    id: nodeId,
    name: pickLongest(nodeSamples.map((sample) => sample.name), defaultNodeName(first.kind, first.hierarchy, first.spatial_role)),
    kind: pickMostCommon(
      nodeSamples.map((sample) => sample.kind),
      first.kind
    ),
    hierarchy: pickMostCommon(
      nodeSamples.map((sample) => sample.hierarchy),
      first.hierarchy
    ),
    spatial_role: pickLongest(
      nodeSamples.map((sample) => sample.spatial_role),
      first.spatial_role
    ),
    program_label: inferProgramLabel(nodeSamples, requestedProgramNames),
    geometry: ensureGeometry({
      primitive: representative.geometry.primitive,
      width: representative.geometry.width,
      depth: representative.geometry.depth,
      height: representative.geometry.height,
      proportion: representative.geometry.proportion,
      skin: pickMostCommon(
        nodeSamples.map((sample) => sample.geometry.skin),
        representative.geometry.skin
      ),
      porosity: pickMostCommon(
        nodeSamples.map((sample) => sample.geometry.porosity),
        representative.geometry.porosity
      ),
      vertical_placement: representative.geometry.vertical_placement,
      span_character: representative.geometry.span_character,
      orientation: representative.geometry.orientation,
      story_count:
        averageIntegerMetric(nodeSamples.map((sample) => sample.geometry.story_count)) ??
        representative.geometry.story_count,
      floor_to_floor_m:
        averageMetric(nodeSamples.map((sample) => sample.geometry.floor_to_floor_m)) ??
        representative.geometry.floor_to_floor_m,
      target_gfa_m2:
        averageMetric(nodeSamples.map((sample) => sample.geometry.target_gfa_m2), 0) ??
        representative.geometry.target_gfa_m2,
      height_m:
        averageMetric(nodeSamples.map((sample) => sample.geometry.height_m)) ??
        representative.geometry.height_m,
      plan_aspect_ratio:
        averageMetric(nodeSamples.map((sample) => sample.geometry.plan_aspect_ratio)) ??
        representative.geometry.plan_aspect_ratio,
      story_span: mergeStorySpan(
        nodeSamples,
        averageIntegerMetric(nodeSamples.map((sample) => sample.geometry.story_count)) ??
        representative.geometry.story_count,
        representative.geometry.story_span
      ),
    }),
    variant_space: ensureNodeVariantSpace(
      {
        alternative_primitives: Array.from(
          new Set(
            normalizedVariantSpaces.flatMap((space) => space.alternative_primitives)
          )
        ),
        aspect_ratio_range: mergeNumericRange(
          normalizedVariantSpaces.map((space) => space.aspect_ratio_range)
        ),
        footprint_scale_range: mergeNumericRange(
          normalizedVariantSpaces.map((space) => space.footprint_scale_range)
        ),
        height_scale_range: mergeNumericRange(
          normalizedVariantSpaces.map((space) => space.height_scale_range)
        ),
        radial_distance_scale_range: mergeNumericRange(
          normalizedVariantSpaces.map((space) => space.radial_distance_scale_range)
        ),
        angle_jitter_deg:
          averageMetric(
            normalizedVariantSpaces.map((space) => space.angle_jitter_deg)
          ) ?? representativeVariantSpace.angle_jitter_deg,
        freedom: pickMostCommon(
          normalizedVariantSpaces.map((space) => space.freedom),
          representativeVariantSpace.freedom
        ),
      },
      representative.geometry
    ),
    relative_position: {
      anchor_to: pickLongest(
        nodeSamples.map((sample) => normalizeId(sample.relative_position.anchor_to || "")),
        ""
      ) || undefined,
      relation_hint: pickLongest(
        nodeSamples.map((sample) => sample.relative_position.relation_hint || ""),
        ""
      ) || undefined,
    },
    narrative: {
      role: pickLongest(nodeSamples.map((sample) => sample.narrative.role), first.narrative.role),
      intent: pickLongest(nodeSamples.map((sample) => sample.narrative.intent), first.narrative.intent),
      spatial_character: pickLongest(
        nodeSamples.map((sample) => sample.narrative.spatial_character),
        first.narrative.spatial_character
      ),
      facade_material_light: pickLongest(
        nodeSamples.map((sample) => sample.narrative.facade_material_light),
        first.narrative.facade_material_light
      ),
      image_prompt_notes: pickLongest(
        nodeSamples.map((sample) => sample.narrative.image_prompt_notes),
        first.narrative.image_prompt_notes
      ),
      keywords: mergeKeywords(nodeSamples.map((sample) => sample.narrative.keywords)),
    },
    architect_influences: architectInfluences,
    discussion_trace: discussionTrace,
    properties: mergedProperties,
  };
}

function collectRelationVotes(
  responses: ArchitectResponse[],
  validNodeIds: Set<string>
): Map<string, RelationVote[]> {
  const groups = new Map<string, RelationVote[]>();

  for (const response of responses) {
    for (const relation of response.proposal.mass_relations ?? []) {
      const source = normalizeId(relation.source_id);
      const target = normalizeId(relation.target_id);
      if (!validNodeIds.has(source) || !validNodeIds.has(target) || source === target) {
        continue;
      }
      const key = `${source}::${target}::${relation.family}::${relation.rule}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({
        architectId: response.architect_id,
        response,
        relation: {
          ...relation,
          source_id: source,
          target_id: target,
        },
      });
    }
  }

  return groups;
}

function buildEvidence(votes: RelationVote[]): RelationEvidence[] {
  return [
    {
      architect_ids: Array.from(new Set(votes.map((vote) => vote.architectId))),
      phase: votes[0]?.response.phase ?? "proposal",
      summary: pickLongest(
        votes.flatMap((vote) => [vote.relation.rationale, vote.response.compromise || "", vote.response.stance]),
        "관계 합의"
      ),
    },
  ];
}

function mergeRelationGroup(key: string, votes: RelationVote[]): MassRelation {
  const sample = votes[0].relation;
  const normalizedVariantSpaces = votes.map((vote) =>
    ensureRelationVariantSpace(vote.relation.variant_space)
  );
  return {
    id: normalizeId(`rel_${key}`),
    source: sample.source_id,
    target: sample.target_id,
    family: pickMostCommon(
      votes.map((vote) => vote.relation.family),
      sample.family
    ),
    rule: pickMostCommon(
      votes.map((vote) => vote.relation.rule),
      sample.rule
    ),
    inverse_rule: inverseRuleFor(
      pickMostCommon(votes.map((vote) => vote.relation.rule), sample.rule)
    ),
    strength: pickMostCommon(
      votes.map((vote) => vote.relation.strength),
      sample.strength
    ),
    weight: Number(average(votes.map((vote) => vote.relation.weight), sample.weight).toFixed(2)),
    rationale: pickLongest(votes.map((vote) => vote.relation.rationale), sample.rationale),
    constraints: {
      geometry_effect: pickMostCommon(
        votes
          .map((vote) => vote.relation.geometry_effect)
          .filter((value): value is NonNullable<typeof value> => Boolean(value)),
        sample.geometry_effect ?? "attach"
      ),
    },
    variant_space: ensureRelationVariantSpace({
      distance_scale_range: mergeNumericRange(
        normalizedVariantSpaces.map((space) => space.distance_scale_range)
      ),
      lateral_offset_range_m: mergeNumericRange(
        normalizedVariantSpaces.map((space) => space.lateral_offset_range_m)
      ),
    }),
    evidence: buildEvidence(votes),
  };
}

function expandInverseRelations(relations: MassRelation[]): MassRelation[] {
  const results: MassRelation[] = [];
  const seen = new Set<string>();

  for (const relation of relations) {
    const forwardKey = `${relation.source}:${relation.target}:${relation.family}:${relation.rule}`;
    if (!seen.has(forwardKey)) {
      results.push(relation);
      seen.add(forwardKey);
    }

    const inverse: MassRelation = {
      ...relation,
      id: `${relation.id}__inverse`,
      source: relation.target,
      target: relation.source,
      rule: relation.inverse_rule,
      inverse_rule: relation.rule,
    };

    const inverseKey = `${inverse.source}:${inverse.target}:${inverse.family}:${inverse.rule}`;
    if (!seen.has(inverseKey)) {
      results.push(inverse);
      seen.add(inverseKey);
    }
  }

  return results;
}

function buildNarrativeMetadata(
  responses: ArchitectResponse[],
  nodes: MassNode[],
  relations: MassRelation[]
): DesignNarrativeMetadata {
  const narratives = responses.map((response) => response.proposal.narrative);

  const nodeSummaries: NodeNarrativeSummary[] = nodes.map((node) => {
    const connected = relations
      .filter((relation) => relation.source === node.id)
      .slice(0, 4)
      .map((relation) => `${relation.rule} ${relation.target}`)
      .join(", ");

    return {
      node_id: node.id,
      summary: `${node.name}은/는 ${node.narrative.role}로서 ${node.narrative.intent}`,
      spatial_character: node.narrative.spatial_character,
      image_prompt_notes: node.narrative.image_prompt_notes,
      relationship_summary: connected || "주요 관계 없음",
      keywords: node.narrative.keywords,
    };
  });

  return {
    project_intro: pickLongest(
      narratives.map((narrative) => narrative.project_intro),
      "건축적 덩어리와 관계를 중심으로 구성된 프로젝트"
    ),
    overall_architectural_concept: pickLongest(
      narratives.map((narrative) => narrative.overall_architectural_concept),
      "토론을 통해 합의된 매스 전략"
    ),
    massing_strategy_summary: pickLongest(
      narratives.map((narrative) => narrative.massing_strategy_summary),
      "주요 덩어리와 void, core의 관계로 질서를 형성한다."
    ),
    facade_and_material_summary: pickLongest(
      narratives.map((narrative) => narrative.facade_and_material_summary),
      "외피와 재료는 각 덩어리의 성격을 드러낸다."
    ),
    public_to_private_sequence: pickLongest(
      narratives.map((narrative) => narrative.public_to_private_sequence),
      "공공성과 업무성이 단계적으로 전이된다."
    ),
    spatial_character_summary: pickLongest(
      narratives.map((narrative) => narrative.spatial_character_summary),
      "노드별 서술을 통해 공간 성격을 정의한다."
    ),
    image_direction: pickLongest(
      narratives.map((narrative) => narrative.image_direction),
      "매스의 위계, void의 존재감, 외피의 대비를 함께 보여준다."
    ),
    node_summaries: nodeSummaries,
  };
}

function buildProvenance(
  responses: ArchitectResponse[],
  nodes: MassNode[],
  relations: MassRelation[]
): DecisionProvenance {
  const architectContributions = new Map<string, ArchitectContribution>();

  for (const response of responses) {
    const contribution = architectContributions.get(response.architect_id) ?? {
      architect_id: response.architect_id,
      emphasis: response.stance,
      node_ids: [],
      relation_ids: [],
    };

    for (const node of nodes) {
      if (node.architect_influences.some((influence) => influence.architect_id === response.architect_id)) {
        contribution.node_ids.push(node.id);
      }
    }

    for (const relation of relations) {
      if (relation.evidence.some((evidence) => evidence.architect_ids.includes(response.architect_id))) {
        contribution.relation_ids.push(relation.id);
      }
    }

    architectContributions.set(response.architect_id, {
      ...contribution,
      node_ids: Array.from(new Set(contribution.node_ids)),
      relation_ids: Array.from(new Set(contribution.relation_ids)),
    });
  }

  return {
    consensus_notes: responses
      .map((response) => response.compromise)
      .filter((value): value is string => Boolean(value)),
    resolved_conflicts: responses.flatMap((response) =>
      (response.critique ?? []).map((critique) => `${response.architect_id} -> ${critique.target_architect_id}: ${critique.point}`)
    ),
    architect_contributions: Array.from(architectContributions.values()),
  };
}

export function buildSpatialMassGraph(
  project: ProjectContext,
  responses: ArchitectResponse[]
): SpatialMassGraph {
  const minSupport = supportThreshold(responses.length);
  const nodeVotes = collectNodeVotes(responses);
  const requestedProgramNames = project.program.uses.map((use) => use.type);

  const nodes = Array.from(nodeVotes.entries())
    .filter(([, votes]) => votes.length >= minSupport)
    .map(([nodeId, votes]) => mergeNodeGroup(nodeId, votes, requestedProgramNames))
    .sort((a, b) => a.id.localeCompare(b.id));

  const validNodeIds = new Set(nodes.map((node) => node.id));
  const relationVotes = collectRelationVotes(responses, validNodeIds);

  const mergedRelations = Array.from(relationVotes.entries())
    .filter(([, votes]) => votes.length >= minSupport)
    .map(([key, votes]) => mergeRelationGroup(key, votes));

  const relations = expandInverseRelations(mergedRelations).sort((a, b) => a.id.localeCompare(b.id));

  const narrative = buildNarrativeMetadata(responses, nodes, relations);
  const provenance = buildProvenance(responses, nodes, relations);

  return withResolvedMassModel({
    project: projectToFrame(project),
    nodes,
    relations,
    narrative,
    provenance,
    metadata: {
      created_at: new Date().toISOString(),
      source_forum: "forum_result",
      node_count: nodes.length,
      relation_count: relations.length,
    },
  });
}
