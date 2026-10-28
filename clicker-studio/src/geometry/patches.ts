// A traced picture -> patches: each connected island of one colour, with the
// height the owner gave it (see design/heights.ts).
import type { LayerHeights } from "../design/types.ts";
import { pointInRings, signedArea } from "../design/heights.ts";
import type { CrossSection } from "./kernel.ts";
import { rings } from "./outline.ts";
import { mapRings, type Pt, type Ring } from "./path.ts";
import type { Traced } from "./decoration.ts";

/** Where a patch came from, carried on its Layer through fitting and building. */
export type PatchRef = { layer: number; at: [number, number]; pins: [number, number][]; depth: number };

export type Patch = PatchRef & {
  /** The island, in traced-image units with y up (as `flipY` gives). */
  cs: CrossSection;
  /** Its own or its colour's height; undefined = the default. */
  h?: number;
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
 * Splits a traced picture into patches and resolves each one's height.
 * With `outlineAsLayer`, a picture with no colour layers (one colour) is one
 * layer made of its outline.
 */
export function tracedPatches(t: Traced, heights?: LayerHeights, outlineAsLayer = false): Patch[] {
  const src = t.layers.length ? t.layers.map((l) => l.rings) : outlineAsLayer ? [t.outline] : [];
  const pins = heights?.pins ?? [];
  // Pins live in 0–1 picture units, y down; patches in pixels, y up.
  const pinPts: Pt[] = pins.map((p) => [p.at[0] * t.width, -p.at[1] * t.height]);
  const out: Patch[] = [];
  const outers: Ring[][] = [];
  src.forEach((rs, layer) => {
    if (!rs.length) return;
    for (const cs of rings(mapRings(rs, ([x, y]) => [x, -y]), "EvenOdd").decompose()) {
      const polys = cs.toPolygons() as Ring[];
      const p = interior(cs);
      if (!p) continue;
      const hits = pinPts.flatMap((q, i) => (pointInRings(polys, q) ? [i] : []));
      const own = hits.length ? pins[hits[hits.length - 1]].h : undefined;
      out.push({
        cs,
        layer,
        h: own ?? heights?.colour[layer] ?? undefined,
        at: [p[0] / t.width, -p[1] / t.height],
        pins: hits.map((i) => pins[i].at),
        depth: 0,
      });
      outers.push(polys.filter((r) => signedArea(r) > 0));
    }
  });
  // Depth: how many other patches' outer contours surround this one.
  out.forEach((p, i) => {
    const pt: Pt = [p.at[0] * t.width, -p.at[1] * t.height];
    p.depth = outers.filter((o, j) => j !== i && o.some((r) => pointInRings([r], pt))).length;
  });
  return out;
}

export function patchRef(p: Patch): PatchRef {
  return { layer: p.layer, at: p.at, pins: p.pins, depth: p.depth };
}
