import { NextResponse } from "next/server";
import { createForumSession } from "@gim/core";
import type { ProjectContext } from "@gim/core";
import { sessionStore } from "@/lib/session-store";

export async function POST(request: Request) {
  const body = await request.json();
  const { panelIds, context } = body as {
    panelIds: string[];
    context?: ProjectContext;
  };

  if (!panelIds || panelIds.length < 2 || panelIds.length > 5) {
    return NextResponse.json(
      { error: "panelIds must contain 2-5 architect IDs" },
      { status: 400 }
    );
  }

  const defaultContext: ProjectContext = {
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

  const session = createForumSession(panelIds, context ?? defaultContext);

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
