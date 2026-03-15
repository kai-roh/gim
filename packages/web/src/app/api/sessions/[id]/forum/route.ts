import { NextResponse } from "next/server";
import * as path from "path";
import * as fs from "fs";

const FORUM_OUTPUT_DIR = path.resolve(process.cwd(), "../../forum_results");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const forumFile = path.join(FORUM_OUTPUT_DIR, `${id}.json`);

  if (!fs.existsSync(forumFile)) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  try {
    const raw = fs.readFileSync(forumFile, "utf-8");
    return NextResponse.json(JSON.parse(raw));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load session";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
