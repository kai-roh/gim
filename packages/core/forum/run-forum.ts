/**
 * 건축가 토론 실행 스크립트 (CLI 진입점)
 *
 * 사용법:
 *   ANTHROPIC_API_KEY=sk-... npx tsx packages/core/forum/run-forum.ts
 */

import * as fs from "fs";
import * as path from "path";
import type { ArchitectResponse } from "./types";
import {
  createForumSession,
  runPhase,
  sessionToForumResult,
} from "./forum-engine";
import { buildPanel } from "./architect-loader";

// ─── 프로젝트 컨텍스트 (Gentle Monster HQ) ───
const PROJECT_CONTEXT = {
  company: {
    name: "Gentle Monster",
    brand_philosophy: "하이엔드 아이웨어 브랜드. 실험적 공간 경험과 아트 인스톨레이션으로 리테일의 새로운 패러다임 제시",
    identity_keywords: ["experimental", "art_installation", "futuristic", "immersive_experience", "avant_garde"],
  },
  site: {
    location: "서울 성수동",
    dimensions: [40, 35] as [number, number],
    far: 600,
    bcr: 60,
    height_limit: 50,
    context: {
      north: "성수 카페거리, 보행 밀집 지역",
      south: "주거지역, 중저층 건물",
      east: "성수역 도보 5분",
      west: "서울숲 (직선거리 300m)",
    },
  },
  program: {
    total_gfa: 8400,
    uses: [
      { type: "brand_experience", ratio: 0.25, requirements: "1~2F, 브랜드 쇼룸+체험형 리테일+갤러리" },
      { type: "office", ratio: 0.35, requirements: "3~5F, 본사 업무공간" },
      { type: "creative_lab", ratio: 0.15, requirements: "6F, R&D 및 크리에이티브 랩" },
      { type: "executive_lounge", ratio: 0.10, requirements: "7F, 임원 라운지 및 미팅" },
      { type: "rooftop", ratio: 0.05, requirements: "RF, 루프탑 가든+이벤트" },
      { type: "support", ratio: 0.10, requirements: "기계실, 코어, 서버룸" },
    ],
  },
  constraints: [
    "지상 8층, 지하 1층 규모 (높이 약 40m)",
    "성수동 카페거리와의 보행 연결성 확보",
    "저층부 브랜드 경험 공간 — 인스톨레이션/갤러리 필수",
    "층별 서로 다른 건축가 스타일 배분 가능",
    "각 층이 독립적 공간 경험을 제공하되 전체 브랜드 정체성 유지",
  ],
  client_vision: "건축 자체가 브랜드 경험이 되는 본사. 매 층마다 다른 공간 경험, 예술과 상업의 경계를 허무는 실험적 공간",
};

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

function printFinalSummary(panelIds: string[], responses: ArchitectResponse[]) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📋 최종 합의 요약`);
  console.log(`${"═".repeat(70)}`);

  console.log(`\n🤝 각 건축가의 타협안:`);
  responses.forEach((r, i) => {
    console.log(`\n  [${panelIds[i]}]: ${r.compromise || "타협안 없음"}`);
  });

  console.log(`\n📊 최종 수직 조닝 비교:`);
  console.log(`${"─".repeat(70)}`);
  console.log(`${"존".padEnd(15)}| ${panelIds.map((id) => id.padEnd(22)).join("| ")}`);
  console.log(`${"─".repeat(70)}`);

  const allZones = new Set<string>();
  responses.forEach((r) =>
    r.proposal.vertical_zoning.forEach((z) => allZones.add(z.zone))
  );

  for (const zone of allZones) {
    const cols = responses.map((r) => {
      const z = r.proposal.vertical_zoning.find((v) => v.zone === zone);
      return z ? `${z.floors[0]}~${z.floors[1]}F` : "-";
    });
    console.log(`${zone.padEnd(15)}| ${cols.map((c) => c.padEnd(22)).join("| ")}`);
  }

  console.log(`\n⚠️  미합의 쟁점:`);
  responses.forEach((r, i) => {
    if (r.critique && r.critique.length > 0) {
      r.critique.forEach((c) => {
        console.log(`  [${panelIds[i]} → ${c.target_architect_id}]: ${c.point}`);
      });
    }
  });
}

// ─── 메인 실행 ───
async function main() {
  const panelIds = ["adrian_smith", "koolhaas", "hadid"];

  console.log(`${"═".repeat(70)}`);
  console.log(`🏛️  GIM 건축가 토론 시작`);
  console.log(`${"═".repeat(70)}`);
  console.log(`프로젝트: ${PROJECT_CONTEXT.company.name} HQ — ${PROJECT_CONTEXT.site.location}`);
  console.log(`패널: ${panelIds.join(", ")}`);
  console.log(`${"═".repeat(70)}`);

  const session = createForumSession(panelIds, PROJECT_CONTEXT);
  const panel = buildPanel(panelIds);

  // ── Phase 1: 발제 (병렬) ──
  console.log(`\n\n${"█".repeat(70)}`);
  console.log(`  PHASE 1: 발제 (Proposal)`);
  console.log(`${"█".repeat(70)}`);

  const proposalRound = await runPhase(session, "proposal");
  const proposals = proposalRound.responses.map((r, i) => ({
    id: panelIds[i],
    response: r,
  }));

  for (const p of proposals) {
    printResponse(p.response, `${p.id} — ${panel.find((a) => a.id === p.id)!.profile.reference}`);
  }

  // ── Phase 2: 교차 비평 (병렬) ──
  console.log(`\n\n${"█".repeat(70)}`);
  console.log(`  PHASE 2: 교차 비평 (Cross Critique)`);
  console.log(`${"█".repeat(70)}`);

  const critiqueRound = await runPhase(session, "cross_critique", proposals);
  const critiques = critiqueRound.responses.map((r, i) => ({
    id: panelIds[i],
    response: r,
  }));

  for (const c of critiques) {
    printResponse(c.response, `${c.id} — ${panel.find((a) => a.id === c.id)!.profile.reference}`);
  }

  // ── Phase 3: 수렴 (병렬) ──
  console.log(`\n\n${"█".repeat(70)}`);
  console.log(`  PHASE 3: 수렴 (Convergence)`);
  console.log(`${"█".repeat(70)}`);

  const convergenceRound = await runPhase(session, "convergence", critiques);

  for (let i = 0; i < convergenceRound.responses.length; i++) {
    const r = convergenceRound.responses[i];
    printResponse(r, `${panelIds[i]} — ${panel.find((a) => a.id === panelIds[i])!.profile.reference}`);
  }

  // ── 최종 요약 ──
  printFinalSummary(panelIds, convergenceRound.responses);

  // ── JSON 출력 ──
  const resultsDir = path.resolve(__dirname, "../../../forum_results");
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputPath = path.join(resultsDir, `${timestamp}.json`);
  const output = sessionToForumResult(session);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n\n✅ 전체 토론 결과가 ${outputPath}에 저장되었습니다.`);
}

main().catch((e) => {
  console.error("토론 실행 오류:", e);
  process.exit(1);
});
