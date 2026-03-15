// ============================================================
// Forum Engine
// Primary output is a spatial mass graph with narrative metadata.
// ============================================================

import OpenAI from "openai";
import { buildPanel } from "./architect-loader";
import type {
  ArchitectResponse,
  ProjectContext,
  ForumSession,
  ForumRound,
  DiscussionPhase,
} from "./types";

export interface ForumSessionOptions {
  dataDir?: string;
  model?: string;
}

export interface StreamCallbacks {
  onToken?: (architectId: string, token: string) => void;
  onArchitectStart?: (architectId: string) => void;
  onArchitectComplete?: (architectId: string, response: ArchitectResponse) => void;
  onPhaseComplete?: (phase: DiscussionPhase, responses: ArchitectResponse[]) => void;
}

const MASS_NODE_KIND = ["solid", "void", "core", "connector"] as const;
const NODE_HIERARCHY = ["primary", "secondary", "tertiary"] as const;
const MASS_PRIMITIVE = ["block", "bar", "plate", "ring", "tower", "bridge", "cylinder"] as const;
const RELATIVE_SCALE = ["xs", "small", "medium", "large", "xl"] as const;
const RELATIVE_PROPORTION = ["compact", "elongated", "slender", "broad"] as const;
const SKIN_TRANSPARENCY = ["opaque", "mixed", "transparent"] as const;
const POROSITY = ["solid", "porous", "open"] as const;
const RELATIVE_PLACEMENT = [
  "subgrade",
  "grounded",
  "low",
  "mid",
  "upper",
  "crown",
  "spanning",
] as const;
const SPAN_CHARACTER = ["single", "stacked", "multi_level"] as const;
const SURFACE_ORIENTATION = ["orthogonal", "diagonal", "curved", "radial"] as const;
const VARIANT_FREEDOM = ["fixed", "guided", "exploratory"] as const;
const MASS_RELATION_FAMILY = [
  "stack",
  "contact",
  "enclosure",
  "intersection",
  "connection",
  "alignment",
] as const;
const MASS_RELATION_RULE = [
  "above",
  "below",
  "adjacent",
  "wraps",
  "inside",
  "contains",
  "penetrates",
  "linked",
  "offset_from",
  "aligned_with",
  "bridges_to",
  "rests_on",
] as const;
const GEOMETRY_EFFECT = ["attach", "separate", "overlap", "pierce", "offset", "bridge"] as const;
const DISCUSSION_PHASES = [
  "proposal",
  "cross_critique",
  "convergence",
  "expert_review",
  "finalization",
] as const;

