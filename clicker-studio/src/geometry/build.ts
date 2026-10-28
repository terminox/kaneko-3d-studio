// Design -> solids. Produces the assembled preview and the print layout.
import type { Design, Key } from "../design/types.ts";
import type { Mesh } from "@mm/pipeline/mesh.ts";
import { K, type CrossSection, type Manifold } from "./kernel.ts";
import { capOutline, centredOnSwitch, offset, rings as ringsCs } from "./outline.ts";
import { buildCap, skirtExposed, type Solid } from "./cap.ts";
import { baseFootprint, baseLevels, buildBase, loopCentres, type BaseKey } from "./base.ts";
import { ringsBounds } from "./path.ts";
import { decorationLayers, fitLayers, flipY, outlineRings, type Assets, type Layer } from "./decoration.ts";
import { patchRef, tracedPatches } from "./patches.ts";
import { TALL, type PatchInfo } from "../design/heights.ts";
import { keyCells } from "./layout.ts";
import { buildChain, chainPitch } from "./chain.ts";
import { modelSpec } from "./model-cap.ts";

export type Part = { name: string; color: string; mesh: Mesh };
/** Parts that print as one piece (a cap with its inlays, or a Base). */
export type Group = { name: string; parts: Part[] };

export type BuildResult = {
  /** Assembled, at rest, plate frame. */
  assembled: Part[];
  /** Printable groups, each in its own local frame (not yet placed on a bed). */
  print: Group[];
  warnings: string[];
  /** Switch centres (plate frame), for the preview's switch ghosts. */
  switches: [number, number][];
  /** Keyring loop centres and the Base bottom z, for the preview's chain. */
  loops: [number, number][];
  bottom: number;
  /** Raised picture patches, for picking in the preview (assembled frame). */
  patches: PatchInfo[];
};

export function toMesh(m: Manifold): Mesh {
  const g = m.getMesh();
  const n = g.numProp;
  const count = g.vertProperties.length / n;
  const vertices = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    vertices[i * 3] = g.vertProperties[i * n];
    vertices[i * 3 + 1] = g.vertProperties[i * n + 1];
    vertices[i * 3 + 2] = g.vertProperties[i * n + 2];
  }
  return { vertices, triangles: new Uint32Array(g.triVerts) };
}

type CapSpec = { key: Key; outline: CrossSection; at: [number, number]; deco: Layer[]; label: string; extra?: Manifold };

/** Fits a key's Decoration into its cap's flat top. */
async function keyDeco(key: Key, outline: CrossSection, design: Design, assets: Assets): Promise<Layer[]> {
  const raw = await decorationLayers(key, assets);
  if (!raw.length) return [];
  const flat = offset(outline, -(design.cap.topRound + 0.4 + key.outline * design.cap.outlineWidth));
  const b = flat.bounds();
  const w = (b.max[0] - b.min[0]) * key.decoScale;
  const h = (b.max[1] - b.min[1]) * key.decoScale;
  return fitLayers(raw, w, h);
}

function keyRings(key: Key, deco: Layer[], design: Design): Layer[] {
  return outlineRings(deco, design.cap.outlineWidth, key.outline).map((cs, i) => ({ cs, color: key.outlineColors[i] }));
}

/** Picture Designs: the cap Outline and colour layers come from the traced image. */
function pictureSpec(design: Design, assets: Assets): { outline: CrossSection; deco: Layer[] } | null {
  const p = design.picture;
  const t = p && assets.traced[p.image];
  if (!p || !t) return null;
  // `width` is the width of the shape itself, not of the image around it.
  const ob = ringsBounds(t.outline);
  const s = p.width / (ob.w > 0 ? ob.w : t.width);
  const scale = (rs: typeof t.outline) => flipY(rs).map((r) => r.map(([x, y]) => [x * s, y * s] as [number, number]));
  let outline = ringsCs(scale(t.outline), "EvenOdd");
  // The Switch sits at the anchor (the widest point of the shape), else the centre.
  const b = outline.bounds();
  const c: [number, number] = t.anchor ? [-t.anchor[0] * s, t.anchor[1] * s] : [-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2];
  outline = outline.translate(c);
  // Smooth tiny notches so the skirt and Base wall stay printable.
  outline = offset(offset(outline, 0.6), -0.6);
  const deco = tracedPatches(t, p.heights).map((q) => ({
    cs: q.cs.scale(s).translate(c),
    color: p.palette[q.layer] ?? t.layers[q.layer].color,
    h: q.h,
    patch: patchRef(q),
  }));
  return { outline, deco };
}

