import { NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import type { SpatialMassGraph } from "@gim/core";
import { withResolvedMassModel } from "@gim/core";
import { buildImageGenerationPrompt } from "@/lib/server/image-prompt";

export const runtime = "nodejs";

function parseDataUrl(dataUrl: string) {
  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid image payload.");
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 500 }
    );
  }

  const body = (await request.json()) as {
    graph?: SpatialMassGraph;
    sourceImageDataUrl?: string;
  };

  if (!body.graph || !body.sourceImageDataUrl) {
    return NextResponse.json(
      { error: "graph and sourceImageDataUrl are required." },
      { status: 400 }
    );
  }

  try {
    const graph = withResolvedMassModel(body.graph);
    const { prompt, architects, material_language } =
      await buildImageGenerationPrompt(graph);
    const { mimeType, buffer } = parseDataUrl(body.sourceImageDataUrl);
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const imageFile = await toFile(buffer, "mass-reference.png", { type: mimeType });

    const response = await client.images.edit({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5",
      image: imageFile,
      prompt,
      n: 2,
      size: "1024x1024",
      quality: "high",
      input_fidelity: "high",
      background: "opaque",
      output_format: "png",
    });

    const images = (response.data ?? [])
      .map((item) => item.b64_json)
      .filter((value): value is string => Boolean(value))
      .map((value) => `data:image/png;base64,${value}`);

    if (images.length === 0) {
      return NextResponse.json(
        { error: "Image generation completed without image payload." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      images,
      prompt,
      architects,
      material_language,
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Image generation failed.",
      },
      { status: 500 }
    );
  }
}
