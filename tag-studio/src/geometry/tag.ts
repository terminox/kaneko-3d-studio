// Tag Design + one name -> a Name Tag: a plate that follows the picture and
// the name, with the artwork raised on top, one part per colour, and a keyring
// loop. With one layer the artwork is a flat cut-out instead: every colour
// runs from the bed to the full thickness, and the plate colour is left as the
// border frame, the joins and the loop. Built flat on the bed (z = 0), face up.
// All sizes in mm.
import type { FontSource } from "@cs/text/shape.ts";
import { textRings } from "@cs/text/shape.ts";
import { K, type CrossSection, type Manifold } from "@cs/geometry/kernel.ts";
import { circle, offset, rings } from "@cs/geometry/outline.ts";
import { ringsBounds } from "@cs/geometry/path.ts";
import { outlineRings, type Layer, type Traced } from "@cs/geometry/decoration.ts";
import { slab } from "@cs/geometry/cap.ts";
import { mergeAreas, patchRef, tracedPatches, type PatchRef } from "@cs/geometry/patches.ts";
import { FLUSH_DEPTH, TALL, type PatchInfo } from "@cs/design/heights.ts";
import { packPlates, toMesh, type Group, type Plate } from "@cs/geometry/build.ts";
import { tagNames, type TagDesign } from "../design/types.ts";

export type TagAssets = { font: FontSource; traced: Record<string, Traced> };

export type TagResult = {
  group: Group;
  /** Keyring loop centre, when there is a loop. */
  loop: [number, number] | null;
  warnings: string[];
  /** The picture's patches, for picking in the preview (tag frame). */
  patches: PatchInfo[];
};

/** The picture's patches, `width` wide and centred on the origin, each with its own height (if set). */
function pictureLayers(design: TagDesign, traced: Record<string, Traced>): Layer[] {
  const p = design.picture;
  const t = p.image ? traced[p.image] : undefined;
  if (!t || !t.outline.length) return [];
  // `width` is the width of the shape itself, not of the image around it.
  const ob = ringsBounds(t.outline);
  const s = p.width / (ob.w > 0 ? ob.w : t.width);
  // One colour: the tracer gives no layers, the outline is the whole picture.
  const layers: Layer[] = tracedPatches(t, p.heights, true).map((q) => ({
    cs: q.cs.scale(s),
    color: q.color ?? p.palette[q.layer] ?? t.layers[q.layer]?.color ?? "#1E1E1E",
    h: q.h,
    patch: patchRef(q),
  }));
  if (!layers.length) return [];
  const b = K().CrossSection.union(layers.map((l) => l.cs)).bounds();
  const c: [number, number] = [-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2];
  return layers.map((l) => ({ ...l, cs: l.cs.translate(c) })).filter((l) => !l.cs.isEmpty());
}

/** The name, shaped and thickened, centred on the origin. */
async function nameSection(design: TagDesign, name: string, font: FontSource): Promise<CrossSection | null> {
  if (!name.trim()) return null;
  const rs = await textRings(font, design.font, name, design.textSize, 1.15, design.spacing);
  let cs = rings(rs, "NonZero");
  const grow = (design.weight - 1) * design.textSize * 0.06;
  if (Math.abs(grow) > 0.01) cs = cs.offset(grow, "Round", 2, 32);
  if (cs.isEmpty()) return null;
  const b = cs.bounds();
  return cs.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]);
}

/** Moves the name next to the picture's bounding box. */
function placeName(nameCs: CrossSection, picture: CrossSection | null, design: TagDesign): CrossSection {
  if (!picture) return nameCs;
  const p = picture.bounds(), n = nameCs.bounds();
  const nw = n.max[0] - n.min[0], nh = n.max[1] - n.min[1];
  const pcx = (p.min[0] + p.max[0]) / 2, pcy = (p.min[1] + p.max[1]) / 2;
  const g = design.gap;
  switch (design.position) {
    case "below":
      return nameCs.translate([pcx, p.min[1] - g - nh / 2]);
    case "above":
      return nameCs.translate([pcx, p.max[1] + g + nh / 2]);
    case "left":
      return nameCs.translate([p.min[0] - g - nw / 2, pcy]);
    case "right":
      return nameCs.translate([p.max[0] + g + nw / 2, pcy]);
  }
}

type Box = ReturnType<CrossSection["bounds"]>;
/** True when the two bounding boxes touch or overlap. */
const overlaps = (a: Box, b: Box) => a.min[0] <= b.max[0] && b.min[0] <= a.max[0] && a.min[1] <= b.max[1] && b.min[1] <= a.max[1];

