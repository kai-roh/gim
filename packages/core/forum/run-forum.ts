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

// ─── 프로젝트 컨텍스트 ───
const PROJECT_CONTEXT = {
  site: {
    location: "서울 용산 국제업무지구",
    dimensions: [80, 60] as [number, number],
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
  console.log(`프로젝트: ${PROJECT_CONTEXT.site.location} 60층 초고층 복합타워`);
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
