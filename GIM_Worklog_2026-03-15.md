# GIM Worklog - 2026-03-15

## Summary

This document summarizes the major changes made during the current refactor.

The project is no longer centered on a floor-by-floor program graph or an external MCP pipeline.
It now treats the central 3D viewport as the primary modeling output, driven by `SpatialMassGraph`
and its derived `resolved_model`.

## 1. Architectural Direction Change

### Previous direction

- Forum output focused on floor/program zoning.
- Graph generation filled program nodes into floor templates.
- Rhino MCP was expected to consume the graph and create geometry externally.

### Current direction

- Floor/program-first generation was removed from the main pipeline.
- Primary design output is now a spatial mass graph composed of:
  - mass nodes
  - relation constraints
  - narrative metadata
  - provenance
- Central Three.js modeling is now the main geometric interpretation path.
- MCP/Rhino-oriented language was removed from the active pipeline and prompts.

## 2. Core Data Model Refactor

### `SpatialMassGraph` became the main design result

The graph now represents architectural masses rather than floor-bound program cells.

Main graph layers:

- `nodes`
- `relations`
- `narrative`
- `provenance`
- `resolved_model`

### New `resolved_model`

A new deterministic geometric interpretation layer was added.

Purpose:

- convert `SpatialMassGraph` into actual 3D mass transforms and dimensions
- store geometry decisions separately from design intent
- support rendering, evaluation, and export from the same resolved result

Main additions:

- `ResolvedMassNode`
- `ResolvedModelRelation`
- `ResolvedMassModel`
- `ResolvedBooleanOperation`

Key files:

- `packages/core/graph/types.ts`
- `packages/core/graph/resolved-model.ts`
- `packages/core/graph/builder.ts`
- `packages/core/graph/operations.ts`
- `packages/core/index.ts`

## 3. Forum / Agent Pipeline Changes

### Output schema changed

Architect agents now produce spatial mass proposals instead of floor zoning logic.

Important output fields:

- `mass_entities`
- `mass_relations`
- `narrative`

### Prompt direction changed

Prompting was updated so the agents describe masses for the internal 3D resolver rather than for Rhino MCP.

### OpenAI migration

The forum pipeline was switched from Anthropic to OpenAI.

Operational result:

- forum streaming works through OpenAI
- project can run with `OPENAI_API_KEY`
- Anthropic dependency is no longer required for the active path

Key files:

- `data/templates/architect_system.md`
- `packages/core/forum/forum-engine.ts`

## 4. Graph Build / Persistence Changes

### Graph creation

The builder now always attaches a `resolved_model` to the generated graph.

### Graph updates

Client-side graph edits now trigger re-resolution so the 3D model stays in sync with graph changes.

### API behavior

Graph load, save, session graph restore, and evaluation endpoints now reattach or recompute
`resolved_model` rather than assuming geometry is stale or external.

Key files:

- `packages/web/src/lib/graph-context.tsx`
- `packages/web/src/app/api/graph/route.ts`
- `packages/web/src/app/api/graph/save/route.ts`
- `packages/web/src/app/api/sessions/[id]/graph/route.ts`
- `packages/web/src/app/api/graph/evaluate/route.ts`

## 5. Evaluation Changes

### Metric naming and meaning

The evaluation panel no longer refers to MCP readiness.

`MCP` was replaced by `Model`, and evaluation now checks the internal geometric pipeline.

### Current evaluation focus

- relation satisfaction
- model readiness
- narrative completeness
- graph coherence
- unresolved constraints

The evaluation dashboard now recalculates against the current in-memory graph instead of relying only
on a saved file.

Key files:

- `packages/core/graph/evaluation.ts`
- `packages/core/graph/test-graph.ts`
- `packages/web/src/components/EvaluationDashboard.tsx`
- `packages/web/src/app/api/graph/evaluate/route.ts`

## 6. UI / Workspace Layout Changes

### Left panel

- Forum and Results now share the same left panel area.
- When convergence finishes, the panel auto-switches to Results.
- A tab toggle allows moving between Forum and Results.

### Center panel

- The 3D viewer is now the main spatial output.
- `Mass Inspector` was moved below the 3D viewport.

### Right panel

- Top: `SpatialMassGraph` node-link view
- Bottom: evaluation dashboard

### Width adjustments

- The right-side information column was reduced so the center modeling panel has more space.

Key files:

- `packages/web/src/components/AppShell.tsx`
- `packages/web/src/components/BuildingFloorView.tsx`
- `packages/web/src/components/SpatialGraphPanel.tsx`
- `packages/web/src/components/ForumPanel.tsx`

