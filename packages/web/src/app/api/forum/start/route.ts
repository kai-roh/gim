import { NextResponse } from "next/server";
import { createForumSession } from "@gim/core";
import type { ProjectContext } from "@gim/core";
import { sessionStore } from "@/lib/session-store";

function createNeutralContext(brief?: string): ProjectContext {
  return {
  site: {
    location: "",
    dimensions: [0, 0],
    site_area_m2: 0,
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
    client_vision: brief?.trim() || undefined,
  };
}

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

  // Build context: explicit context > neutral brief-only context > empty neutral context
  let projectContext: ProjectContext;
  if (context) {
    projectContext = {
      ...context,
      client_vision: brief?.trim() || context.client_vision,
    };
  } else {
    projectContext = createNeutralContext(brief);
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
