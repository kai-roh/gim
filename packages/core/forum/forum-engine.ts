// ============================================================
// Forum Engine — Reusable API extracted from run-forum.ts
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { buildPanel } from "./architect-loader";
import type {
  ArchitectResponse,
  ProjectContext,
  ForumSession,
  ForumRound,
  DiscussionPhase,
  MassProposal,
} from "./types";
import type {
  SpatialMassGraph,
  MassNode,
  MassRelation,
  MassNodeType,
  MassPrimitive,
  MassScaleCategory,
  MassProportion,
  MassSkin,
  MassPorosity,
  MassSpanCharacter,
  MassRelationFamily,
  FloorZone,
  NodeFunction,
  GlobalGraph,
} from "../graph/types";
import { validateSpatialMassGraph } from "../graph/types";

// ============================================================
// Types
// ============================================================

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

// ============================================================
// Context Prompt Builder
// ============================================================

export function buildContextPrompt(context: ProjectContext): string {
  const companySection = context.company
    ? `
**기업 정보**:
- 기업명: ${context.company.name}
- 브랜드 철학: ${context.company.brand_philosophy}
- 정체성 키워드: ${context.company.identity_keywords.join(", ")}
`
    : "";

  return `
## 프로젝트 컨텍스트
${companySection}
**위치**: ${context.site.location}
**대지**: ${context.site.dimensions[0]}m × ${context.site.dimensions[1]}m
**용적률**: ${context.site.far}%
**건폐율**: ${context.site.bcr}%
**높이 제한**: ${context.site.height_limit}m

**주변 맥락**:
- 북측: ${context.site.context.north}
- 남측: ${context.site.context.south}
- 동측: ${context.site.context.east}
- 서측: ${context.site.context.west}

**프로그램 구성**:
${context.program.uses.map((u) => `- ${u.type}: ${(u.ratio * 100).toFixed(0)}% — ${u.requirements || ""}`).join("\n")}

**핵심 조건**:
${context.constraints.map((c) => `- ${c}`).join("\n")}

**클라이언트 비전**: ${context.client_vision || ""}
`;
}

// ============================================================
// Phase Prompt Builder
// ============================================================

