import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createForumSession } from "@gim/core";
import type { ProjectContext } from "@gim/core";
import { sessionStore } from "@/lib/session-store";

const FALLBACK_CONTEXT: ProjectContext = {
  site: {
    location: "서울",
    dimensions: [40, 35],
    far: 600,
    bcr: 60,
    height_limit: 100,
    context: {
      north: "도로",
      south: "도로",
      east: "인접 건물",
      west: "인접 건물",
    },
  },
  program: {
    total_gfa: 10000,
    uses: [
      { type: "commercial", ratio: 0.3, requirements: "저층부 상업시설" },
      { type: "office", ratio: 0.4, requirements: "중층부 업무시설" },
      { type: "amenity", ratio: 0.15, requirements: "편의시설" },
      { type: "support", ratio: 0.15, requirements: "기계실, 코어" },
    ],
  },
  constraints: [
    "관련 건축법규 준수",
    "주변 맥락과의 조화",
    "층별 서로 다른 건축가 스타일 배분 가능",
  ],
  client_vision: "",
};

/**
 * Parse a natural-language project brief into a structured ProjectContext
 * using Claude (haiku for speed).
 */
async function parseBriefToContext(brief: string): Promise<ProjectContext> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `다음 프로젝트 브리프를 분석해서 건축 설계 컨텍스트를 JSON으로 생성하세요.
브리프에 명시되지 않은 항목은 프로젝트 특성에 맞는 합리적인 기본값을 사용하세요.

브리프: "${brief}"

다음 JSON 형식으로만 응답하세요 (설명 없이 JSON만):
{
  "company": {
    "name": "기업/브랜드명 (없으면 null)",
    "brand_philosophy": "브랜드 철학 한 줄",
    "identity_keywords": ["keyword1", "keyword2", ...]
  },
  "site": {
    "location": "위치",
    "dimensions": [가로m, 세로m],
    "far": 용적률%,
    "bcr": 건폐율%,
    "height_limit": 높이제한m,
    "context": {
      "north": "북측 맥락",
      "south": "남측 맥락",
      "east": "동측 맥락",
      "west": "서측 맥락"
    }
  },
  "program": {
    "total_gfa": 연면적m²,
    "uses": [
      { "type": "용도", "ratio": 비율(0~1), "requirements": "요구사항" }
    ]
  },
  "constraints": ["제약조건1", "제약조건2", ...],
  "client_vision": "클라이언트 비전 요약"
}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch =
    text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);

  if (!jsonMatch) {
    // Parsing failed — use fallback with the brief as client_vision
    return { ...FALLBACK_CONTEXT, client_vision: brief };
  }

  try {
    const parsed = JSON.parse(jsonMatch[1]);

    // Validate required fields exist, fill in any missing ones
    const ctx: ProjectContext = {
      site: {
        location: parsed.site?.location || FALLBACK_CONTEXT.site.location,
        dimensions: parsed.site?.dimensions || FALLBACK_CONTEXT.site.dimensions,
        far: parsed.site?.far ?? FALLBACK_CONTEXT.site.far,
        bcr: parsed.site?.bcr ?? FALLBACK_CONTEXT.site.bcr,
        height_limit:
          parsed.site?.height_limit ?? FALLBACK_CONTEXT.site.height_limit,
        context: {
          north:
            parsed.site?.context?.north ||
            FALLBACK_CONTEXT.site.context.north,
          south:
            parsed.site?.context?.south ||
            FALLBACK_CONTEXT.site.context.south,
          east:
            parsed.site?.context?.east ||
            FALLBACK_CONTEXT.site.context.east,
          west:
            parsed.site?.context?.west ||
            FALLBACK_CONTEXT.site.context.west,
        },
      },
      program: {
        total_gfa:
          parsed.program?.total_gfa ?? FALLBACK_CONTEXT.program.total_gfa,
        uses:
          parsed.program?.uses?.length > 0
            ? parsed.program.uses
            : FALLBACK_CONTEXT.program.uses,
      },
      constraints:
        parsed.constraints?.length > 0
          ? parsed.constraints
          : FALLBACK_CONTEXT.constraints,
      client_vision: parsed.client_vision || brief,
    };

    // company is optional
    if (parsed.company && parsed.company.name) {
      ctx.company = {
        name: parsed.company.name,
        brand_philosophy: parsed.company.brand_philosophy || "",
        identity_keywords: parsed.company.identity_keywords || [],
      };
    }

    return ctx;
  } catch {
    return { ...FALLBACK_CONTEXT, client_vision: brief };
  }
}

export async function POST(request: Request) {
  try {
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

    // Build context: explicit context > brief-parsed > fallback
    let projectContext: ProjectContext;
    if (context) {
      projectContext = context;
    } else if (brief) {
      try {
        projectContext = await parseBriefToContext(brief);
      } catch {
        // Brief parsing failed (e.g. API key missing) — use fallback
        projectContext = { ...FALLBACK_CONTEXT, client_vision: brief };
      }
    } else {
      projectContext = FALLBACK_CONTEXT;
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
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