/** Keeps only the outer contours, so every hole is filled. */
function fillHoles(cs: CrossSection): CrossSection {
  const outer = cs.toPolygons().filter((poly) => {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
      a += x0 * y1 - x1 * y0;
    }
    return a > 0;
  });
  return K().CrossSection.ofPolygons(outer, "NonZero");
}

/**
 * The plate: the artwork grown by `border`, closed until it is one piece (so
 * a name set apart from the picture still hangs on the same tag).
 */
function plateOutline(art: CrossSection, design: TagDesign, warnings: string[]): CrossSection {
  const grown = offset(art, design.plate.border);
  let plate = grown;
  for (let r = 1; r <= 32; r *= 2) {
    plate = offset(offset(grown, r), -r).add(grown);
    if (plate.decompose().length <= 1) break;
  }
  if (plate.decompose().length > 1) {
    warnings.push("warn.apart");
    plate = plate.add(plate.hull());
  }
  return design.plate.fillHoles ? fillHoles(plate) : plate;
}

/**
 * Drops the slivers of `cs` (anything thinner than 0.2 mm that stands on its
 * own) and keeps the rest exactly. The flat frame is the plate minus the
 * artwork: the plate comes from a simplified outline and neighbouring traced
 * colours leave hairline gaps, so thousands of slivers line the edges. The
 * opening finds the thick parts; whatever lies within 0.3 mm of them survives
 * untouched, so the frame still shares its boundary with the artwork.
 * (Decomposing the pieces instead overflows the kernel's stack past a couple
 * of thousand contours.)
 */
function withoutSlivers(cs: CrossSection): CrossSection {
  const thick = offset(offset(cs, -0.1), 0.1);
  if (thick.isEmpty()) return thick;
  return cs.intersect(offset(thick, 0.3));
}

/** Where a probe line across `cs` leaves it on one side; null when it misses. */
function edge(cs: CrossSection, along: "x" | "y", at: number, dir: 1 | -1): number | null {
  const b = cs.bounds();
  const probe =
    along === "x"
      ? K().CrossSection.square([b.max[0] - b.min[0] + 2, 0.5], true).translate([(b.min[0] + b.max[0]) / 2, at])
      : K().CrossSection.square([0.5, b.max[1] - b.min[1] + 2], true).translate([at, (b.min[1] + b.max[1]) / 2]);
  const hit = cs.intersect(probe);
  if (hit.isEmpty()) return null;
  const hb = hit.bounds();
  const i = along === "x" ? 0 : 1;
  return dir > 0 ? hb.max[i] : hb.min[i];
}

/**
 * Like `edge`, but when the probe misses (a gap between letters, a concave
 * shape) it looks at the columns within 12 mm and takes the one whose edge
 * reaches furthest out, with a small penalty for distance. So the loop lands
 * on the top of the B, not in the notch between its bowls or over the gap.
 */
function edgeNear(cs: CrossSection, along: "x" | "y", at: number, dir: 1 | -1, lo: number, hi: number): { at: number; edge: number } | null {
  const direct = edge(cs, along, at, dir);
  if (direct !== null) return { at, edge: direct };
  let best: { at: number; edge: number; score: number } | null = null;
  for (let step = 0.5; step <= 12; step += 0.5)
    for (const a of [at - step, at + step]) {
      if (a < lo || a > hi) continue;
      const e = edge(cs, along, a, dir);
      if (e === null) continue;
      const score = dir * e - 0.25 * step;
      if (!best || score > best.score) best = { at: a, edge: e, score };
    }
  return best;
}

/** The keyring loop's centre, just outside `shape` on the chosen side, so the loop's wall overlaps it. */
function loopCentre(shape: CrossSection, design: TagDesign): [number, number] | null {
  const { side, offset: shift, hole } = design.loop;
  if (side === "none") return null;
  const b = shape.bounds();
  const d = hole / 2 + 0.9;
  if (side === "top") {
    const x = Math.min(b.max[0] - 1, Math.max(b.min[0] + 1, (b.min[0] + b.max[0]) / 2 + shift));
    const hit = edgeNear(shape, "y", x, 1, b.min[0] + 1, b.max[0] - 1);
    return hit ? [hit.at, hit.edge + d] : [x, b.max[1] + d];
  }
  const y = Math.min(b.max[1] - 1, Math.max(b.min[1] + 1, (b.min[1] + b.max[1]) / 2 + shift));
  const dir = side === "left" ? -1 : 1;
  const hit = edgeNear(shape, "x", y, dir, b.min[1] + 1, b.max[1] - 1);
  return hit ? [hit.edge + dir * d, hit.at] : [(dir < 0 ? b.min[0] : b.max[0]) + dir * d, y];
}