const ARCHITECT_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  name: "architect_response",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["architect_id", "phase", "stance", "reasoning", "proposal", "critique", "compromise"],
    properties: {
      architect_id: { type: "string" },
      phase: { type: "string", enum: [...DISCUSSION_PHASES] },
      stance: { type: "string" },
      reasoning: { type: "string" },
      proposal: {
        type: "object",
        additionalProperties: false,
        required: [
          "massing_concept",
          "structural_strategy",
          "key_moves",
          "mass_entities",
          "mass_relations",
          "narrative",
        ],
        properties: {
          massing_concept: { type: "string" },
          structural_strategy: {
            type: "object",
            additionalProperties: false,
            required: ["core_strategy", "load_transfer", "special_elements"],
            properties: {
              core_strategy: { type: "string" },
              load_transfer: { type: "string" },
              special_elements: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
          key_moves: {
            type: "array",
            items: { type: "string" },
          },
          mass_entities: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "id",
                "name",
                "kind",
                "hierarchy",
                "spatial_role",
                "geometry",
                "variant_space",
                "relative_position",
                "narrative",
                "architect_influences",
              ],
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                kind: { type: "string", enum: [...MASS_NODE_KIND] },
                hierarchy: { type: "string", enum: [...NODE_HIERARCHY] },
                spatial_role: { type: "string" },
                geometry: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "primitive",
                    "width",
                    "depth",
                    "height",
                    "proportion",
                    "skin",
                    "porosity",
                    "vertical_placement",
                    "span_character",
                    "orientation",
                    "story_count",
                    "floor_to_floor_m",
                    "target_gfa_m2",
                    "height_m",
                    "plan_aspect_ratio",
                    "story_span",
                  ],
                  properties: {
                    primitive: { type: "string", enum: [...MASS_PRIMITIVE] },
                    width: { type: "string", enum: [...RELATIVE_SCALE] },
                    depth: { type: "string", enum: [...RELATIVE_SCALE] },
                    height: { type: "string", enum: [...RELATIVE_SCALE] },
                    proportion: { type: "string", enum: [...RELATIVE_PROPORTION] },
                    skin: { type: "string", enum: [...SKIN_TRANSPARENCY] },
                    porosity: { type: "string", enum: [...POROSITY] },
                    vertical_placement: { type: "string", enum: [...RELATIVE_PLACEMENT] },
                    span_character: { type: "string", enum: [...SPAN_CHARACTER] },
                    orientation: { type: "string", enum: [...SURFACE_ORIENTATION] },
                    story_count: { type: ["integer", "null"], minimum: 1 },
                    floor_to_floor_m: { type: ["number", "null"], minimum: 0.1 },
                    target_gfa_m2: { type: ["number", "null"], minimum: 0 },
                    height_m: { type: ["number", "null"], minimum: 0.1 },
                    plan_aspect_ratio: { type: ["number", "null"], minimum: 0.2 },
                    story_span: {
                      type: "object",
                      additionalProperties: false,
                      required: ["start", "end"],
                      properties: {
                        start: { type: ["integer", "null"], minimum: 1 },
                        end: { type: ["integer", "null"], minimum: 1 },
                      },
                    },
                  },
                },
                variant_space: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "alternative_primitives",
                    "aspect_ratio_range",
                    "footprint_scale_range",
                    "height_scale_range",
                    "radial_distance_scale_range",
                    "angle_jitter_deg",
                    "freedom",
                  ],
                  properties: {
                    alternative_primitives: {
                      type: "array",
                      items: { type: "string", enum: [...MASS_PRIMITIVE] },
                    },
                    aspect_ratio_range: {
                      type: "object",
                      additionalProperties: false,
                      required: ["min", "max"],
                      properties: {
                        min: { type: ["number", "null"], minimum: 0.2 },
                        max: { type: ["number", "null"], minimum: 0.2 },
                      },
                    },
                    footprint_scale_range: {
                      type: "object",
                      additionalProperties: false,
                      required: ["min", "max"],
                      properties: {
                        min: { type: ["number", "null"], minimum: 0.3 },
                        max: { type: ["number", "null"], minimum: 0.3 },
                      },
                    },
                    height_scale_range: {
                      type: "object",
                      additionalProperties: false,
                      required: ["min", "max"],
                      properties: {
                        min: { type: ["number", "null"], minimum: 0.3 },
                        max: { type: ["number", "null"], minimum: 0.3 },
                      },
                    },
                    radial_distance_scale_range: {
                      type: "object",
                      additionalProperties: false,
                      required: ["min", "max"],
                      properties: {
                        min: { type: ["number", "null"], minimum: 0 },
                        max: { type: ["number", "null"], minimum: 0 },
                      },
                    },
                    angle_jitter_deg: { type: ["number", "null"], minimum: 0 },
                    freedom: { type: "string", enum: [...VARIANT_FREEDOM] },
                  },
                },
                relative_position: {
                  type: "object",
                  additionalProperties: false,
                  required: ["anchor_to", "relation_hint"],
                  properties: {
                    anchor_to: { type: ["string", "null"] },
                    relation_hint: { type: ["string", "null"] },
                  },
                },
                narrative: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "role",
                    "intent",
                    "spatial_character",
                    "facade_material_light",
                    "image_prompt_notes",
                    "keywords",
                  ],
                  properties: {
                    role: { type: "string" },
                    intent: { type: "string" },
                    spatial_character: { type: "string" },
                    facade_material_light: { type: "string" },
                    image_prompt_notes: { type: "string" },
                    keywords: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
                architect_influences: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["architect_id", "influence", "rationale"],
                    properties: {
                      architect_id: { type: "string" },
                      influence: { type: "number" },
                      rationale: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          mass_relations: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "source_id",
                "target_id",
                "family",
                "rule",
                "strength",
                "weight",
                "rationale",
                "geometry_effect",
                "variant_space",
              ],
              properties: {
                source_id: { type: "string" },
                target_id: { type: "string" },
                family: { type: "string", enum: [...MASS_RELATION_FAMILY] },
                rule: { type: "string", enum: [...MASS_RELATION_RULE] },
                strength: { type: "string", enum: ["hard", "soft"] },
                weight: { type: "number" },
                rationale: { type: "string" },
                geometry_effect: { type: ["string", "null"], enum: [...GEOMETRY_EFFECT, null] },
                variant_space: {
                  type: "object",
                  additionalProperties: false,
                  required: ["distance_scale_range", "lateral_offset_range_m"],
                  properties: {
                    distance_scale_range: {
                      type: "object",
                      additionalProperties: false,
                      required: ["min", "max"],
                      properties: {
                        min: { type: ["number", "null"], minimum: 0 },
                        max: { type: ["number", "null"], minimum: 0 },
                      },
                    },
                    lateral_offset_range_m: {
                      type: "object",
                      additionalProperties: false,
                      required: ["min", "max"],
                      properties: {
                        min: { type: ["number", "null"], minimum: 0 },
                        max: { type: ["number", "null"], minimum: 0 },
                      },
                    },
                  },
                },
              },
            },
          },
          narrative: {
            type: "object",
            additionalProperties: false,
            required: [
              "project_intro",
              "overall_architectural_concept",
              "massing_strategy_summary",
              "facade_and_material_summary",
              "public_to_private_sequence",
              "spatial_character_summary",
              "image_direction",
            ],
            properties: {
              project_intro: { type: "string" },
              overall_architectural_concept: { type: "string" },
              massing_strategy_summary: { type: "string" },
              facade_and_material_summary: { type: "string" },
              public_to_private_sequence: { type: "string" },
              spatial_character_summary: { type: "string" },
              image_direction: { type: "string" },
            },
          },
        },
      },
      critique: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["target_architect_id", "point", "counter_proposal"],
          properties: {
            target_architect_id: { type: "string" },
            point: { type: "string" },
            counter_proposal: { type: ["string", "null"] },
          },
        },
      },
      compromise: { type: ["string", "null"] },
    },
  },
};

