// Tag Design + one name -> a Name Tag: a plate that follows the picture and
// the name, with the artwork raised on top, one part per colour, and a keyring
// loop. Built flat on the bed (z = 0), face up. All sizes in mm.
import type { FontSource } from "@cs/text/shape.ts";
import { textRings } from "@cs/text/shape.ts";
import { K, type CrossSection, type Manifold } from "@cs/geometry/kernel.ts";
import { circle, offset, rings } from "@cs/geometry/outline.ts";
import { ringsBounds } from "@cs/geometry/path.ts";
import { outlineRings, type Layer, type Traced } from "@cs/geometry/decoration.ts";
import { slab } from "@cs/geometry/cap.ts";
import { mergeAreas, patchRef, tracedPatches } from "@cs/geometry/patches.ts";
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
  return new (K().CrossSection)(outer, "NonZero");
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

/** The keyring loop's centre, just outside the plate on the chosen side. */
function loopCentre(plate: CrossSection, design: TagDesign): [number, number] | null {
  const { side, offset: shift, hole } = design.loop;
  if (side === "none") return null;
  const b = plate.bounds();
  // Centre the hole just outside the plate, so the loop's wall overlaps it.
  const d = hole / 2 + 0.9;
  if (side === "top") {
    const x = Math.min(b.max[0] - 1, Math.max(b.min[0] + 1, (b.min[0] + b.max[0]) / 2 + shift));
    const y = edge(plate, "y", x, 1) ?? b.max[1];
    return [x, y + d];
  }
  const y = Math.min(b.max[1] - 1, Math.max(b.min[1] + 1, (b.min[1] + b.max[1]) / 2 + shift));
  const dir = side === "left" ? -1 : 1;
  const x = edge(plate, "x", y, dir) ?? (dir < 0 ? b.min[0] : b.max[0]);
  return [x + dir * d, y];
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
  const raised: Layer[] = [];
  let covered: CrossSection | null = null;
  for (const l of [...art, ...bands]) {
    const cs: CrossSection = covered ? l.cs.subtract(covered) : l.cs;
    covered = covered ? covered.add(l.cs) : l.cs;
    if (!cs.isEmpty()) raised.push({ ...l, cs });
  }

  let plate = plateOutline(covered!.simplify(0.05), design, warnings);
  const loop = loopCentre(plate, design);
  let hole: CrossSection | null = null;
  if (loop) {
    plate = plate.add(circle(design.loop.hole / 2 + design.loop.wall, loop));
    hole = circle(design.loop.hole / 2, loop);
    plate = plate.subtract(hole);
  }

  // One part per colour; artwork in the plate's colour fuses into the plate.
  // Picture patches stand at their own height (0 = inlaid flush); the name
  // and rings at the Raised height. Areas of one colour and height extrude together.
  const T = design.plate.thickness, relief = design.plate.relief;
  const levels = new Map<string, { color: string; byH: Map<number, Layer[]> }>();
  const patches: PatchInfo[] = [];
  for (const l of raised) {
    const cs = hole ? l.cs.subtract(hole) : l.cs;
    if (cs.isEmpty()) continue;
    const h = l.h ?? relief;
    const g = levels.get(l.color.toUpperCase()) ?? { color: l.color, byH: new Map() };
    g.byH.set(h, [...(g.byH.get(h) ?? []), { ...l, cs }]);
    levels.set(l.color.toUpperCase(), g);
    if (l.patch) {
      const { layer, at, pins, paints, depth } = l.patch;
      patches.push({ owner: -1, layer, at, pins, depth, h, own: pins.length > 0, color: l.color, paints, painted: paints.length > 0, top: T + h, rings: cs.simplify(0.05).toPolygons() as [number, number][][] });
    }
  }
  const byColour = new Map<string, Manifold[]>();
  const put = (color: string, m: Manifold) => byColour.set(color.toUpperCase(), [...(byColour.get(color.toUpperCase()) ?? []), m]);
  const flush: CrossSection[] = [];
  byColour.set(design.colours.plate.toUpperCase(), []);
  for (const g of levels.values())
    for (const [h, ls] of g.byH) {
      const cs = mergeAreas(ls);
      if (h > 0) put(g.color, slab(cs, T, T + h));
      else {
        flush.push(cs);
        put(g.color, slab(cs, T - FLUSH_DEPTH, T));
      }
    }
  const base = slab(plate, 0, T);
  byColour.get(design.colours.plate.toUpperCase())!.unshift(flush.length ? base.subtract(slab(CrossSection.union(flush), T - FLUSH_DEPTH, T + 1)) : base);
  if (byColour.size > 4) warnings.push("warn.over4");
  if (patches.some((p) => p.h > TALL)) warnings.push("warn.tall");

  const label = name.trim() || "Tag";
  const parts = [...byColour].map(([color, ms], i) => ({
    name: i === 0 ? `${label} plate` : `${label} ${color}`,
    color,
    mesh: toMesh(ms.length > 1 ? K().Manifold.union(ms) : ms[0]),
  }));
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
