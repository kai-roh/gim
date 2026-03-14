/**
 * Run the architect forum and print the consensus mass graph.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-4.1 npx tsx packages/core/forum/run-forum.ts
 */

import * as fs from "fs";
import * as path from "path";
import type { ArchitectResponse, ProjectContext } from "./types";
import {
  createForumSession,
  runPhase,
  sessionToForumResult,
} from "./forum-engine";
import { buildGraphFromForumResult } from "../graph/program-graph";

const PROJECT_CONTEXT: ProjectContext = {
  company: {
    name: "Gentle Monster",
    brand_philosophy:
      "하이엔드 아이웨어 브랜드. 실험적 공간 경험과 아트 인스톨레이션으로 리테일의 새로운 패러다임 제시",
    identity_keywords: [
      "experimental",
      "art_installation",
      "futuristic",
      "immersive_experience",
      "avant_garde",
    ],
  },
  site: {
    location: "서울 성수동",
    dimensions: [40, 35],
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
      { type: "brand_experience", ratio: 0.25, requirements: "도시와 만나는 공공적 경험" },
      { type: "office", ratio: 0.35, requirements: "본사 업무공간" },
      { type: "creative_lab", ratio: 0.15, requirements: "R&D 및 크리에이티브 랩" },
      { type: "executive_lounge", ratio: 0.1, requirements: "임원 라운지 및 미팅" },
      { type: "rooftop", ratio: 0.05, requirements: "루프탑 가든" },
      { type: "support", ratio: 0.1, requirements: "코어와 서비스" },
    ],
  },
  constraints: [
    "지상 8층, 지하 1층 규모 (높이 약 40m)",
    "성수동 카페거리와의 보행 연결성 확보",
    "건축 자체가 브랜드 경험이 되어야 함",
    "void와 커뮤니티 공간의 위계가 중요함",
  ],
  client_vision:
    "건축 자체가 브랜드 경험이 되는 본사. 매스의 관계와 공간 서사를 통해 브랜드를 체험하게 하는 건축.",
};

function printResponse(response: ArchitectResponse) {
  console.log(`\n[${response.architect_id}] ${response.phase}`);
  console.log(`- 입장: ${response.stance}`);
  console.log(`- 컨셉: ${response.proposal.massing_concept}`);
  console.log(`- 노드 수: ${response.proposal.mass_entities.length}`);
  console.log(`- 관계 수: ${response.proposal.mass_relations.length}`);
  for (const node of response.proposal.mass_entities.slice(0, 6)) {
    console.log(
      `  • ${node.id}: ${node.kind}/${node.hierarchy} ${node.spatial_role} ` +
        `[${node.geometry.primitive}, ${node.geometry.vertical_placement}]`
    );
  }
}

async function main() {
  const panelIds = ["adrian_smith", "koolhaas", "hadid"];
  const session = createForumSession(panelIds, PROJECT_CONTEXT);

  const proposalRound = await runPhase(session, "proposal");
  proposalRound.responses.forEach(printResponse);

  const critiques = proposalRound.responses.map((response, index) => ({
    id: panelIds[index],
    response,
  }));

  const critiqueRound = await runPhase(session, "cross_critique", critiques);
  critiqueRound.responses.forEach(printResponse);

  const convergenceInputs = critiqueRound.responses.map((response, index) => ({
    id: panelIds[index],
    response,
  }));

  const convergenceRound = await runPhase(session, "convergence", convergenceInputs);
  convergenceRound.responses.forEach(printResponse);

  const resultsDir = path.resolve(__dirname, "../../../forum_results");
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const forumPath = path.join(resultsDir, `${timestamp}.json`);
  const forumResult = sessionToForumResult(session);
  fs.writeFileSync(forumPath, JSON.stringify(forumResult, null, 2), "utf-8");

  const graph = buildGraphFromForumResult(forumResult);
  const graphDir = path.resolve(__dirname, "../../../graph_output");
  if (!fs.existsSync(graphDir)) fs.mkdirSync(graphDir, { recursive: true });

  const graphPath = path.join(graphDir, "spatial_mass_graph.json");
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), "utf-8");

  console.log(`\nSaved forum result: ${forumPath}`);
  console.log(`Saved graph: ${graphPath}`);
}

main().catch((error) => {
  console.error("토론 실행 오류:", error);
  process.exit(1);
});
