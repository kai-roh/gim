import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const RENDER_DIR = path.resolve(process.cwd(), "public/renders");

function kstTimestamp(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/**
 * Build an architectural visualization prompt from the forum convergence result.
 */
function buildRenderPrompt(forumResult: any, userHint?: string): string {
  // Find the convergence round (final design consensus)
  const convergence = forumResult.rounds?.find(
    (r: any) => r.phase === "convergence"
  );
  const proposal = convergence
    ? convergence.responses?.[0]
    : forumResult.rounds?.[forumResult.rounds.length - 1]?.responses?.[0];

  if (!proposal) {
    return `Photorealistic architectural rendering of a modern mixed-use tower. ${userHint || ""}`;
  }

  const project = forumResult.project;
  const p = proposal.proposal;

  // Extract key design elements
  const formConcept = p?.form_concept || "";
  const keyFeatures = (p?.key_features || []).slice(0, 4).join(". ");
  const structure = p?.structural_system
    ? `${p.structural_system.system} (${p.structural_system.core_type})`
    : "";
  const compromise = proposal.compromise || "";
  const zoning = (p?.vertical_zoning || [])
    .map((z: any) => `${z.zone}: ${z.primary_function}`)
    .join(", ");

  // Site context
  const site = project?.site;
  const location = site?.location || "";
  const context = site?.context
    ? `Surrounded by: ${Object.values(site.context).filter(Boolean).join(", ")}`
    : "";

  // Company brand
  const company = project?.company;
  const brand = company
    ? `For ${company.name} — ${company.brand_philosophy || ""}`
    : "";

  const prompt = `Photorealistic exterior architectural rendering of a building, viewed from street level at a 3/4 angle, golden hour lighting with dramatic sky.

Design concept: ${formConcept}

Key architectural features: ${keyFeatures}

Structural system: ${structure}

Program distribution: ${zoning}

Design philosophy: ${compromise}

${brand}
Location: ${location}. ${context}

Style: Professional architectural visualization, ultra-high quality, photorealistic materials and lighting, cinematic composition. The building should appear as a completed construction with realistic facade materials, glass reflections, and surrounding urban context.

${userHint || ""}`.trim();

  return prompt;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { forumResult, userHint, viewCapture } = body;

    if (!forumResult) {
      return NextResponse.json(
        { error: "Missing forumResult" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_AI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = buildRenderPrompt(forumResult, userHint);

    // Build multimodal contents: reference image (3D view capture) + text prompt
    const contents: any[] = [];
    if (viewCapture) {
      contents.push({
        inlineData: {
          mimeType: "image/png",
          data: viewCapture,
        },
      });
      contents.push({
        text: `위 이미지는 건축 매스 모델의 3D 뷰어 캡처입니다.

**핵심 규칙 — 반드시 준수:**
1. 건물의 전체 비율(가로:세로:높이), 실루엣, 매스 형태를 정확히 유지하세요. 비율을 변경하지 마세요.
2. 카메라 앵글, 시점, 구도를 그대로 유지하세요. 카메라를 이동하거나 회전하지 마세요.
3. 건물의 위치, 크기, 화면 내 배치를 동일하게 유지하세요.
4. 층수와 층별 높이 비율을 변경하지 마세요.
5. 건물의 굴곡, 비틀림, 테이퍼 등 형태적 특징을 그대로 보존하세요.

위 매스 형태를 기반으로 외피(파사드), 재질, 조명, 주변 환경만 포토리얼리스틱하게 렌더링하세요. 건물 형태 자체를 재해석하거나 변형하지 마세요.

${prompt}`,
      });
    } else {
      contents.push({ text: prompt });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents,
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    });

    // Extract image from response
    let imageBase64: string | null = null;
    let description = "";

    const parts = response.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if (part.text) {
        description += part.text;
      } else if (part.inlineData) {
        imageBase64 = part.inlineData.data || null;
      }
    }

    if (!imageBase64) {
      // Debug: return the raw response structure to diagnose
      return NextResponse.json(
        {
          error: "No image generated",
          description,
          prompt,
          debug: {
            candidateCount: response.candidates?.length ?? 0,
            partCount: parts.length,
            partTypes: parts.map((p: any) => Object.keys(p)),
            finishReason: response.candidates?.[0]?.finishReason,
            raw: JSON.stringify(response.candidates?.[0]?.content).slice(0, 1000),
          },
        },
        { status: 500 }
      );
    }

    // Save to disk
    if (!fs.existsSync(RENDER_DIR)) {
      fs.mkdirSync(RENDER_DIR, { recursive: true });
    }
    const ts = kstTimestamp();
    const filename = `render_${ts}.png`;
    const filePath = path.join(RENDER_DIR, filename);
    fs.writeFileSync(filePath, Buffer.from(imageBase64, "base64"));

    // Save metadata
    const meta = {
      timestamp: ts,
      filename,
      prompt,
      description,
      company: forumResult.project?.company?.name || "",
      location: forumResult.project?.site?.location || "",
      panel: forumResult.panel || [],
    };
    fs.writeFileSync(
      path.join(RENDER_DIR, `render_${ts}.json`),
      JSON.stringify(meta, null, 2),
      "utf-8"
    );

    return NextResponse.json({
      image: `/renders/${filename}`,
      filename,
      timestamp: ts,
      description,
      prompt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET — list render history */
export async function GET() {
  try {
    if (!fs.existsSync(RENDER_DIR)) {
      return NextResponse.json([]);
    }

    const files = fs
      .readdirSync(RENDER_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();

    const history = files.map((f) => {
      try {
        const meta = JSON.parse(
          fs.readFileSync(path.join(RENDER_DIR, f), "utf-8")
        );
        return {
          ...meta,
          image: `/renders/${meta.filename}`,
        };
      } catch {
        return null;
      }
    }).filter(Boolean);

    return NextResponse.json(history);
  } catch {
    return NextResponse.json([]);
  }
}
