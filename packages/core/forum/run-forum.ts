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
  site: {
    location: "",
    dimensions: [0, 0],
    far: 0,
    bcr: 0,
    height_limit: 0,
    context: {
      north: "",
      south: "",
      east: "",
      west: "",
    },
  },
  program: {
    total_gfa: 0,
    uses: [],
  },
  constraints: [],
  client_vision: "사용자 브리프를 직접 입력해 중립적인 포럼 테스트를 수행합니다.",
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
