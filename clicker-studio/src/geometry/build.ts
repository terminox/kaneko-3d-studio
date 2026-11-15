// Design -> solids. Produces the assembled preview and the print layout.
import type { Design, Key } from "../design/types.ts";
import type { Mesh } from "@mm/pipeline/mesh.ts";
import { K, type CrossSection, type Manifold } from "./kernel.ts";
import { capOutline, centredOnSwitch, offset, rings as ringsCs } from "./outline.ts";
import { buildCap, skirtExposed, type Solid } from "./cap.ts";
import { baseFootprint, baseJoints, baseLevels, baseSupports, buildBase, connectorSides, keySwitches, loopCentres, type BaseKey } from "./base.ts";
import { H, holeCentre, shortTongue, sideDir, switchClash, type Joint } from "./connector.ts";
import { placeSwitches } from "./switches.ts";
import { ringsBounds } from "./path.ts";
import { decorationLayers, fitLayers, flipY, outlineRings, type Assets, type Layer } from "./decoration.ts";
import { patchRef, tracedPatches } from "./patches.ts";
import { TALL, type PatchInfo } from "../design/heights.ts";
import { keyCells } from "./layout.ts";
import { buildChain, chainPitch } from "./chain.ts";
import { modelSpec } from "./model-cap.ts";
import { splitModel, type SplitInfo } from "./split.ts";

/**
 * `role` "support": a slicer support-enforcer volume, not printed and not shown.
 * `half` "top": a part the preview's Apart view lifts (caps, a split model's top half). Assembled parts only.
 */
export type Part = { name: string; color: string; mesh: Mesh; role?: "support"; half?: "top" };

/** Where the preview's keychain hangs: a loop or a tab hole, the way it leaves the Base (unit vector), and its height. */
export type Keyring = { at: [number, number]; dir: [number, number]; z: number };
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
  /** Switches under each shared cap (1 for every other kind). */
  switchesPerCap: number;
  /** Where the preview's chain hangs (a keyring loop, else a free tab hole), and the Base bottom z. */
  keyring: Keyring | null;
  bottom: number;
  /** Picture patches, for picking in the preview (assembled frame). */
  patches: PatchInfo[];
  /** Split a model: the seam and size, for the Split card and taps on the preview. */
  split?: SplitInfo;
};

/** A picture border narrower than this (two 0.4 mm print lines) does not print cleanly. */
export const THIN_BORDER = 0.8;

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

/** `inset`: how far the Decoration stays in from the outline (default: the flat top). `switches`: stem centres, cap-local. */
type CapSpec = { key: Key; outline: CrossSection; at: [number, number]; deco: Layer[]; label: string; extra?: Manifold; inset?: number; switches?: [number, number][] };

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

/**
 * Picture Designs: the cap Outline and colour layers come from the traced
 * image. The picture is `width` wide; the cap border is added around it, so
 * the cap (and the Base with it) grows and the picture is never cut into.
 */
function pictureSpec(design: Design, assets: Assets): { outline: CrossSection; deco: Layer[] } | null {
  const p = design.picture;
  const t = p && assets.traced[p.image];
  if (!p || !t) return null;
  // `width` is the width of the shape itself, not of the image around it.
  const ob = ringsBounds(t.outline);
  const s = p.width / (ob.w > 0 ? ob.w : t.width);
  const scale = (rs: typeof t.outline) => flipY(rs).map((r) => r.map(([x, y]) => [x * s, y * s] as [number, number]));
  let art = ringsCs(scale(t.outline), "EvenOdd");
  // The Switch sits at the anchor (the widest point of the shape), else the centre.
  const b = art.bounds();
  const c: [number, number] = t.anchor ? [-t.anchor[0] * s, t.anchor[1] * s] : [-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2];
  art = art.translate(c);
  // Grow by the border, then smooth tiny notches so the skirt and Base wall stay printable.
  const outline = offset(offset(art, Math.max(0, design.cap.border) + 0.6), -0.6);
  const deco = tracedPatches(t, p.heights).map((q) => ({
    cs: q.cs.scale(s).translate(c),
    color: q.color ?? p.palette[q.layer] ?? t.layers[q.layer].color,
    h: q.h,
    patch: patchRef(q),
  }));
  return { outline, deco };
}

