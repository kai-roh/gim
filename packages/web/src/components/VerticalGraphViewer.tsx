"use client";

import React from "react";
import { BuildingFloorView } from "./BuildingFloorView";

// Legacy component kept as a thin alias while the UI transitions to the
// spatial mass graph terminology.
export function VerticalGraphViewer() {
  return <BuildingFloorView />;
}