export async function build(design: Design, assets: Assets): Promise<BuildResult> {
  const warnings: string[] = [];
  const { cap, base, fit } = design;
  const caps: CapSpec[] = [];
  let baseKeys: BaseKey[] = [];

  if (design.kind === "picture") {
    const ps = pictureSpec(design, assets);
    if (!ps) warnings.push("warn.noPicture");
    const outline = ps?.outline ?? capOutline("circle", 30, 0);
    const deco = ps?.deco ?? [];
    caps.push({ key: design.keys[0], outline, at: [0, 0], deco, label: "Top Cap" });
    baseKeys = [{ at: [0, 0], outline }];
  } else if (design.kind === "model") {
    const ms = modelSpec(design, warnings);
    const outline = ms?.outline ?? capOutline("circle", 26, 0);
    caps.push({ key: design.keys[0], outline, at: [0, 0], deco: [], label: "Top Cap", extra: ms?.model });
    baseKeys = [{ at: [0, 0], outline }];
  } else if (design.parts === "az-set") {
    const outline = centredOnSwitch(capOutline(cap.shape, cap.size, cap.corner));
    const proto = design.keys[0];
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      const key: Key = { ...proto, deco: { type: "text", text: letter, font: proto.deco.type === "text" ? proto.deco.font : "Fredoka-700" } };
      caps.push({ key, outline, at: [0, 0], deco: await keyDeco(key, outline, design, assets), label: `Keycap ${letter}` });
    }
  } else {
    const outline = centredOnSwitch(capOutline(cap.shape, cap.size, cap.corner));
    const keys = design.kind === "cap" ? design.keys.slice(0, 1) : design.keys;
    const b = outline.bounds();
    const unit: [number, number] =
      design.kind === "fluted"
        ? [chainPitch(outline, design), 0]
        : [b.max[0] - b.min[0] + 2 * fit.clearance + base.gap, b.max[1] - b.min[1] + 2 * fit.clearance + base.gap];
    const cells: [number, number][] =
      design.kind === "cap" ? [[0, 0]] : design.kind === "fluted" ? keys.map((_, i) => [i, 0]) : keyCells(design, keys.length);
    // Centre the layout.
    const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
    const mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2;
    for (let i = 0; i < keys.length; i++) {
      const cell = cells[i] ?? [i, 0];
      const at: [number, number] = [(cell[0] - mx) * unit[0], -(cell[1] - my) * unit[1]];
      caps.push({ key: keys[i], outline, at, deco: await keyDeco(keys[i], outline, design, assets), label: keys.length > 1 ? `Keycap ${i + 1}` : "Top Cap" });
    }
    baseKeys = caps.map((c) => ({ at: c.at, outline: c.outline }));
  }

  const assembled: Part[] = [];
  const print: Group[] = [];
  const wantCaps = design.parts !== "base";
  const wantBase = design.parts === "cap+base" || design.parts === "base";

  const patches: PatchInfo[] = [];
  if (wantCaps) {
    for (const [i, c] of caps.entries()) {
      const g = buildCap(c.outline, design.kind === "model" ? { ...cap, style: "raised" } : cap, fit, c.key.capColor, c.deco, keyRings(c.key, c.deco, design), c.label);
      // A 3D model stands on the cap top, fused into the cap.
      if (c.extra) g.solids[0].m = g.solids[0].m.add(c.extra.translate([0, 0, g.top - 0.2]));
      for (const s of g.solids) assembled.push(part(s, c.at));
      if (cap.style === "raised") patches.push(...capPatches(c, g.top, design.kind === "picture" ? -1 : i, Math.max(0.4, cap.decoHeight)));
      // Print: raised caps stand on their skirt; inlaid caps lie face down.
      const flip = cap.style === "inlay";
      print.push({ name: c.label, parts: g.solids.map((s) => ({ name: s.name, color: s.color, mesh: toMesh(flip ? s.m.rotate([180, 0, 0]) : s.m) })) });
    }
  }

  if (wantBase && design.parts !== "az-set") {
    if (design.kind === "fluted") {
      const chain = buildChain(baseKeys, design);
      chain.forEach((m, i) => {
        const color = caps[i]?.key.baseColor ?? design.baseColor;
        assembled.push(part({ name: `Base ${i + 1}`, color, m }, [0, 0]));
        print.push({ name: `Base ${i + 1}`, parts: [{ name: `Base ${i + 1}`, color, mesh: toMesh(m.translate([-baseKeys[i].at[0], -baseKeys[i].at[1], 0])) }] });
      });
    } else {
      const foot = baseFootprint(baseKeys, base, fit);
      const m = buildBase(baseKeys, base, fit, foot);
      assembled.push(part({ name: "Base", color: design.baseColor, m }, [0, 0]));
      print.push({ name: "Base", parts: [{ name: "Base", color: design.baseColor, mesh: toMesh(m) }] });
    }
  }

  const foot = baseKeys.length ? baseFootprint(baseKeys, base, fit) : null;
  if (foot && wantBase && design.kind !== "fluted") {
    const inner = foot.offset(-1, "Round");
    const room = K().CrossSection.union(baseKeys.map((k) => K().CrossSection.square([fit.clipRoom, fit.clipRoom], true).translate(k.at)));
    if (room.subtract(inner).area() > 0.01) warnings.push("warn.pocket");
  }
  const loops = foot && wantBase && design.kind !== "fluted" ? loopCentres(foot, base.loop, base.loopHole / 2) : [];
  if (patches.some((p) => p.h > TALL)) warnings.push("warn.tall");
  if (caps.length && wantCaps && wantBase && design.kind !== "model") {
    const rimTop = baseLevels(base, fit).wallTop;
    if (caps.some((c) => skirtExposed(c.outline, fit, rimTop))) warnings.push("warn.smallCap");
  }
  return { assembled, print, warnings, switches: wantBase || design.parts === "cap+base" ? baseKeys.map((k) => k.at) : [], loops, bottom: baseLevels(base, fit).bottom, patches };
}

