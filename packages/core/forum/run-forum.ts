/**
 * 건축가 토론 실행 스크립트
 *
 * 사용법:
 *   ANTHROPIC_API_KEY=sk-... npx tsx packages/core/forum/run-forum.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildPanel } from "./architect-loader";
import type { ArchitectResponse, DesignProposal, ProjectContext } from "./types";

const client = new Anthropic();

// ─── 프로젝트 컨텍스트 ───
const PROJECT_CONTEXT: ProjectContext = {
  site: {
    location: "서울 용산 국제업무지구",
    dimensions: [80, 60],
    far: 1000,
    bcr: 60,
    height_limit: 300,
    context: {
      north: "40m 도로",
      south: "한강 조망 (직선거리 800m)",
      east: "인접 타워 250m",
      west: "용산공원 (직선거리 200m)",
    },
  },
  program: {
    total_gfa: 48000,
    uses: [
      { type: "retail_culture", ratio: 0.08, requirements: "저층부 1~5F, 공공보이드 포함" },
      { type: "premium_office", ratio: 0.15, requirements: "중저층 6~14F" },
      { type: "office", ratio: 0.35, requirements: "중층 15~38F" },
      { type: "hotel", ratio: 0.2, requirements: "고층 40~55F, 부티크 호텔" },
      { type: "sky_lounge_observation", ratio: 0.07, requirements: "크라운 56~60F" },
      { type: "mechanical_core", ratio: 0.1, requirements: "기계층, 코어, 피난안전구역" },
      { type: "parking", ratio: 0.05, requirements: "지하 B1~B3" },
    ],
  },
  constraints: [
    "60층 규모, 높이 약 250m",
    "남측 한강 조망 최대 확보",
    "서측 용산공원과의 시각적/물리적 연결",
    "저층부 공공 기여 (보이드, 문화시설) 필수",
    "피난안전구역 매 25층 이내 배치 (건축법)",
  ],
  client_vision: "서울의 새로운 랜드마크, 업무+호텔+문화가 어우러진 수직 도시",
};

const CONTEXT_PROMPT = `
## 프로젝트 컨텍스트

**위치**: ${PROJECT_CONTEXT.site.location}
**대지**: ${PROJECT_CONTEXT.site.dimensions[0]}m × ${PROJECT_CONTEXT.site.dimensions[1]}m
**용적률**: ${PROJECT_CONTEXT.site.far}%
**건폐율**: ${PROJECT_CONTEXT.site.bcr}%
**높이 제한**: ${PROJECT_CONTEXT.site.height_limit}m

**주변 맥락**:
- 북측: ${PROJECT_CONTEXT.site.context.north}
- 남측: ${PROJECT_CONTEXT.site.context.south}
- 동측: ${PROJECT_CONTEXT.site.context.east}
- 서측: ${PROJECT_CONTEXT.site.context.west}

**프로그램 구성**:
${PROJECT_CONTEXT.program.uses.map((u) => `- ${u.type}: ${(u.ratio * 100).toFixed(0)}% — ${u.requirements}`).join("\n")}

**핵심 조건**:
${PROJECT_CONTEXT.constraints.map((c) => `- ${c}`).join("\n")}

**클라이언트 비전**: ${PROJECT_CONTEXT.client_vision}
`;

// ─── 단계별 유저 프롬프트 ───
function phasePrompt(
  phase: string,
  otherResponses?: { id: string; response: ArchitectResponse }[]
): string {
  if (phase === "proposal") {
    return `${CONTEXT_PROMPT}

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

    return `${CONTEXT_PROMPT}

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

    return `${CONTEXT_PROMPT}

## 교차 비평 결과

${othersText}

이제 수렴 단계입니다. phase는 "convergence"입니다.
- 다른 건축가들과의 공통점을 찾아 compromise를 작성하세요.
- proposal을 합의 방향으로 조정하세요.
- 여전히 동의하지 않는 부분은 critique에 기록하세요.`;
  }

  return "";
}

// ─── Claude API 호출 ───
async function callArchitect(
  systemPrompt: string,
  userPrompt: string
): Promise<ArchitectResponse> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // JSON 추출 (```json ... ``` 또는 raw JSON)
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) {
    throw new Error(`JSON 파싱 실패:\n${text.slice(0, 500)}`);
  }

  return JSON.parse(jsonMatch[1]) as ArchitectResponse;
}

// ─── 토론 결과 출력 ───
function printResponse(resp: ArchitectResponse, label: string) {
  console.log(`\n${"─".repeat(70)}`);
  console.log(`🏛️  ${label} [${resp.phase}]`);
  console.log(`${"─".repeat(70)}`);
  console.log(`\n📌 입장: ${resp.stance}`);
  console.log(`\n💬 논거:\n${resp.reasoning}`);
  console.log(`\n🏗️  형태 컨셉: ${resp.proposal.form_concept}`);
  console.log(`\n📐 구조: ${resp.proposal.structural_system.system} | 코어: ${resp.proposal.structural_system.core_type}`);
  console.log(`   특수요소: ${resp.proposal.structural_system.special_elements.join(", ")}`);
  console.log(`\n🔑 핵심 특징:`);
  resp.proposal.key_features.forEach((f) => console.log(`   - ${f}`));
  console.log(`\n📊 수직 조닝:`);
  resp.proposal.vertical_zoning.forEach((z) =>
    console.log(`   [${z.zone}] ${z.floors[0]}~${z.floors[1]}F: ${z.primary_function} — ${z.rationale}`)
  );

  if (resp.critique && resp.critique.length > 0) {
    console.log(`\n⚔️  비평:`);
    resp.critique.forEach((c) =>
      console.log(`   → ${c.target_architect_id}: ${c.point}${c.counter_proposal ? `\n     대안: ${c.counter_proposal}` : ""}`)
    );
  }

  if (resp.compromise) {
    console.log(`\n🤝 타협안: ${resp.compromise}`);
  }
}

function printFinalSummary(responses: { id: string; response: ArchitectResponse }[]) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📋 최종 합의 요약`);
  console.log(`${"═".repeat(70)}`);

  // 공통 합의점 추출
  console.log(`\n🤝 각 건축가의 타협안:`);
  responses.forEach((r) => {
    console.log(`\n  [${r.id}]: ${r.response.compromise || "타협안 없음"}`);
  });

  // 최종 수직 조닝 비교
  console.log(`\n📊 최종 수직 조닝 비교:`);
  console.log(`${"─".repeat(70)}`);
  console.log(`${"존".padEnd(15)}| ${responses.map((r) => r.id.padEnd(22)).join("| ")}`);
  console.log(`${"─".repeat(70)}`);

  const allZones = new Set<string>();
  responses.forEach((r) =>
    r.response.proposal.vertical_zoning.forEach((z) => allZones.add(z.zone))
  );

  for (const zone of allZones) {
    const cols = responses.map((r) => {
      const z = r.response.proposal.vertical_zoning.find((v) => v.zone === zone);
      return z ? `${z.floors[0]}~${z.floors[1]}F` : "-";
    });
    console.log(`${zone.padEnd(15)}| ${cols.map((c) => c.padEnd(22)).join("| ")}`);
  }

  // 미합의 쟁점
  console.log(`\n⚠️  미합의 쟁점:`);
  responses.forEach((r) => {
    if (r.response.critique && r.response.critique.length > 0) {
      r.response.critique.forEach((c) => {
        console.log(`  [${r.id} → ${c.target_architect_id}]: ${c.point}`);
      });
    }
  });
}

// ─── 메인 실행 ───
async function main() {
  const panelIds = ["adrian_smith", "koolhaas", "hadid"];
  const panel = buildPanel(panelIds);

  console.log(`${"═".repeat(70)}`);
  console.log(`🏛️  GIM 건축가 토론 시작`);
  console.log(`${"═".repeat(70)}`);
  console.log(`프로젝트: ${PROJECT_CONTEXT.site.location} 60층 초고층 복합타워`);
  console.log(`패널: ${panelIds.join(", ")}`);
  console.log(`${"═".repeat(70)}`);

  // ── Phase 1: 발제 (병렬) ──
  console.log(`\n\n${"█".repeat(70)}`);
  console.log(`  PHASE 1: 발제 (Proposal)`);
  console.log(`${"█".repeat(70)}`);

  const proposalPromises = panel.map(async (a) => {
    const resp = await callArchitect(a.systemPrompt, phasePrompt("proposal"));
    return { id: a.id, response: resp };
  });
  const proposals = await Promise.all(proposalPromises);

  for (const p of proposals) {
    printResponse(p.response, `${p.id} — ${panel.find((a) => a.id === p.id)!.profile.reference}`);
  }

  // ── Phase 2: 교차 비평 (병렬) ──
  console.log(`\n\n${"█".repeat(70)}`);
  console.log(`  PHASE 2: 교차 비평 (Cross Critique)`);
  console.log(`${"█".repeat(70)}`);

  const critiquePromises = panel.map(async (a) => {
    const others = proposals.filter((p) => p.id !== a.id);
    const resp = await callArchitect(
      a.systemPrompt,
      phasePrompt("cross_critique", others)
    );
    return { id: a.id, response: resp };
  });
  const critiques = await Promise.all(critiquePromises);

  for (const c of critiques) {
    printResponse(c.response, `${c.id} — ${panel.find((a) => a.id === c.id)!.profile.reference}`);
  }

  // ── Phase 3: 수렴 (병렬) ──
  console.log(`\n\n${"█".repeat(70)}`);
  console.log(`  PHASE 3: 수렴 (Convergence)`);
  console.log(`${"█".repeat(70)}`);

  const convergencePromises = panel.map(async (a) => {
    const others = critiques.filter((c) => c.id !== a.id);
    const resp = await callArchitect(
      a.systemPrompt,
      phasePrompt("convergence", others)
    );
    return { id: a.id, response: resp };
  });
  const convergenceResults = await Promise.all(convergencePromises);

  for (const r of convergenceResults) {
    printResponse(r.response, `${r.id} — ${panel.find((a) => a.id === r.id)!.profile.reference}`);
  }

  // ── 최종 요약 ──
  printFinalSummary(convergenceResults);

  // ── JSON 출력 ──
  const fs = await import("fs");
  const path = await import("path");
  const resultsDir = "forum_results";
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputPath = path.join(resultsDir, `${timestamp}.json`);
  const output = {
    project: PROJECT_CONTEXT,
    panel: panelIds,
    rounds: [
      { phase: "proposal", responses: proposals.map((p) => p.response) },
      { phase: "cross_critique", responses: critiques.map((c) => c.response) },
      { phase: "convergence", responses: convergenceResults.map((r) => r.response) },
    ],
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n\n✅ 전체 토론 결과가 ${outputPath}에 저장되었습니다.`);
}

main().catch((e) => {
  console.error("토론 실행 오류:", e);
  process.exit(1);
});