export function buildPhasePrompt(
  phase: DiscussionPhase,
  context: ProjectContext,
  otherResponses?: { id: string; response: ArchitectResponse }[]
): string {
  const contextPrompt = buildContextPrompt(context);

  if (phase === "proposal") {
    return `${contextPrompt}

위 프로젝트에 대한 당신의 초기 설계 제안을 제시하세요.
phase는 "proposal"입니다. critique와 compromise는 빈 배열/null로 두세요.`;
  }

  if (phase === "cross_critique") {
    const othersText = otherResponses!
      .map(
        (o) => `
### ${o.id}의 제안:
- 입장: ${o.response.stance}
- 논거: ${o.response.reasoning}
- 형태 컨셉: ${o.response.proposal?.form_concept || "미정"}
- 구조: ${o.response.proposal?.structural_system?.system || "미정"} (${o.response.proposal?.structural_system?.core_type || "미정"})
- 핵심 특징: ${o.response.proposal?.key_features?.join(", ") || "미정"}
- 수직 조닝: ${o.response.proposal?.vertical_zoning?.map((z) => `${z.zone}(${z.floors[0]}~${z.floors[1]}F: ${z.primary_function})`).join(" → ") || "미정"}
`
      )
      .join("\n");

    return `${contextPrompt}

## 다른 건축가들의 제안

${othersText}

위 제안들을 검토하고 교차 비평하세요.
phase는 "cross_critique"입니다.
- critique에 각 건축가에 대한 비평과 대안을 작성하세요.
- 상대의 좋은 점이 있다면 본인의 proposal도 수정할 수 있습니다.
- compromise는 null로 두세요.`;
  }

  if (phase === "mass_consensus") {
    const othersText = otherResponses!
      .map(
        (o) => {
          const mp = o.response.mass_proposal;
          const entitiesText = mp?.entities
            ?.map((e) => `  - ${e.label} (${e.type}, ${e.floor_range?.[0] ?? "?"}~${e.floor_range?.[1] ?? "?"}F): ${e.programs?.join(", ") || "미정"}`)
            .join("\n") || "매스 제안 없음";
          const relText = mp?.key_relations
            ?.map((r) => `  - ${r.source} → ${r.target}: ${r.family}.${r.rule}`)
            .join("\n") || "관계 없음";
          return `
### ${o.id}의 매스 분절 제안:
- 입장: ${o.response.stance}
- 매스 엔티티:
${entitiesText}
- 핵심 관계:
${relText}
- 형태 컨셉: ${mp?.form_concept || o.response.proposal.form_concept}
`;
        }
      )
      .join("\n");

    return `${contextPrompt}

## 다른 건축가들의 매스 분절 제안

${othersText}

이제 매스 분절 합의 단계입니다. phase는 "mass_consensus"입니다.
- 다른 건축가들의 매스 분절 방식을 검토하고, 합의된 매스 분절안을 mass_proposal에 작성하세요.
- **매스 수는 6~12개** 범위 내여야 합니다.
- **core 타입 매스가 최소 1개** 포함되어야 합니다.
- 각 매스의 label, type, floor_range, programs를 확정하세요.
- key_relations에 매스 간 관계를 정의하세요.
- compromise에 합의 내용을 작성하세요.`;
  }

  if (phase === "convergence") {
    const othersText = otherResponses!
      .map(
        (o) => {
          const mp = o.response.mass_proposal;
          const entitiesText = mp?.entities
            ?.map((e) => `  - ${e.label} (${e.type}, ${e.floor_range[0]}~${e.floor_range[1]}F)`)
            .join("\n") || "";
          return `
### ${o.id}의 수정된 제안 + 비평:
- 입장: ${o.response.stance}
- 비평: ${o.response.critique?.map((c) => `[→${c.target_architect_id}] ${c.point}`).join(" | ") || "없음"}
- 형태 컨셉: ${o.response.proposal?.form_concept || "미정"}
- 핵심 특징: ${o.response.proposal?.key_features?.join(", ") || "미정"}
${entitiesText ? `- 매스 분절:\n${entitiesText}` : ""}
`;
        }
      )
      .join("\n");

    return `${contextPrompt}

## 교차 비평 + 매스 합의 결과

${othersText}

이제 최종 수렴 단계입니다. phase는 "convergence"입니다.
- 다른 건축가들과의 공통점을 찾아 compromise를 작성하세요.
- proposal과 mass_proposal을 합의 방향으로 조정하세요.
- 층별 건축가 스타일 배분(style_ref)에 대한 합의안을 제시하세요.
- 여전히 동의하지 않는 부분은 critique에 기록하세요.`;
  }

  if (phase === "feedback_opinion") {
    const feedbackConstraints = context.constraints.filter((c) =>
      c.startsWith("[Client Feedback]")
    );
    const latestFeedback = feedbackConstraints[feedbackConstraints.length - 1] || "";

    const othersText = otherResponses
      ? otherResponses
          .map((o) => `- ${o.id}: ${o.response.stance}`)
          .join("\n")
      : "";

    return `${contextPrompt}
## 클라이언트 최신 피드백

${latestFeedback}

${othersText ? `## 다른 건축가들의 현재 입장\n${othersText}\n` : ""}
위 피드백에 대해 당신의 간단한 반응을 JSON으로 제시하세요.
phase는 "feedback_opinion"입니다.
- stance와 reasoning은 2~3문장으로 간결하게 피드백 반응 작성
- proposal의 form_concept만 피드백 반영해서 간략히 업데이트
- key_features, vertical_zoning, structural_system은 기존 방향 유지
- critique와 compromise는 빈 배열/null로 두세요`;
  }

  if (phase === "expert_review") {
    const othersText = otherResponses!
      .map(
        (o) => `
### ${o.id}의 수렴된 제안:
- 입장: ${o.response.stance}
- 타협안: ${o.response.compromise || "없음"}
- 구조: ${o.response.proposal?.structural_system?.system || "미정"} (${o.response.proposal?.structural_system?.core_type || "미정"})
- 수직 조닝: ${o.response.proposal?.vertical_zoning?.map((z) => `${z.zone}(${z.floors[0]}~${z.floors[1]}F: ${z.primary_function})`).join(" → ") || "미정"}
`
      )
      .join("\n");

    return `${contextPrompt}

## 수렴된 건축가 제안

${othersText}

위 제안에 대한 전문가 검토를 진행합니다. 법규/구조적 관점에서 검토하세요.`;
  }

  return "";
}

// ============================================================
// Session Management
// ============================================================

export function createForumSession(
  panelIds: string[],
  context: ProjectContext,
  options?: ForumSessionOptions
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

// ============================================================
// Claude API Call (batch mode)
// ============================================================

function parseArchitectResponse(text: string): ArchitectResponse {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) {
    throw new Error(`JSON 파싱 실패:\n${text.slice(0, 500)}`);
  }
  return JSON.parse(jsonMatch[1]) as ArchitectResponse;
}

async function callArchitect(
  client: Anthropic,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number = 3500
): Promise<ArchitectResponse> {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  return parseArchitectResponse(text);
}

// ============================================================
// Claude API Call (streaming mode)
// ============================================================

async function callArchitectStreaming(
  client: Anthropic,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  architectId: string,
  callbacks?: StreamCallbacks,
  maxTokens: number = 3500
): Promise<ArchitectResponse> {
  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  let fullText = "";

  stream.on("text", (text) => {
    fullText += text;
    callbacks?.onToken?.(architectId, text);
  });

  await stream.finalMessage();

  const response = parseArchitectResponse(fullText);
  return response;
}

// ============================================================
// Run Phase (batch mode — parallel execution)
// ============================================================

export async function runPhase(
  session: ForumSession,
  phase: DiscussionPhase,
  previousResponses?: { id: string; response: ArchitectResponse }[],
  options?: ForumSessionOptions
): Promise<ForumRound> {
  const client = new Anthropic();
  const model = options?.model ?? "claude-sonnet-4-20250514";
  const panel = buildPanel(session.panel, options?.dataDir);

  const promises = panel.map(async (a) => {
    const others = previousResponses?.filter((p) => p.id !== a.id);
    const userPrompt = buildPhasePrompt(phase, session.context, others);
    const resp = await callArchitect(client, a.systemPrompt, userPrompt, model);
    return { id: a.id, response: resp };
  });

  const results = await Promise.all(promises);

  const round: ForumRound = {
    round: session.rounds.length + 1,
    phase,
    trigger: session.rounds.length === 0 ? "initial_context" : "initial_context",
    responses: results.map((r) => r.response),
  };

  session.rounds.push(round);
  session.current_phase = phase;
  session.iteration++;

  return round;
}

// ============================================================
// Run Phase (streaming mode — parallel execution with streaming UX)
// ============================================================

// Max tokens per phase — proposal needs detail, later phases are shorter
const PHASE_MAX_TOKENS: Record<string, number> = {
  proposal: 3500,
  cross_critique: 2500,
  mass_consensus: 3000,
  convergence: 2500,
  expert_review: 2000,
  feedback_opinion: 1200,
};

export async function runPhaseStreaming(
  session: ForumSession,
  phase: DiscussionPhase,
  callbacks: StreamCallbacks,
  previousResponses?: { id: string; response: ArchitectResponse }[],
  options?: ForumSessionOptions
): Promise<ForumRound> {
  const client = new Anthropic();
  const model = options?.model ?? "claude-sonnet-4-20250514";
  const panel = buildPanel(session.panel, options?.dataDir);
  const maxTokens = PHASE_MAX_TOKENS[phase] ?? 3500;

  // Sequential execution — one architect at a time so streaming is visible per architect
  const results: { id: string; response: ArchitectResponse }[] = [];

  for (const a of panel) {
    callbacks.onArchitectStart?.(a.id);

    const others = previousResponses?.filter((p) => p.id !== a.id);
    const userPrompt = buildPhasePrompt(phase, session.context, others);

    const resp = await callArchitectStreaming(
      client,
      a.systemPrompt,
      userPrompt,
      model,
      a.id,
      callbacks,
      maxTokens
    );

    callbacks.onArchitectComplete?.(a.id, resp);
    results.push({ id: a.id, response: resp });
  }

  const round: ForumRound = {
    round: session.rounds.length + 1,
    phase,
    trigger: session.rounds.length === 0 ? "initial_context" : "initial_context",
    responses: results.map((r) => r.response),
  };

  session.rounds.push(round);
  session.current_phase = phase;
  session.iteration++;

  callbacks.onPhaseComplete?.(phase, round.responses);

  return round;
}

// ============================================================
// Convenience: Run full 3-phase forum
// ============================================================

export async function runFullForum(
  session: ForumSession,
  options?: ForumSessionOptions
): Promise<ForumSession> {
  // Phase 1: Proposal (parallel)
  const proposalRound = await runPhase(session, "proposal", undefined, options);
  const proposals = proposalRound.responses.map((r, i) => ({
    id: session.panel[i],
    response: r,
  }));

  // Phase 2: Cross Critique (parallel)
  const critiqueRound = await runPhase(session, "cross_critique", proposals, options);
  const critiques = critiqueRound.responses.map((r, i) => ({
    id: session.panel[i],
    response: r,
  }));

  // Phase 3: Convergence (parallel)
  await runPhase(session, "convergence", critiques, options);

  return session;
}

// ============================================================
// Export forum result structure
// ============================================================

export function sessionToForumResult(session: ForumSession) {
  return {
    project: session.context,
    panel: session.panel,
    rounds: session.rounds,
  };
}

// ============================================================
// SpatialMassGraph Builder — from forum mass proposals
// ============================================================

const VALID_MASS_TYPES: MassNodeType[] = ["solid", "void", "core", "connector"];
const VALID_PRIMITIVES: MassPrimitive[] = ["block", "bar", "plate", "ring", "tower", "bridge"];
const VALID_FAMILIES: MassRelationFamily[] = ["stack", "contact", "enclosure", "intersection", "connection", "alignment"];

/**
 * Classify floor zone from floor level ratio
 */
function classifyZone(floor: number, totalFloors: number): FloorZone {
  if (floor < 0) return "basement";
  if (floor === 0 || floor === 1) return "ground";
  const ratio = floor / totalFloors;
  if (ratio <= 0.25) return "lower";
  if (ratio <= 0.6) return "middle";
  if (ratio <= 0.85) return "upper";
  if (ratio <= 0.95) return "penthouse";
  return "rooftop";
}

/**
 * Infer primitive from geometry_intent text
 */
function inferPrimitive(intent: string): MassPrimitive {
  const lower = intent.toLowerCase();
  if (lower.includes("tower") || lower.includes("타워") || lower.includes("slender")) return "tower";
  if (lower.includes("plate") || lower.includes("플레이트") || lower.includes("slab")) return "plate";
  if (lower.includes("bar") || lower.includes("바") || lower.includes("elongated")) return "bar";
  if (lower.includes("ring") || lower.includes("링")) return "ring";
  if (lower.includes("bridge") || lower.includes("브릿지") || lower.includes("연결")) return "bridge";
  return "block";
}

/**
 * Infer scale category from floor_range span and hint dimensions
 */
function inferScaleCategory(floorSpan: number): MassScaleCategory {
  if (floorSpan <= 2) return "small";
  if (floorSpan <= 5) return "medium";
  if (floorSpan <= 10) return "large";
  return "extra_large";
}

/**
 * Infer skin from geometry_intent
 */
function inferSkin(intent: string): MassSkin {
  const lower = intent.toLowerCase();
  if (lower.includes("transparent") || lower.includes("투명") || lower.includes("glass") || lower.includes("유리")) return "transparent";
  if (lower.includes("mixed") || lower.includes("혼합")) return "mixed";
  return "opaque";
}

/**
 * Infer porosity from geometry_intent
 */
function inferPorosity(intent: string): MassPorosity {
  const lower = intent.toLowerCase();
  if (lower.includes("porous") || lower.includes("다공") || lower.includes("open") || lower.includes("개방")) return "porous";
  if (lower.includes("open")) return "open";
  return "solid";
}

/**
 * Infer proportion from geometry_intent
 */
function inferProportion(intent: string): MassProportion {
  const lower = intent.toLowerCase();
  if (lower.includes("slender") || lower.includes("가늘") || lower.includes("slim")) return "slender";
  if (lower.includes("elongated") || lower.includes("길")) return "elongated";
  if (lower.includes("broad") || lower.includes("넓") || lower.includes("wide")) return "broad";
  return "compact";
}

/**
 * Build SpatialMassGraph from merged mass proposals (convergence phase results)
 */
export function buildSpatialMassGraphFromForum(
  session: ForumSession
): SpatialMassGraph {
  // Find the best mass_proposal from the latest convergence or mass_consensus round
  const massRound = [...session.rounds]
    .reverse()
    .find((r) => r.phase === "convergence" || r.phase === "mass_consensus");

  if (!massRound) {
    throw new Error("No convergence or mass_consensus round found");
  }

  // Merge: take the mass_proposal from the first architect who has one,
  // then validate and enrich
  const proposals = massRound.responses
    .filter((r) => r.mass_proposal && r.mass_proposal.entities.length > 0)
    .map((r) => r.mass_proposal!);

  if (proposals.length === 0) {
    throw new Error("No mass_proposal found in convergence responses");
  }

  // Use the proposal with the most entities (likely most detailed)
  const bestProposal = proposals.reduce((a, b) =>
    a.entities.length >= b.entities.length ? a : b
  );

  // Build GlobalGraph from session context
  const ctx = session.context;
  const totalFloors = Math.ceil(
    (ctx.program.total_gfa / (ctx.site.dimensions[0] * ctx.site.dimensions[1] * (ctx.site.bcr / 100)))
  );
  const basementFloors = Math.min(3, Math.floor(totalFloors * 0.15));

  const global: GlobalGraph = {
    site: {
      location: ctx.site.location,
      dimensions: ctx.site.dimensions,
      far: ctx.site.far,
      bcr: ctx.site.bcr,
      height_limit: ctx.site.height_limit,
      context: ctx.site.context,
    },
    program: ctx.program,
    constraints: ctx.constraints,
    total_floors: totalFloors,
    basement_floors: basementFloors,
  };

  const siteW = ctx.site.dimensions[0];
  const siteD = ctx.site.dimensions[1];
  const floorHeight = 3.6; // default floor-to-floor height

  // Build label → id mapping
  const labelToId = new Map<string, string>();
  const nodes: MassNode[] = bestProposal.entities.map((entity, idx) => {
    const id = `mass_${String(idx + 1).padStart(2, "0")}`;
    labelToId.set(entity.label, id);

    const floorSpan = entity.floor_range[1] - entity.floor_range[0] + 1;
    const type = VALID_MASS_TYPES.includes(entity.type as MassNodeType)
      ? entity.type as MassNodeType
      : "solid";
    const primitive = inferPrimitive(entity.geometry_intent);
    const scaleCategory = inferScaleCategory(floorSpan);

    // Estimate dimensions from site and scale
    let width: number, depth: number, height: number;
    height = floorSpan * floorHeight;

    if (type === "core") {
      width = Math.min(8, siteW * 0.2);
      depth = Math.min(8, siteD * 0.2);
    } else if (primitive === "tower") {
      width = Math.min(siteW * 0.4, 20);
      depth = Math.min(siteD * 0.4, 20);
    } else if (primitive === "plate") {
      width = siteW * 0.8;
      depth = siteD * 0.7;
      height = Math.max(floorSpan * floorHeight, 4);
    } else if (primitive === "bar") {
      width = siteW * 0.7;
      depth = siteD * 0.3;
    } else {
      // block
      width = siteW * 0.6;
      depth = siteD * 0.5;
    }

    const zone = classifyZone(entity.floor_range[0], totalFloors);

    return {
      id,
      type,
      label: entity.label,
      ground_contact: entity.floor_range[0] <= 1,
      floor_range: entity.floor_range,
      floor_zone: zone,
      geometry: {
        primitive,
        scale: {
          category: scaleCategory,
          hint: {
            width: Math.round(width * 10) / 10,
            depth: Math.round(depth * 10) / 10,
            height: Math.round(height * 10) / 10,
          },
        },
        proportion: inferProportion(entity.geometry_intent),
        skin: inferSkin(entity.geometry_intent),
        porosity: inferPorosity(entity.geometry_intent),
        span_character: floorSpan <= 2 ? "single" : floorSpan <= 5 ? "stacked" : "multi_level",
      },
      narrative: {
        intent_text: entity.description,
        architectural_description: entity.description,
        facade_text: entity.geometry_intent,
        architect_influence: buildInfluenceMap(massRound.responses, entity.label),
        discussion_trace: bestProposal.form_concept,
      },
      programs: entity.programs as NodeFunction[],
    };
  });

  // Build relations
  const relations: MassRelation[] = bestProposal.key_relations
    .map((rel, idx) => {
      const sourceId = labelToId.get(rel.source);
      const targetId = labelToId.get(rel.target);
      if (!sourceId || !targetId) return null;

      const family = VALID_FAMILIES.includes(rel.family as MassRelationFamily)
        ? rel.family as MassRelationFamily
        : "contact";

      return {
        id: `rel_${String(idx + 1).padStart(2, "0")}`,
        source: sourceId,
        target: targetId,
        family,
        rule: rel.rule || "adjacent",
        strength: family === "stack" ? "hard" as const : "soft" as const,
        description: rel.rationale,
      };
    })
    .filter((r): r is MassRelation => r !== null);

  // Compute floor range
  const allFloors = nodes.flatMap((n) => n.floor_range);
  const minFloor = Math.min(...allFloors);
  const maxFloor = Math.max(...allFloors);

  const graph: SpatialMassGraph = {
    global,
    nodes,
    relations,
    composition_summary: bestProposal.form_concept,
    metadata: {
      created_at: new Date().toISOString(),
      source_forum: session.project_id,
      total_nodes: nodes.length,
      total_relations: relations.length,
      floor_range: [minFloor, maxFloor],
      version: 2,
    },
  };

  // Validate
  const validation = validateSpatialMassGraph(graph);
  if (!validation.valid) {
    console.warn("SpatialMassGraph validation warnings:", validation.errors);
  }
  if (validation.warnings.length > 0) {
    console.warn("SpatialMassGraph warnings:", validation.warnings);
  }

  return graph;
}

/**
 * Build architect influence map from responses for a given entity label
 */
function buildInfluenceMap(
  responses: ArchitectResponse[],
  label: string
): Record<string, number> {
  const influence: Record<string, number> = {};
  const total = responses.length;
  for (const resp of responses) {
    const mp = resp.mass_proposal;
    if (mp?.entities.some((e) => e.label === label)) {
      influence[resp.architect_id] = 1 / total;
    }
  }
  return influence;
}
