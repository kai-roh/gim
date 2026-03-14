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
} from "./types";

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
- 형태 컨셉: ${o.response.proposal.form_concept}
- 구조: ${o.response.proposal.structural_system.system} (${o.response.proposal.structural_system.core_type})
- 핵심 특징: ${o.response.proposal.key_features.join(", ")}
- 수직 조닝: ${o.response.proposal.vertical_zoning.map((z) => `${z.zone}(${z.floors[0]}~${z.floors[1]}F: ${z.primary_function})`).join(" → ")}
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

  if (phase === "convergence") {
    const othersText = otherResponses!
      .map(
        (o) => `
### ${o.id}의 수정된 제안 + 비평:
- 입장: ${o.response.stance}
- 비평: ${o.response.critique?.map((c) => `[→${c.target_architect_id}] ${c.point}`).join(" | ") || "없음"}
- 형태 컨셉: ${o.response.proposal.form_concept}
- 핵심 특징: ${o.response.proposal.key_features.join(", ")}
`
      )
      .join("\n");

    return `${contextPrompt}

## 교차 비평 결과

${othersText}

이제 수렴 단계입니다. phase는 "convergence"입니다.
- 다른 건축가들과의 공통점을 찾아 compromise를 작성하세요.
- proposal을 합의 방향으로 조정하세요.
- 층별 건축가 스타일 배분(style_ref)에 대한 합의안을 제시하세요.
- 여전히 동의하지 않는 부분은 critique에 기록하세요.`;
  }

  if (phase === "expert_review") {
    const othersText = otherResponses!
      .map(
        (o) => `
### ${o.id}의 수렴된 제안:
- 입장: ${o.response.stance}
- 타협안: ${o.response.compromise || "없음"}
- 구조: ${o.response.proposal.structural_system.system} (${o.response.proposal.structural_system.core_type})
- 수직 조닝: ${o.response.proposal.vertical_zoning.map((z) => `${z.zone}(${z.floors[0]}~${z.floors[1]}F: ${z.primary_function})`).join(" → ")}
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
  model: string
): Promise<ArchitectResponse> {
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
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
  callbacks?: StreamCallbacks
): Promise<ArchitectResponse> {
  const stream = client.messages.stream({
    model,
    max_tokens: 4096,
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
// Run Phase (streaming mode — sequential execution for UX)
// ============================================================

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

  const results: { id: string; response: ArchitectResponse }[] = [];

  // Sequential execution so users can follow the discussion
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
      callbacks
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