export function buildContextPrompt(context: ProjectContext): string {
  const siteContextEntries = [
    ["북측", context.site.context.north],
    ["남측", context.site.context.south],
    ["동측", context.site.context.east],
    ["서측", context.site.context.west],
  ].filter(([, value]) => Boolean(value?.trim()));

  const siteLines = [
    context.site.location ? `**위치**: ${context.site.location}` : null,
    context.site.dimensions[0] > 0 && context.site.dimensions[1] > 0
      ? `**대지 크기**: ${context.site.dimensions[0]}m × ${context.site.dimensions[1]}m`
      : null,
    context.site.far > 0 ? `**용적률**: ${context.site.far}%` : null,
    context.site.bcr > 0 ? `**건폐율**: ${context.site.bcr}%` : null,
    context.site.height_limit > 0 ? `**높이 제한**: ${context.site.height_limit}m` : null,
  ].filter(Boolean);

  const companySection =
    context.company &&
    (context.company.name ||
      context.company.brand_philosophy ||
      context.company.identity_keywords.length > 0)
    ? `
**기업 정보**
- 기업명: ${context.company.name || "미입력"}
- 브랜드 철학: ${context.company.brand_philosophy || "미입력"}
- 정체성 키워드: ${
        context.company.identity_keywords.length > 0
          ? context.company.identity_keywords.join(", ")
          : "미입력"
      }
`
    : "";

  const siteSection = siteLines.length > 0 ? `${siteLines.join("\n")}\n` : "";
  const surroundingContextSection =
    siteContextEntries.length > 0
      ? `
**주변 맥락**
${siteContextEntries.map(([label, value]) => `- ${label}: ${value}`).join("\n")}
`
      : "";
  const programSection =
    context.program.total_gfa > 0 || context.program.uses.length > 0
      ? `
**프로그램 요구**
${[
  context.program.total_gfa > 0 ? `- 총 연면적 목표: ${context.program.total_gfa.toLocaleString("ko-KR")} m²` : null,
  ...context.program.uses.map(
    (u) => `- ${u.type}: ${(u.ratio * 100).toFixed(0)}% — ${u.requirements || ""}`
  ),
]
  .filter(Boolean)
  .join("\n")}
`
      : "";
  const constraintsSection =
    context.constraints.length > 0
      ? `
**핵심 조건**
${context.constraints.map((c) => `- ${c}`).join("\n")}
`
      : "";
  const clientVisionSection = context.client_vision
    ? `**클라이언트 비전**: ${context.client_vision}\n`
    : "";
  const explicitInputNotice =
    !companySection &&
    !siteSection &&
    !surroundingContextSection &&
    !programSection &&
    !constraintsSection &&
    !clientVisionSection
      ? `
**명시된 프로젝트 정보**
- 아직 구체적인 브랜드/부지/프로그램 정보가 제공되지 않았습니다.
- 사용자가 직접 적은 내용만 근거로 판단하고, 비어 있는 항목은 임의의 브랜드나 사이트 사례로 채우지 마세요.
`
      : "";

  return `
## 프로젝트 컨텍스트
${companySection}
${siteSection}${surroundingContextSection}${programSection}${constraintsSection}${clientVisionSection}${explicitInputNotice}

## 설계 방식
- 층별 프로그램표를 직접 만드는 것이 아니라, 건축적 덩어리와 void, core, connector의 관계 그래프를 제안합니다.
- 절대 좌표보다 상대 관계를 우선합니다.
- 대신 노드별 규모를 실제로 해석할 수 있도록 story_count, floor_to_floor_m, target_gfa_m2, story_span 같은 정량 정보를 적극 사용합니다.
- 노드는 6~12개 주요 덩어리 수준으로 압축합니다.
- 이미지 생성에 쓸 전체 서술과 노드별 설명을 함께 남깁니다.
- 사용자가 주지 않은 특정 브랜드, 사이트, 레퍼런스 사례를 임의로 끌어오지 않습니다.
`;
}

