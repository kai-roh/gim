import { NextResponse } from "next/server";
import { createForumSession } from "@gim/core";
import type { ProjectContext } from "@gim/core";
import { sessionStore } from "@/lib/session-store";

const DEFAULT_CONTEXT: ProjectContext = {
  company: {
    name: "Gentle Monster",
    brand_philosophy: "하이엔드 아이웨어 브랜드. 실험적 공간 경험과 아트 인스톨레이션으로 리테일의 새로운 패러다임 제시",
    identity_keywords: ["experimental", "art_installation", "futuristic", "immersive_experience", "avant_garde"],
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

export async function POST(request: Request) {
  const body = await request.json();
  const { panelIds, context, brief } = body as {
    panelIds: string[];
    context?: ProjectContext;
    brief?: string;
  };

  if (!panelIds || panelIds.length < 2 || panelIds.length > 5) {
    return NextResponse.json(
      { error: "panelIds must contain 2-5 architect IDs" },
      { status: 400 }
    );
  }

  // Build context: explicit context > brief-augmented default > pure default
  let projectContext: ProjectContext;
  if (context) {
    projectContext = context;
  } else if (brief) {
    projectContext = { ...DEFAULT_CONTEXT, client_vision: brief };
  } else {
    projectContext = DEFAULT_CONTEXT;
  }

  const session = createForumSession(panelIds, projectContext);

  sessionStore.set(session.project_id, {
    session,
    status: "idle",
    currentPhaseResponses: [],
  });

  return NextResponse.json({
    sessionId: session.project_id,
    panel: panelIds,
    context: session.context,
  });
}