export async function build(design: Design, assets: Assets): Promise<BuildResult> {
  if (design.kind === "split") return buildSplit(design, assets);
  const warnings: string[] = [];
  const { cap, base, fit } = design;
  const caps: CapSpec[] = [];
  let baseKeys: BaseKey[] = [];

  /** One shared cap at the origin, on as many Switches as its size needs (or as the owner forced). */
  const shared = (outline: CrossSection, spec: Omit<CapSpec, "outline" | "at" | "switches">) => {
    const foot = baseFootprint([{ at: [0, 0], outline }], base, fit);
    const placed = placeSwitches(outline, foot, fit, baseLevels(base, fit).wallTop, cap.switches);
    warnings.push(...placed.warnings);
    caps.push({ ...spec, outline, at: [0, 0], switches: placed.at });
    baseKeys = [{ at: [0, 0], outline, switches: placed.at }];
  };

  if (design.kind === "picture") {
    const ps = pictureSpec(design, assets);
    if (!ps) warnings.push("warn.noPicture");
    const outline = ps?.outline ?? capOutline("circle", 30, 0);
    const deco = ps?.deco ?? [];
    // The border already surrounds the picture, so the inset only trims what the outward offset smoothed.
    shared(outline, { key: design.keys[0], deco, label: "Top Cap", inset: cap.border });
    if (cap.border > 0 && cap.border < THIN_BORDER) warnings.push("warn.thinBorder");
  } else if (design.kind === "model") {
    const ms = modelSpec(design, warnings, assets.memo);
    const outline = ms?.outline ?? capOutline("circle", 26, 0);
    shared(outline, { key: design.keys[0], deco: [], label: "Top Cap", extra: ms?.model });
  } else if (design.kind === "cap") {
    const outline = centredOnSwitch(capOutline(cap.shape, cap.size, cap.corner));
    const key = design.keys[0];
    shared(outline, { key, deco: await keyDeco(key, outline, design, assets), label: "Top Cap" });
  } else if (design.parts === "az-set") {
    const outline = centredOnSwitch(capOutline(cap.shape, cap.size, cap.corner));
    const proto = design.keys[0];
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      const key: Key = { ...proto, deco: { type: "text", text: letter, font: proto.deco.type === "text" ? proto.deco.font : "Fredoka-700" } };
      caps.push({ key, outline, at: [0, 0], deco: await keyDeco(key, outline, design, assets), label: `Keycap ${letter}` });
    }
  } else {
    // Row, grid and fluted: one Switch under each key.
    const outline = centredOnSwitch(capOutline(cap.shape, cap.size, cap.corner));
    const keys = design.keys;
    const b = outline.bounds();
    const unit: [number, number] =
      design.kind === "fluted"
        ? [chainPitch(outline, design), 0]
        : [b.max[0] - b.min[0] + 2 * fit.clearance + base.gap, b.max[1] - b.min[1] + 2 * fit.clearance + base.gap];
    const cells: [number, number][] = design.kind === "fluted" ? keys.map((_, i) => [i, 0]) : keyCells(design, keys.length);
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
  const { bottom } = baseLevels(base, fit);
  const joints: Joint[] = [];

  const patches: PatchInfo[] = [];
  if (wantCaps) {
    for (const [i, c] of caps.entries()) {
      const g = buildCap(c.outline, design.kind === "model" ? { ...cap, style: "raised" } : cap, fit, c.key.capColor, c.deco, keyRings(c.key, c.deco, design), c.label, undefined, c.inset, c.switches);
      // A 3D model stands on the cap top, fused into the cap.
      if (c.extra) g.solids[0].m = g.solids[0].m.add(c.extra.translate([0, 0, g.top - 0.2]));
      for (const s of g.solids) assembled.push(part(s, c.at, "top"));
      patches.push(...capPatches(c, g.top, design.kind === "picture" ? -1 : i, Math.max(0.4, cap.decoHeight), cap.style === "inlay"));
      // Print: raised caps stand on their skirt; inlaid caps lie face down.
      const flip = cap.style === "inlay";
      print.push({ name: c.label, parts: g.solids.map((s) => ({ name: s.name, color: s.color, mesh: toMesh(flip ? s.m.rotate([180, 0, 0]) : s.m) })) });
    }
  }

  if (wantBase && design.parts !== "az-set") {
    if (design.kind === "fluted") {
      const chain = buildChain(baseKeys, design);
      chain.forEach((link, i) => {
        const color = caps[i]?.key.baseColor ?? design.baseColor;
        const home = (m: Manifold) => toMesh(m.translate([-baseKeys[i].at[0], -baseKeys[i].at[1], 0]));
        assembled.push(part({ name: `Base ${i + 1}`, color, m: link.m }, [0, 0]));
        print.push({ name: `Base ${i + 1}`, parts: [{ name: `Base ${i + 1}`, color, mesh: home(link.m) }, ...supportParts(link.supports, color, home)] });
        joints.push(...link.joints);
        if (switchClash(link.joints, keySwitches(baseKeys[i]), bottom, link.connectors)) warnings.push("warn.connectorSwitch");
        if (shortTongue(link.joints)) warnings.push("warn.connectorTongue");
      });
    } else {
      const foot = baseFootprint(baseKeys, base, fit);
      const m = buildBase(baseKeys, base, fit, foot);
      assembled.push(part({ name: "Base", color: design.baseColor, m }, [0, 0]));
      print.push({ name: "Base", parts: [{ name: "Base", color: design.baseColor, mesh: toMesh(m) }, ...supportParts(baseSupports(baseKeys, base, fit, foot), design.baseColor, toMesh)] });
      joints.push(...baseJoints(baseKeys, base, fit, foot));
      if (switchClash(joints, baseKeys.flatMap(keySwitches), bottom, base.connectors)) warnings.push("warn.connectorSwitch");
      if (shortTongue(joints)) warnings.push("warn.connectorTongue");
    }
  }

  const foot = baseKeys.length ? baseFootprint(baseKeys, base, fit) : null;
  if (foot && wantBase && design.kind !== "fluted") {
    const inner = foot.offset(-1, "Round");
    const room = K().CrossSection.union(baseKeys.flatMap(keySwitches).map((s) => K().CrossSection.square([fit.clipRoom, fit.clipRoom], true).translate(s)));
    if (room.subtract(inner).area() > 0.01) warnings.push("warn.pocket");
  }
  const loops = foot && wantBase && design.kind !== "fluted" ? loopCentres(foot, base.loop, base.loopHole / 2, connectorSides(base), base.loopAngle, base.loopSlide) : [];
  const keyring = keyringPoint(loops, joints, foot, bottom, base.loop === "angle" ? base.loopAngle : null);
  if (patches.some((p) => p.h > TALL)) warnings.push("warn.tall");
  if (caps.length && wantCaps && wantBase && design.kind !== "model") {
    const rimTop = baseLevels(base, fit).wallTop;
    if (caps.some((c) => (c.switches ?? [[0, 0]]).some((s) => skirtExposed(c.outline, fit, rimTop, s)))) warnings.push("warn.smallCap");
  }
  return {
    assembled,
    print,
    warnings: [...new Set(warnings)],
    switches: wantBase || design.parts === "cap+base" ? baseKeys.flatMap(keySwitches) : [],
    switchesPerCap: caps[0]?.switches?.length ?? 1,
    keyring,
    bottom,
    patches,
  };
}