function summarizeResponse(response: ArchitectResponse): string {
  const nodes = response.proposal.mass_entities
    .slice(0, 8)
    .map(
      (node) =>
        `- ${node.id}: ${node.kind}/${node.hierarchy}, ${node.spatial_role}, ` +
        `${node.geometry.primitive}, ${node.geometry.vertical_placement}, ${node.geometry.story_count ?? "?"} stories, ${node.narrative.intent}`
    )
    .join("\n");

  const relations = response.proposal.mass_relations
    .slice(0, 10)
    .map(
      (rel) =>
        `- ${rel.source_id} -> ${rel.target_id}: ${rel.family}/${rel.rule} (${rel.strength})`
    )
    .join("\n");

  return `
### ${response.architect_id}
- 입장: ${response.stance}
- 매스 컨셉: ${response.proposal.massing_concept}
- 주요 노드:
${nodes || "- 없음"}
- 주요 관계:
${relations || "- 없음"}
- 전체 개념: ${response.proposal.narrative.overall_architectural_concept}
`;
}

export function buildPhasePrompt(
  phase: DiscussionPhase,
  context: ProjectContext,
  otherResponses?: { id: string; response: ArchitectResponse }[]
): string {
  const contextPrompt = buildContextPrompt(context);

  if (phase === "proposal") {
    return `${contextPrompt}

당신의 초기 제안을 작성하세요.

중요한 지침:
- 층별 수직 조닝표를 만들지 마세요.
- 공간 덩어리, void, core, connector를 노드로 정의하세요.
- 절대 좌표는 피하되, story_count, floor_to_floor_m, target_gfa_m2, story_span 같은 정량 정보는 적극 사용하세요.
- 이미지 생성에 활용될 전체 서술과 노드 설명을 반드시 작성하세요.
`;
  }

  if (phase === "cross_critique") {
    const others = (otherResponses ?? [])
      .map((item) => summarizeResponse(item.response))
      .join("\n");

    return `${contextPrompt}

## 다른 건축가들의 제안
${others}

이제 다른 건축가들의 매스 그래프를 비평하세요.
- 어떤 노드가 과도하거나 부족한지 지적하세요.
- 관계가 불충분하거나 모호한 부분을 짚으세요.
- 필요하면 자신의 노드 ID와 관계를 정리하여 수정하세요.
- 가능한 경우 노드의 층수, 층고, 점유 스팬, 목표 면적을 더 명확히 하세요.
- 최종적으로 더 일관된 매스 그래프로 다듬으세요.
`;
  }

  if (phase === "convergence") {
    const others = (otherResponses ?? [])
      .map((item) => summarizeResponse(item.response))
      .join("\n");

    return `${contextPrompt}

## 수렴 대상 제안
${others}

이제 합의 가능한 매스 그래프를 만드세요.

반드시 지킬 것:
- 서로 다른 제안에서 공통 핵심 노드를 정리하여 ID를 안정화하세요.
- 관계는 중앙 3D 모델 해석기가 일관되게 해석할 수 있도록 명확하게 유지하세요.
- 건축 아이디어는 narrative에 풍부하게 남기되, 기하 정보에는 story_count, floor_to_floor_m, target_gfa_m2, story_span을 포함해 실제 볼륨을 만들 수 있게 하세요.
- 어떤 건축가의 영향이 각 노드에 남았는지 architect_influences에 반영하세요.
- 프로젝트 소개와 이미지 생성용 설명을 충분히 작성하세요.
`;
  }

  if (phase === "expert_review") {
    const others = (otherResponses ?? [])
      .map((item) => summarizeResponse(item.response))
      .join("\n");

    return `${contextPrompt}

## 현재 수렴된 매스 그래프
${others}

법규와 구조 관점에서 검토하세요.
- core, void, connector, public mass의 관계가 성립하는지 검토합니다.
- 구조적 핵심과 공간적 위계가 일치하는지 확인합니다.
`;
  }

  return contextPrompt;
}

