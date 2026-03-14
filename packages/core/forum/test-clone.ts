/**
 * 건축가 클론 테스트 스크립트
 *
 * 사용법:
 *   npx tsx packages/core/forum/test-clone.ts [architect_id]
 *
 * 예시:
 *   npx tsx packages/core/forum/test-clone.ts adrian_smith
 *   npx tsx packages/core/forum/test-clone.ts            # 전체 프로필 목록 출력
 */

import { loadArchitectProfile, buildSystemPrompt, listArchitectIds } from "./architect-loader";

const architectId = process.argv[2];

if (!architectId) {
  console.log("사용 가능한 건축가 클론:");
  console.log("─".repeat(60));
  const ids = listArchitectIds();
  for (const id of ids) {
    const profile = loadArchitectProfile(id);
    const cat =
      profile.category === "design_practice_master" ? "🏗️  실무" : "💡 사상가";
    console.log(`  ${cat}  ${id.padEnd(20)} ${profile.reference}`);
  }
  console.log("─".repeat(60));
  console.log(`\n사용법: npx tsx packages/core/forum/test-clone.ts <architect_id>`);
  process.exit(0);
}

const profile = loadArchitectProfile(architectId);
const systemPrompt = buildSystemPrompt(profile);

console.log("═".repeat(70));
console.log(`건축가 클론: ${profile.reference} (${profile.id})`);
console.log(`카테고리: ${profile.category}`);
console.log("═".repeat(70));
console.log("\n[생성된 시스템 프롬프트]\n");
console.log(systemPrompt);
console.log("\n" + "═".repeat(70));
console.log(`프롬프트 길이: ${systemPrompt.length} chars`);
console.log("═".repeat(70));