/** Split a model: the bottom half prints as built, and the top half stands on its seam face or plug, as a raised cap stands on its skirt. */
function buildSplit(design: Design, assets: Assets): BuildResult {
  const warnings: string[] = [];
  const s = splitModel(design, warnings, assets.memo);
  const halves = s
    ? [
        { name: "Bottom half", color: design.baseColor, m: s.bottom, want: design.parts !== "caps" },
        { name: "Top half", color: design.keys[0].capColor, m: s.top, want: design.parts !== "base", half: "top" as const },
      ].filter((x) => x.want && !x.m.isEmpty())
    : [];
  return {
    assembled: halves.map((x) => part(x, [0, 0], x.half)),
    print: halves.map((x) => ({ name: x.name, parts: [{ name: x.name, color: x.color, mesh: toMesh(x.m) }] })),
    warnings: [...new Set(warnings)],
    switches: s?.switches ?? [],
    switchesPerCap: s?.switches.length || 1,
    keyring: null,
    bottom: s?.info.modelZ0 ?? 0,
    patches: [],
    split: s?.info,
  };
}

/**
 * A cap's picture patches, as the preview picks them (footprints not clipped to
 * the flat top: close enough to click). An inlay ignores heights: every patch is flush.
 */
function capPatches(c: CapSpec, top: number, owner: number, def: number, inlay: boolean): PatchInfo[] {
  const out: PatchInfo[] = [];
  for (const l of c.deco) {
    if (!l.patch) continue;
    const h = inlay ? 0 : (l.h ?? def);
    const rings = l.cs.translate(c.at).simplify(0.05).toPolygons() as [number, number][][];
    const { layer, at, pins, paints, depth } = l.patch;
    out.push({ owner, layer, at, pins, depth, h, own: !inlay && pins.length > 0, color: l.color, paints, painted: paints.length > 0, top: top + h, rings });
  }
  return out;
}

function supportParts(volumes: Manifold[], color: string, mesh: (m: Manifold) => Mesh): Part[] {
  return volumes.map((m, i) => ({ name: `Tab support ${i + 1}`, color, mesh: mesh(m), role: "support" as const }));
}

/** A keyring loop if there is one, else the first tab hole (a fluted chain's first link). */
function keyringPoint(loops: [number, number][], joints: Joint[], foot: CrossSection | null, bottom: number, angle: number | null): Keyring | null {
  if (loops.length) {
    const b = foot?.bounds();
    const [cx, cy] = b ? [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2] : [0, 0];
    const [x, y] = loops[0];
    const r = ((angle ?? 0) * Math.PI) / 180;
    const dir: [number, number] = angle !== null ? [Math.cos(r), Math.sin(r)] : Math.abs(x - cx) > 1 ? [Math.sign(x - cx), 0] : [0, Math.sign(y - cy) || -1];
    return { at: loops[0], dir, z: bottom + 1.5 };
  }
  const tab = joints.find((j) => j.role === "tab");
  return tab ? { at: holeCentre(tab), dir: sideDir(tab.side), z: bottom + (H.tabZ[0] + H.tabZ[1]) / 2 } : null;
}

function part(s: Solid, at: [number, number], half?: "top"): Part {
  return { name: s.name, color: s.color, mesh: toMesh(at[0] || at[1] ? s.m.translate([at[0], at[1], 0]) : s.m), ...(half && { half }) };
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