## 7. Forum UX Changes

### Streaming visibility

- Raw JSON is no longer shown as the visible "conversation" stream.
- Streaming status is shown more cleanly.
- Failure states clear stale status text better than before.

### Downloads

Forum / result flow now exposes downloads for:

- `SpatialMassGraph`
- `forum_result`

### Result visibility

The synthesized outcome is now visible in the result view rather than remaining hidden behind the forum flow.

Key files:

- `packages/web/src/components/ForumPanel.tsx`
- `packages/web/src/components/BuildingFloorView.tsx`

## 8. 3D Viewer Refactor

### Camera and readability

- Perspective depth emphasis was removed.
- The model now uses an orthographic camera for clearer architectural reading.
- Masses are opaque by default.
- When a node is selected, unrelated masses fade back.

### Per-mass color identity

- Each mass has a distinct color.
- The same color identity is carried into downloadable graph data so image-generation steps can use it.

### Node-link interaction coupling

- Selecting a node in the right node-link graph selects the same mass in the 3D model.
- Connected nodes are emphasized as a secondary tier.
- Unrelated nodes are strongly faded.

### Export

The viewport can export the current resolved model as:

- OBJ
- STL

Key files:

- `packages/web/src/components/MassViewer3D.tsx`
- `packages/web/src/lib/graph-colors.ts`
- `packages/web/src/components/SpatialGraphPanel.tsx`

## 9. Boolean Subtraction / Void Handling

### Previous behavior

- `void` was mostly treated as a visible translucent mass.
- Subtraction existed only as metadata or future intent.

### Current behavior

- Box-family hosts now resolve subtraction visually in the 3D viewport.
- Supported host primitives:
  - `block`
  - `bar`
  - `plate`
  - `tower`
  - `bridge`
- These hosts are fragmented into remaining solids after subtracting overlapping void bounds.

### Void node behavior

- `void` nodes remain in `SpatialMassGraph`.
- They remain selectable in the graph UI.
- They do not appear as normal opaque masses in the 3D model.
- When a `void` node is selected, the removed volume is shown as a wireframe-style overlay.

### Current limitation

- `ring` and `cylinder` do not yet support full subtraction decomposition.
- For unsupported cases, the system falls back to a direct wireframe overlay behavior.

Key files:

- `packages/core/graph/resolved-model.ts`
- `packages/web/src/components/MassViewer3D.tsx`

## 10. Current State of the System

### What is now true

- The central viewport is the primary geometric interpreter.
- `SpatialMassGraph` is the main design graph.
- `resolved_model` is the main modeling result used by the viewer and evaluation.
- `forum_result` remains the raw discussion archive.
- MCP is no longer part of the intended active modeling path.

### What still remains to improve

- richer subtraction support for non-box primitives
- more explicit relation-to-geometry rules for wrapping and penetration
- more precise export behavior if mesh fidelity needs to increase further
- additional model diagnostics for selected masses

## 11. Main Files Changed

- `data/templates/architect_system.md`
- `packages/core/forum/forum-engine.ts`
- `packages/core/graph/types.ts`
- `packages/core/graph/resolved-model.ts`
- `packages/core/graph/builder.ts`
- `packages/core/graph/operations.ts`
- `packages/core/graph/evaluation.ts`
- `packages/core/graph/test-graph.ts`
- `packages/core/index.ts`
- `packages/web/src/lib/graph-context.tsx`
- `packages/web/src/app/api/graph/route.ts`
- `packages/web/src/app/api/graph/save/route.ts`
- `packages/web/src/app/api/graph/evaluate/route.ts`
- `packages/web/src/app/api/sessions/[id]/graph/route.ts`
- `packages/web/src/components/AppShell.tsx`
- `packages/web/src/components/ForumPanel.tsx`
- `packages/web/src/components/BuildingFloorView.tsx`
- `packages/web/src/components/SpatialGraphPanel.tsx`
- `packages/web/src/components/EvaluationDashboard.tsx`
- `packages/web/src/components/MassViewer3D.tsx`

## 12. Verification Performed

The following checks were run successfully during the refactor:

- `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`
- `node node_modules/typescript/bin/tsc -p packages/web/tsconfig.json --noEmit`

## 13. Suggested Next Steps

Recommended next implementation tasks:

1. Extend boolean subtraction beyond box-family primitives.
2. Strengthen relation-specific geometry solvers for `wraps`, `inside`, and `penetrates`.
3. Add node-level diagnostics for the currently selected mass.
4. Improve resolved-model export semantics if downstream fabrication or modeling workflows become stricter.