/**
 * A keyring loop that grips the artwork directly (one layer, no border): the
 * ring plus the hull of the ring and the artwork within 1.5 mm of it, which
 * fills the gap between them into a solid tab even where the edge is a thin
 * spike. The hole is cut out; the artwork keeps its own colour.
 */
function loopTab(art: CrossSection, at: [number, number], design: TagDesign): CrossSection {
  const R = design.loop.hole / 2 + design.loop.wall;
  const ring = circle(R, at);
  const near = art.intersect(circle(R + 1.5, at));
  return ring.add(near).hull().subtract(circle(design.loop.hole / 2, at));
}

/** Builds one Name Tag for `name` ("" = picture only). */
export async function buildTag(design: TagDesign, name: string, assets: TagAssets): Promise<TagResult> {
  const { CrossSection } = K();
  const warnings: string[] = [];
  const pic = pictureLayers(design, assets.traced);
  const picAll = pic.length ? CrossSection.union(pic.map((l) => l.cs)) : null;
  const nameRaw = await nameSection(design, name, assets.font);
  const nameCs = nameRaw ? placeName(nameRaw, picAll, design) : null;

  // Artwork layers, name first: each later layer loses what earlier ones cover.
  const art: Layer[] = [];
  if (nameCs) art.push({ cs: nameCs, color: design.colours.name });
  art.push(...pic);
  if (!art.length) {
    warnings.push("warn.empty");
    art.push({ cs: circle(15), color: design.colours.plate });
  }
  // Offsets are measured from a simplified outline: round joins on every
  // traced vertex would multiply the vertex count (and the build time).
  const outline = CrossSection.union(art.map((l) => l.cs)).simplify(0.05);
  const bands = outlineRings([{ cs: outline, color: "" }], design.rings.width, design.rings.count).map((cs, i) => ({ cs, color: design.rings.colors[i] }));
  // Each colour is traced on its own, so neighbouring patches of different
  // layers overlap by hairlines along shared edges: the name wins, then the
  // earlier layers. The cut is made per colour group (`groupArea`), a few
  // booleans in all, not one per patch against everything before it, which
  // made a photo's build quadratic. `coveredBefore` is what lies over each
  // traced layer: the name and the layers before it.
  const coveredBefore = new Map<number, CrossSection | null>();
  {
    const byLayer = new Map<number, CrossSection[]>();
    for (const l of art) if (l.patch) byLayer.set(l.patch.layer, [...(byLayer.get(l.patch.layer) ?? []), l.cs]);
    let cov: CrossSection | null = nameCs;
    for (const L of [...byLayer.keys()].sort((x, y) => x - y)) {
      coveredBefore.set(L, cov);
      const u = CrossSection.union(byLayer.get(L)!);
      cov = cov ? cov.add(u) : u;
    }
  }
  const raised: Layer[] = [...art];
  // The rings follow the simplified outline, so they are cut by the exact artwork.
  const artAll = CrossSection.union(art.map((l) => l.cs));
  for (const l of bands) {
    const cs = l.cs.subtract(artAll);
    if (!cs.isEmpty()) raised.push({ ...l, cs });
  }
  const covered = bands.length ? artAll.add(CrossSection.union(bands.map((l) => l.cs))) : artAll;

  // One layer with no border: no plate at all. The loop grips the artwork,
  // and whatever doesn't touch is a loose piece (warned, not joined).
  const flat = design.plate.layers === 1, bare = flat && design.plate.border === 0;
  let plate: CrossSection, loop: [number, number] | null, hole: CrossSection | null = null;
  if (bare) {
    loop = loopCentre(covered, design);
    plate = loop ? loopTab(covered, loop, design) : covered.subtract(covered);
    if (loop) hole = circle(design.loop.hole / 2, loop);
    if (covered.add(plate).decompose().length > 1) warnings.push("warn.pieces");
  } else {
    plate = plateOutline(covered.simplify(0.05), design, warnings);
    loop = loopCentre(plate, design);
    if (loop) {
      plate = plate.add(circle(design.loop.hole / 2 + design.loop.wall, loop));
      hole = circle(design.loop.hole / 2, loop);
      plate = plate.subtract(hole);
    }
  }

  /** A colour group's area: its members merged, each traced layer cut by what lies over it, the loop hole taken out. */
  const groupArea = (ls: Layer[]): CrossSection => {
    const layers = [...new Set(ls.flatMap((l) => (l.patch ? [l.patch.layer] : [])))];
    const parts: { cs: CrossSection; patch?: PatchRef }[] = ls.filter((l) => !l.patch).map((l) => ({ cs: l.cs }));
    for (const L of layers) {
      const own = ls.filter((l) => l.patch?.layer === L);
      const u = own.length > 1 ? CrossSection.union(own.map((l) => l.cs)) : own[0].cs;
      const cov = coveredBefore.get(L);
      parts.push({ cs: cov ? u.subtract(cov) : u, patch: own[0].patch });
    }
    const area = mergeAreas(parts);
    return hole ? area.subtract(hole) : area;
  };

  // One part per colour; artwork in the plate's colour fuses into the plate.
  // Two layers: picture patches stand at their own height (0 = inlaid flush),
  // the name and rings at the Raised height. One layer: everything runs from
  // the bed to T, and the plate colour fills only what the artwork leaves.
  // Areas of one colour and height extrude together.
  const T = design.plate.thickness, relief = design.plate.relief;
  const levels = new Map<string, { color: string; byH: Map<number, Layer[]> }>();
  const patches: PatchInfo[] = [];
  const nameB = nameCs?.bounds();
  for (const l of raised) {
    const h = flat ? 0 : (l.h ?? relief);
    const g = levels.get(l.color.toUpperCase()) ?? { color: l.color, byH: new Map() };
    g.byH.set(h, [...(g.byH.get(h) ?? []), l]);
    levels.set(l.color.toUpperCase(), g);
    if (l.patch) {
      // A patch wholly under the name can't be seen or picked.
      if (nameCs && nameB && overlaps(l.cs.bounds(), nameB) && l.cs.subtract(nameCs).isEmpty()) continue;
      const { layer, at, pins, paints, depth } = l.patch;
      patches.push({ owner: -1, layer, at, pins, depth, h, own: pins.length > 0, color: l.color, paints, painted: paints.length > 0, top: T + h, rings: l.cs.simplify(0.05).toPolygons() as [number, number][][] });
    }
  }
  const byColour = new Map<string, Manifold[]>();
  const put = (color: string, m: Manifold) => byColour.set(color.toUpperCase(), [...(byColour.get(color.toUpperCase()) ?? []), m]);
  const flush: CrossSection[] = [];
  const cut: CrossSection[] = [];
  byColour.set(design.colours.plate.toUpperCase(), []);
  for (const g of levels.values())
    for (const [h, ls] of g.byH) {
      const cs = groupArea(ls);
      if (cs.isEmpty()) continue;
      if (flat) {
        cut.push(cs);
        put(g.color, slab(cs, 0, T));
      } else if (h > 0) put(g.color, slab(cs, T, T + h));
      else {
        flush.push(cs);
        put(g.color, slab(cs, T - FLUSH_DEPTH, T));
      }
    }
  const base = flat
    ? slab(withoutSlivers(cut.length ? plate.subtract(CrossSection.union(cut)) : plate), 0, T)
    : flush.length
      ? slab(plate, 0, T).subtract(slab(CrossSection.union(flush), T - FLUSH_DEPTH, T + 1))
      : slab(plate, 0, T);
  byColour.get(design.colours.plate.toUpperCase())!.unshift(base);
  if (patches.some((p) => p.h > TALL)) warnings.push("warn.tall");

  // A flat tag with no border and no loop has no plate colour at all.
  const label = name.trim() || "Tag";
  const parts: Group["parts"] = [];
  for (const [i, [color, ms]] of [...byColour].entries()) {
    const m = ms.length > 1 ? K().Manifold.union(ms) : ms[0];
    if (m.isEmpty()) continue;
    parts.push({ name: i === 0 ? `${label} plate` : `${label} ${color}`, color, mesh: toMesh(m) });
  }
  if (parts.length > 4) warnings.push("warn.over4");
  return { group: { name: label, parts }, loop, warnings, patches };
}

/** Every name's tag, packed onto A1 plates with the prime-tower corner kept free. */
export async function buildAll(design: TagDesign, assets: TagAssets): Promise<{ plates: Plate[]; warnings: string[]; tags: number }> {
  const groups: Group[] = [];
  const warnings = new Set<string>();
  const names = tagNames(design);
  for (const [i, name] of names.entries()) {
    const r = await buildTag(design, name, assets);
    r.warnings.forEach((w) => warnings.add(w));
    groups.push({ ...r.group, name: names.length > 1 ? `${i + 1}. ${r.group.name}` : r.group.name });
  }
  return { plates: packPlates(groups), warnings: [...warnings], tags: groups.length };
}