/** A cap's raised picture patches, as the preview picks them (footprints not clipped to the flat top: close enough to click). */
function capPatches(c: CapSpec, top: number, owner: number, def: number): PatchInfo[] {
  const out: PatchInfo[] = [];
  for (const l of c.deco) {
    if (!l.patch) continue;
    const h = l.h ?? def;
    const rings = l.cs.translate(c.at).simplify(0.05).toPolygons() as [number, number][][];
    out.push({ owner, layer: l.patch.layer, at: l.patch.at, pins: l.patch.pins, depth: l.patch.depth, h, own: l.patch.pins.length > 0, top: top + h, rings });
  }
  return out;
}

function part(s: Solid, at: [number, number]): Part {
  return { name: s.name, color: s.color, mesh: toMesh(at[0] || at[1] ? s.m.translate([at[0], at[1], 0]) : s.m) };
}

export type Plate = {
  name: string;
  groups: Group[];
  /** Prime tower corner (bed mm) when the plate uses more than one colour. */
  tower?: [number, number];
};

/** Bed area kept free for the prime tower: top-right corner, with its brim. */
export const TOWER = { w: 44, d: 90 };

function bounds(g: Group) {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of g.parts) {
    const v = p.mesh.vertices;
    for (let i = 0; i < v.length; i += 3) {
      if (v[i] < minX) minX = v[i];
      if (v[i] > maxX) maxX = v[i];
      if (v[i + 1] < minY) minY = v[i + 1];
      if (v[i + 1] > maxY) maxY = v[i + 1];
      if (v[i + 2] < minZ) minZ = v[i + 2];
    }
  }
  return { minX, minY, minZ, w: maxX - minX, h: maxY - minY };
}

