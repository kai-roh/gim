// ============================================================
// Spatial Mass Graph Colors
// Stable per-node display colors for exports and downstream prompts.
// ============================================================

import type { MassNode, SpatialMassGraph } from "./types";

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const huePrime = hue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));

  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma;
    green = x;
  } else if (huePrime < 2) {
    red = x;
    green = chroma;
  } else if (huePrime < 3) {
    green = chroma;
    blue = x;
  } else if (huePrime < 4) {
    green = x;
    blue = chroma;
  } else if (huePrime < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  const match = l - chroma / 2;
  const toHex = (value: number) =>
    Math.round((value + match) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

export function displayColorForNodeId(nodeId: string): string {
  const hash = stableHash(nodeId);
  const hue = hash % 360;
  const saturation = 68 + (hash % 12);
  const lightness = 52 + ((hash >> 3) % 10);
  return hslToHex(hue, saturation, lightness);
}

export function withNodeDisplayColors(nodes: MassNode[]): MassNode[] {
  return nodes.map((node) => {
    const color = displayColorForNodeId(node.id);
    return {
      ...node,
      properties: {
        ...node.properties,
        display_color: color,
        display_color_hex: color,
      },
    };
  });
}

export function withDisplayColors(graph: SpatialMassGraph): SpatialMassGraph {
  return {
    ...graph,
    nodes: withNodeDisplayColors(graph.nodes),
  };
}
