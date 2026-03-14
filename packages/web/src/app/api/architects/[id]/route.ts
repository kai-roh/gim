import { NextResponse } from "next/server";
import { loadArchitectProfile } from "@gim/core";
import * as path from "path";

const DATA_DIR = path.resolve(process.cwd(), "../../data");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const profile = loadArchitectProfile(id, DATA_DIR);
    return NextResponse.json(profile);
  } catch {
    return NextResponse.json(
      { error: `Architect not found: ${id}` },
      { status: 404 }
    );
  }
}
