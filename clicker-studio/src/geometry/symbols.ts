// Built-in Decoration symbols, drawn from scratch: star, sparkle, heart, flower, arrows.
import { K, type CrossSection } from "./kernel.ts";
import { capOutline, polygon } from "./outline.ts";

export const SYMBOLS = ["star", "sparkle", "heart", "flower", "up", "down", "left", "right"] as const;
export type SymbolName = (typeof SYMBOLS)[number];

function star(points: number, outer: number, inner: number): CrossSection {
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = Math.PI / 2 + (i * Math.PI) / points;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return polygon(pts);
}

function sparkle(r: number): CrossSection {
  // Four-point star with curved sides.
  const pts: [number, number][] = [];
  const n = 96;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    const c = Math.cos(t), s = Math.sin(t);
    pts.push([r * Math.sign(c) * Math.abs(c) ** 3, r * Math.sign(s) * Math.abs(s) ** 3]);
  }
  return polygon(pts);
}

function arrow(size: number, rotDeg: number): CrossSection {
  const s = size / 2;
  const pts: [number, number][] = [
    [0, s],
    [s * 0.9, -s * 0.05],
    [s * 0.32, -s * 0.05],
    [s * 0.32, -s],
    [-s * 0.32, -s],
    [-s * 0.32, -s * 0.05],
    [-s * 0.9, -s * 0.05],
  ];
  return polygon(pts).rotate(rotDeg);
}

/** A symbol about `size` mm across, centred. */
export function symbol(name: SymbolName, size: number): CrossSection {
  switch (name) {
    case "star":
      return star(5, size / 2, size / 4.6).offset(-0.25, "Round").offset(0.25, "Round");
    case "sparkle":
      return sparkle(size / 2);
    case "heart":
      return capOutline("heart", size, 1);
    case "flower":
      return K().CrossSection.union([capOutline("flower", size, 0)]);
    case "up":
      return arrow(size, 0);
    case "down":
      return arrow(size, 180);
    case "left":
      return arrow(size, 90);
    case "right":
      return arrow(size, -90);
  }
}