export function createForumSession(
  panelIds: string[],
  context: ProjectContext,
  _options?: ForumSessionOptions
): ForumSession {
  return {
    project_id: `forum_${Date.now()}`,
    panel: panelIds,
    context,
    rounds: [],
    current_phase: "proposal",
    iteration: 0,
  };
}

function parseArchitectResponse(text: string): ArchitectResponse {
  const jsonMatch =
    text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);

  if (!jsonMatch) {
    throw new Error(`JSON 파싱 실패:\n${text.slice(0, 500)}`);
  }

  const parsed = JSON.parse(jsonMatch[1]) as ArchitectResponse;

  return {
    ...parsed,
    proposal: {
      ...parsed.proposal,
      mass_entities: parsed.proposal.mass_entities.map((node) => ({
        ...node,
        properties: node.properties ?? {},
      })),
    },
  };
}

async function callArchitect(
  client: OpenAI,
  systemPrompt: string,
  userPrompt: string,
  model: string
): Promise<ArchitectResponse> {
  const response = await client.responses.create({
    model,
    instructions: systemPrompt,
    input: userPrompt,
    max_output_tokens: 7000,
    text: {
      format: ARCHITECT_RESPONSE_FORMAT,
    },
  });

  const text = extractResponseText(response);
  return parseArchitectResponse(text);
}

