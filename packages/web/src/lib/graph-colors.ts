export const KIND_COLORS: Record<string, string> = {
  solid: "#63d58a",
  void: "#ff9f43",
  core: "#5b8cff",
  connector: "#d56dff",
};

export const HIERARCHY_COLORS: Record<string, string> = {
  primary: "#ffffff",
  secondary: "#b5c1d8",
  tertiary: "#708090",
};

export const RELATION_COLORS: Record<string, string> = {
  stack: "#5bc0eb",
  contact: "#52b788",
  enclosure: "#f4a261",
  intersection: "#e76f51",
  connection: "#b565f5",
  alignment: "#90be6d",
};

export const PRIMITIVE_COLORS: Record<string, string> = {
  block: "#8bd3dd",
  bar: "#fcbf49",
  plate: "#ef476f",
  ring: "#06d6a0",
  tower: "#7b2cbf",
  bridge: "#ffd166",
  cylinder: "#a9def9",
};

export const SCALE_LABELS: Record<string, string> = {
  xs: "XS",
  small: "S",
  medium: "M",
  large: "L",
  xl: "XL",
};

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

export function massColor(nodeId: string): string {
  const hash = stableHash(nodeId);
  const hue = hash % 360;
  const saturation = 68 + (hash % 12);
  const lightness = 52 + ((hash >> 3) % 10);
  return hslToHex(hue, saturation, lightness);
}

export function nodeColor(kind: string, primitive?: string): string {
  return KIND_COLORS[kind] || PRIMITIVE_COLORS[primitive || ""] || "#6c757d";
}