function moved(g: Group, dx: number, dy: number, dz: number): Group {
  return {
    name: g.name,
    parts: g.parts.map((p) => {
      const v = new Float32Array(p.mesh.vertices);
      for (let i = 0; i < v.length; i += 3) {
        v[i] += dx;
        v[i + 1] += dy;
        v[i + 2] += dz;
      }
      return { ...p, mesh: { vertices: v, triangles: p.mesh.triangles } };
    }),
  };
}

/**
 * Lays groups flat (min z = 0) on 256 mm beds in bed coordinates, in rows from
 * the front-left corner, `gap` mm apart. The top-right corner stays free for
 * the prime tower. Opens a new Plate when a bed is full.
 */
export function packPlates(groups: Group[], opts: { byColour?: boolean } = {}): Plate[] {
  if (opts.byColour) {
    // One-colour pieces go on plates of their own colour; multi-colour pieces share plates.
    const buckets = new Map<string, Group[]>();
    for (const g of groups) {
      const colours = new Set(g.parts.map((p) => p.color.toUpperCase()));
      const key = colours.size === 1 ? [...colours][0] : "mixed";
      buckets.set(key, [...(buckets.get(key) ?? []), g]);
    }
    const plates = [...buckets.values()].flatMap((gs) => packPlates(gs));
    return plates.map((p, i) => ({ ...p, name: `Plate ${i + 1}` }));
  }
  const bed = 256, gap = 6, margin = 8;
  const items = groups.map((g) => ({ g, b: bounds(g) })).sort((a, b) => b.b.h - a.b.h);
  const tower = { x0: bed - margin - TOWER.w, y0: bed - margin - TOWER.d };
  const hitsTower = (x: number, y: number, w: number, h: number) => x + w > tower.x0 - gap && y + h > tower.y0 - gap;
  const plates: { groups: Group[]; colours: Set<string> }[] = [];
  let cur: Group[] = [];
  let x = margin, y = margin, rowH = 0;
  const close = () => {
    if (cur.length) plates.push({ groups: cur, colours: new Set(cur.flatMap((g) => g.parts.map((p) => p.color.toUpperCase()))) });
    cur = [];
    x = margin;
    y = margin;
    rowH = 0;
  };
  for (const { g, b } of items) {
    if (b.w > bed - 2 * margin || b.h > bed - 2 * margin) throw new Error(`${g.name} is ${b.w.toFixed(0)} × ${b.h.toFixed(0)} mm, larger than the bed`);
    for (let tries = 0; ; tries++) {
      if (x > margin && x + b.w > bed - margin) {
        x = margin;
        y += rowH + gap;
        rowH = 0;
      }
      if (hitsTower(x, y, b.w, b.h) && x + b.w <= bed - margin) {
        // Skip past the tower corner: next row (the tower only blocks the right end of high rows).
        x = bed;
        continue;
      }
      if (y + b.h > bed - margin) {
        if (tries > 2 || !cur.length) throw new Error(`${g.name} does not fit on a plate`);
        close();
        continue;
      }
      break;
    }
    cur.push(moved(g, x - b.minX, y - b.minY, -b.minZ));
    x += b.w + gap;
    rowH = Math.max(rowH, b.h);
  }
  close();
  return plates.map((p, i) => ({
    name: `Plate ${i + 1}`,
    groups: p.groups,
    tower: p.colours.size > 1 ? ([tower.x0 + 4, tower.y0 + 4] as [number, number]) : undefined,
  }));
}

export { K };