async function callArchitectStreaming(
  client: OpenAI,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  architectId: string,
  callbacks?: StreamCallbacks
): Promise<ArchitectResponse> {
  const stream = await client.responses.create({
    model,
    instructions: systemPrompt,
    input: userPrompt,
    max_output_tokens: 7000,
    text: {
      format: ARCHITECT_RESPONSE_FORMAT,
    },
    stream: true,
  });

  let fullText = "";

  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      fullText += event.delta;
      callbacks?.onToken?.(architectId, event.delta);
    }
  }

  return parseArchitectResponse(fullText);
}

export async function runPhase(
  session: ForumSession,
  phase: DiscussionPhase,
  previousResponses?: { id: string; response: ArchitectResponse }[],
  options?: ForumSessionOptions
): Promise<ForumRound> {
  const client = new OpenAI();
  const model = options?.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1";
  const panel = buildPanel(session.panel, options?.dataDir);

  const userPrompt = buildPhasePrompt(phase, session.context, previousResponses);

  const results = await Promise.all(
    panel.map(async (architect) => {
      const response = await callArchitect(
        client,
        architect.systemPrompt,
        userPrompt,
        model
      );
      return { id: architect.id, response };
    })
  );

  const round: ForumRound = {
    round: session.rounds.length + 1,
    phase,
    trigger: session.rounds.length === 0 ? "initial_context" : "initial_context",
    responses: results.map((result) => result.response),
  };

  session.rounds.push(round);
  session.current_phase = phase;
  session.iteration++;

  return round;
}

export async function runPhaseStreaming(
  session: ForumSession,
  phase: DiscussionPhase,
  callbacks?: StreamCallbacks,
  previousResponses?: { id: string; response: ArchitectResponse }[],
  options?: ForumSessionOptions
): Promise<ForumRound> {
  const client = new OpenAI();
  const model = options?.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1";
  const panel = buildPanel(session.panel, options?.dataDir);
  const userPrompt = buildPhasePrompt(phase, session.context, previousResponses);

  const results: { id: string; response: ArchitectResponse }[] = [];

  for (const architect of panel) {
    callbacks?.onArchitectStart?.(architect.id);
    const response = await callArchitectStreaming(
      client,
      architect.systemPrompt,
      userPrompt,
      model,
      architect.id,
      callbacks
    );
    results.push({ id: architect.id, response });
    callbacks?.onArchitectComplete?.(architect.id, response);
  }

  const round: ForumRound = {
    round: session.rounds.length + 1,
    phase,
    trigger: session.rounds.length === 0 ? "initial_context" : "initial_context",
    responses: results.map((result) => result.response),
  };

  session.rounds.push(round);
  session.current_phase = phase;
  session.iteration++;

  callbacks?.onPhaseComplete?.(phase, round.responses);

  return round;
}

export async function runFullForum(
  session: ForumSession,
  options?: ForumSessionOptions
): Promise<ForumSession> {
  const proposalRound = await runPhase(session, "proposal", undefined, options);
  const proposals = proposalRound.responses.map((response, index) => ({
    id: session.panel[index],
    response,
  }));

  const critiqueRound = await runPhase(session, "cross_critique", proposals, options);
  const critiques = critiqueRound.responses.map((response, index) => ({
    id: session.panel[index],
    response,
  }));

  await runPhase(session, "convergence", critiques, options);

  return session;
}

export function sessionToForumResult(session: ForumSession) {
  return {
    project: session.context,
    panel: session.panel,
    rounds: session.rounds,
  };
}

function extractResponseText(response: any): string {
  if (response.output_text && response.output_text.trim()) {
    return response.output_text;
  }

  const fallback = response.output
    ?.flatMap((item: any) => item.content ?? [])
    .filter((part: any) => part.type === "output_text" && typeof part.text === "string")
    .map((part: any) => part.text ?? "")
    .join("") ?? "";

  return fallback;
}
