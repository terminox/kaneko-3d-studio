// Outlines: the footprint of a Top Cap or Keycap seen from above, centred on the
// Switch at the origin. All sizes in mm.
import type { CapShape } from "../design/types.ts";
import { K, type CrossSection } from "./kernel.ts";
import type { Ring } from "./path.ts";

const SEG = 64;

export function circle(r: number, at: [number, number] = [0, 0]): CrossSection {
  return K().CrossSection.circle(r, SEG).translate(at);
}

export function polygon(points: [number, number][]): CrossSection {
  return K().CrossSection.ofPolygons([points], "NonZero");
}

export function rings(rs: Ring[], fill: "NonZero" | "EvenOdd" | "Positive" = "NonZero"): CrossSection {
  return K().CrossSection.ofPolygons(rs, fill);
}

/** Rounds convex corners by `r`. */
export function roundConvex(cs: CrossSection, r: number): CrossSection {
  if (r <= 0.01) return cs;
  return cs.offset(-r, "Round", 2, SEG).offset(r, "Round", 2, SEG);
}

/** Fills concave corners with a radius `r` fillet. */
export function roundConcave(cs: CrossSection, r: number): CrossSection {
  if (r <= 0.01) return cs;
  return cs.offset(r, "Round", 2, SEG).offset(-r, "Round", 2, SEG);
}

export function offset(cs: CrossSection, d: number): CrossSection {
  if (Math.abs(d) < 1e-6) return cs;
  return cs.offset(d, "Round", 2, SEG);
}

function regular(n: number, width: number, rotDeg: number): CrossSection {
  // Width measured across flats for even n, so the size reads as the key width.
  const apothem = width / 2;
  const R = apothem / Math.cos(Math.PI / n);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = ((rotDeg + (360 * i) / n) * Math.PI) / 180;
    pts.push([R * Math.cos(a), R * Math.sin(a)]);
  }
  return polygon(pts);
}

function heart(w: number): CrossSection {
  const pts: [number, number][] = [];
  for (let i = 0; i < 96; i++) {
    const t = (i / 96) * 2 * Math.PI;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([x, y]);
  }
  // The curve spans x ±16, y -17..+12. Scale to width and centre.
  const s = w / 32;
  return polygon(pts.map(([x, y]) => [x * s, (y + 2.5) * s]));
}

/** The plain footprint of a preset cap shape, `size` wide. */
export function capOutline(shape: CapShape, size: number, corner: number): CrossSection {
  const { CrossSection } = K();
  const s = size;
  let cs: CrossSection;
  switch (shape) {
    case "square":
    case "keycap":
      cs = CrossSection.square([s, s], true);
      break;
    case "capsule": {
      const h = s;
      const w = s * 1.5;
      cs = CrossSection.square([w - h, h], true).add(circle(h / 2, [-(w - h) / 2, 0])).add(circle(h / 2, [(w - h) / 2, 0]));
      return cs;
    }
    case "circle":
      return circle(s / 2);
    case "heart":
      return roundConvex(heart(s * 1.12), Math.min(corner, 1.5));
    case "cloud": {
      const r = s * 0.27;
      cs = CrossSection.union([
        circle(r, [-s * 0.27, -s * 0.06]),
        circle(r * 1.15, [0, s * 0.1]),
        circle(r, [s * 0.27, -s * 0.06]),
        CrossSection.square([s * 0.56, r * 1.6], true).translate([0, -s * 0.12]),
      ]);
      return roundConcave(cs, s * 0.06);
    }
    case "bear": {
      const r = s / 2;
      cs = CrossSection.union([circle(r * 0.9, [0, -s * 0.04]), circle(r * 0.34, [-r * 0.66, r * 0.66]), circle(r * 0.34, [r * 0.66, r * 0.66])]);
      return roundConcave(cs, s * 0.05);
    }
    case "cat": {
      const r = s / 2;
      const ear = (dir: number) =>
        polygon(
          dir > 0
            ? [[r * 0.18, r * 0.62], [r * 0.82, r * 0.25], [r * 0.82, r * 1.05]]
            : [[-r * 0.82, r * 0.25], [-r * 0.18, r * 0.62], [-r * 0.82, r * 1.05]],
        );
      cs = CrossSection.union([circle(r * 0.9, [0, -s * 0.05]), ear(1), ear(-1)]);
      return roundConcave(roundConvex(cs, 0.8), s * 0.04);
    }
    case "flower": {
      const petals = 6;
      const pr = s * 0.2;
      const parts = [circle(s * 0.28)];
      for (let i = 0; i < petals; i++) {
        const a = (i / petals) * 2 * Math.PI + Math.PI / 2;
        parts.push(circle(pr, [Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3]));
      }
      return roundConcave(CrossSection.union(parts), s * 0.03);
    }
    case "hexagon":
      cs = regular(6, s, 30);
      break;
    case "octagon":
      cs = regular(8, s, 22.5);
      break;
  }
  return roundConvex(cs, Math.min(corner, s / 2 - 0.5));
}

/** Smallest circle / hexagon that covers an outline, for Base shapes. */
export function coverWith(cs: CrossSection, shape: "circle" | "hexagon"): CrossSection {
  let r = 0;
  for (const poly of cs.toPolygons()) for (const [x, y] of poly) r = Math.max(r, Math.hypot(x, y));
  if (shape === "circle") return circle(r);
  return regular(6, 2 * r, 30).offset(0, "Round");
}

/**
 * The point deepest inside an outline (pole of inaccessibility), found by
 * shrinking it until almost nothing is left. The Switch goes here.
 */
export function deepestPoint(cs: CrossSection): [number, number] {
  const b = cs.bounds();
  let lo = 0, hi = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) / 2;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (cs.offset(-mid, "Round", 2, 32).isEmpty()) hi = mid;
    else lo = mid;
  }
  const core = cs.offset(-lo * 0.97, "Round", 2, 32).bounds();
  return [(core.min[0] + core.max[0]) / 2, (core.min[1] + core.max[1]) / 2];
}

/** The outline moved so its deepest point is at the origin (over the Switch). */
export function centredOnSwitch(cs: CrossSection): CrossSection {
  const [x, y] = deepestPoint(cs);
  return Math.hypot(x, y) < 0.05 ? cs : cs.translate([-x, -y]);
}
