// A traced picture -> patches: each connected island of one colour, with the
// height and filament the owner gave it (see design/heights.ts).
import type { LayerHeights } from "../design/types.ts";
import { pointInRings, signedArea } from "../design/heights.ts";
import { K, type CrossSection } from "./kernel.ts";
import { offset, rings } from "./outline.ts";
import { mapRings, type Pt, type Ring } from "./path.ts";
import type { Traced } from "./decoration.ts";

/** Where a patch came from, carried on its Layer through fitting and building. */
export type PatchRef = { layer: number; at: [number, number]; pins: [number, number][]; paints: [number, number][]; depth: number };

export type Patch = PatchRef & {
  /** The island, in traced-image units with y up (as `flipY` gives). */
  cs: CrossSection;
  /** Its own or its colour's height; undefined = the default. */
  h?: number;
  /** Its own filament; undefined = its colour's. */
  color?: string;
};

/** A point well inside `cs`: the middle of what is left after shrinking it. */
function interior(cs: CrossSection): Pt | null {
  const b = cs.bounds();
  let d = Math.min(b.max[0] - b.min[0], b.max[1] - b.min[1]) / 4;
  for (let i = 0; i < 6 && d > 0.02; i++, d /= 2) {
    const core = cs.offset(-d, "Square");
    if (core.isEmpty()) continue;
    const cb = core.bounds();
    const c: Pt = [(cb.min[0] + cb.max[0]) / 2, (cb.min[1] + cb.max[1]) / 2];
    const polys = core.toPolygons() as Ring[];
    return pointInRings(polys, c) ? c : polys[0][0];
  }
  return null;
}

/**
 * Each colour layer's area and the whole picture's, in traced units with y up.
 * Vector art resolves its paint order: a shape keeps only what no later shape
 * covers, and the viewBox clips everything, as the SVG draws it.
 */
export function tracedAreas(t: Traced): { layers: CrossSection[]; outline: CrossSection } {
  const flip = (rs: Ring[]) => mapRings(rs, ([x, y]) => [x, -y]);
  if (!t.shapes) return { layers: t.layers.map((l) => rings(flip(l.rings), "EvenOdd")), outline: rings(flip(t.outline), "EvenOdd") };
  const { CrossSection } = K();
  const box = CrossSection.square([t.width, t.height]).translate([0, -t.height]);
  const seen: CrossSection[][] = t.layers.map(() => []);
  let above: CrossSection | undefined;
  for (let i = t.shapes.length - 1; i >= 0; i--) {
    const s = t.shapes[i];
    const cs = rings(flip(s.rings), s.evenOdd ? "EvenOdd" : "NonZero");
    seen[s.layer]?.push(above ? cs.subtract(above) : cs);
    above = above ? above.add(cs) : cs;
  }
  return {
    layers: seen.map((cs) => CrossSection.union(cs).intersect(box)),
    outline: above ? above.intersect(box) : CrossSection.union([]),
  };
}

/**
 * Splits a traced picture into patches and resolves each one's height.
 * With `outlineAsLayer`, a picture with no colour layers (one colour) is one
 * layer made of its outline.
 */
export function tracedPatches(t: Traced, heights?: LayerHeights, outlineAsLayer = false): Patch[] {
  const areas = t.layers.length || outlineAsLayer ? tracedAreas(t) : null;
  const src = !areas ? [] : t.layers.length ? areas.layers : [areas.outline];
  const pins = heights?.pins ?? [];
  // Pins live in 0–1 picture units, y down; patches in pixels, y up.
  const toPixels = ([x, y]: [number, number]): Pt => [x * t.width, -y * t.height];
  const pinPts = pins.map((p) => toPixels(p.at));
  const paints = heights?.paints ?? [];
  const paintPts = paints.map((p) => toPixels(p.at));
  const out: Patch[] = [];
  const outers: Ring[][] = [];
  src.forEach((area, layer) => {
    for (const cs of area.decompose()) {
      const polys = cs.toPolygons() as Ring[];
      const p = interior(cs);
      if (!p) continue;
      const hits = pinPts.flatMap((q, i) => (pointInRings(polys, q) ? [i] : []));
      const own = hits.length ? pins[hits[hits.length - 1]].h : undefined;
      const painted = paintPts.flatMap((q, i) => (pointInRings(polys, q) ? [i] : []));
      out.push({
        cs,
        layer,
        h: own ?? heights?.colour[layer] ?? undefined,
        color: painted.length ? paints[painted[painted.length - 1]].color : undefined,
        at: [p[0] / t.width, -p[1] / t.height],
        pins: hits.map((i) => pins[i].at),
        paints: painted.map((i) => paints[i].at),
        depth: 0,
      });
      outers.push(polys.filter((r) => signedArea(r) > 0));
    }
  });
  // Depth: how many other patches' outer contours surround this one.
  out.forEach((p, i) => {
    const pt = toPixels(p.at);
    p.depth = outers.filter((o, j) => j !== i && o.some((r) => pointInRings([r], pt))).length;
  });
  return out;
}

/** Gaps narrower than twice this close when traced colours merge, mm. */
const HAIRLINE = 0.08;

/**
 * The union of areas printed as one. The tracer fits each colour on its own,
 * leaving hairlines between neighbours: harmless between two filaments, but
 * the cap would show through where two traced colours became one filament.
 */
export function mergeAreas(areas: { cs: CrossSection; patch?: PatchRef }[]): CrossSection {
  if (areas.length === 1) return areas[0].cs;
  const all = K().CrossSection.union(areas.map((a) => a.cs));
  const traced = new Set(areas.flatMap((a) => (a.patch ? [a.patch.layer] : [])));
  return traced.size > 1 ? offset(offset(all, HAIRLINE), -HAIRLINE) : all;
}

export function patchRef(p: Patch): PatchRef {
  return { layer: p.layer, at: p.at, pins: p.pins, paints: p.paints, depth: p.depth };
}
