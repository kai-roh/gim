import { NextResponse } from "next/server";
import { listArchitectIds, loadArchitectProfile } from "@gim/core";
import * as path from "path";

const DATA_DIR = path.resolve(process.cwd(), "../../data");

export async function GET() {
  const ids = listArchitectIds(DATA_DIR);
  const architects = ids.map((id) => {
    const profile = loadArchitectProfile(id, DATA_DIR);
    return {
      id: profile.id,
      reference: profile.reference,
      category: profile.category,
      assertiveness: profile.discussion_style.assertiveness,
      compromise_willingness: profile.discussion_style.compromise_willingness,
      focus_priority: profile.discussion_style.focus_priority,
      representative_buildings: profile.knowledge_base.representative_buildings,
    };
  });

  return NextResponse.json(architects);
}
