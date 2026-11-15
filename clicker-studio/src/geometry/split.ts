// Split a model: an uploaded STL/OBJ cut by a level seam into a working MX
// clicker. The bottom half holds the Switch, the top half carries its stem
// socket and rests one key travel (plus the bottom gap) above it, so the
// whole model is kept and closes up when fully pressed. Built in the plate
// frame (z = 0 is the Switch plate top), like caps and Bases.
//
// One table drives the rest: for each style, the square of solid material
// each half needs around a Switch at every height (`Band`). The model's
// cross-sections are rasterised once and checked against it to choose the
// seam, the Switch spots, the warnings and the smallest size that fits.
import type { Design, SplitOptions } from "../design/types.ts";
import { newSplit } from "../design/types.ts";
import { K, keep, recall, type Manifold, type Memo } from "./kernel.ts";
import { deepestPoint, offset } from "./outline.ts";
import { capHeights, type Fit } from "./switch.ts";
import { keepOut, keepOutHalf, keepOutTop, slab, stemBoss } from "./cap.ts";
import { switchPocket } from "./base.ts";
import { placeIn, rasterise, type Mask, type Pt } from "./switches.ts";
import { loadModel, modelKey } from "./model-cap.ts";

/** Plug style: the seam sits this far above the cap skirt's bottom, where a Base's rim ends. */
const PLUG_RISE = 2;
/** A bottom half standing on less than this (mm²) tips over or lets go of the bed. */
const SMALL_FOOT = 50;

type Half = "top" | "bottom";

/** Solid material a half needs around each Switch: a square of half-width `need(z)` mm at every plate height z from z0 to z1. */
type Band = { half: Half; z0: number; z1: number; need: (z: number) => number };

/** A style's seam height and the top half's lift (plate frame), and the bands its halves need. */
type Frame = { seam: number; gap: number; bands: Band[] };

function frameOf(style: SplitOptions["style"], fit: Fit, wall: number): Frame {
  const { skirtBottom, ceiling } = capHeights(fit);
  const gap = fit.travel + fit.bottomGap;
  const seam = style === "plug" ? skirtBottom + PLUG_RISE : 0;
  const face = seam + gap;
  const floor = -(fit.plate + fit.under);
  const roof = keepOutTop(fit);
  const bands: Band[] = [
    // The clip room's walls and floor.
    { half: "bottom", z0: floor - wall, z1: floor, need: () => fit.clipRoom / 2 },
    { half: "bottom", z0: floor, z1: 0, need: () => fit.clipRoom / 2 + wall },
    // The plug: a wall round the housing, the clearance, then the well's wall.
    ...(style === "plug" ? [{ half: "bottom" as const, z0: 0, z1: seam, need: () => keepOutHalf(fit, skirtBottom) + 2 * wall + fit.clearance }] : []),
    // The housing's room in the top half, its roof, and the material over the stem socket.
    { half: "top", z0: face, z1: roof, need: (z) => keepOutHalf(fit, z) + wall },
    { half: "top", z0: Math.max(face, roof), z1: roof + wall, need: () => keepOutHalf(fit, roof) },
    { half: "top", z0: Math.max(face, ceiling), z1: ceiling + wall, need: () => fit.boss / 2 },
  ];
  return { seam, gap, bands: bands.filter((b) => b.z1 > b.z0) };
}

/**
 * The model's cross-sections every `dz` mm up from its bottom, each as a
 * chessboard distance field on one shared grid: pixels to the nearest empty
 * pixel, capped at 255. Plain data, so a worker can keep it between builds.
 */
type Stack = { grid: Omit<Mask, "data">; dz: number; height: number; dist: Uint8Array[] };

function stackOf(model: Manifold): Stack {
  const b = model.boundingBox();
  const height = b.max[2];
  // Fine enough to hold a plug in a 25 mm bar, at most about 40,000 pixels a slice.
  const px = Math.max(0.25, Math.sqrt(((b.max[0] - b.min[0]) * (b.max[1] - b.min[1])) / 40000));
  const dz = Math.max(0.5, height / 120);
  const box = { min: [b.min[0], b.min[1]], max: [b.max[0], b.max[1]] };
  const dist: Uint8Array[] = [];
  let grid: Omit<Mask, "data"> | null = null;
  for (let k = 0; k * dz < height + dz; k++) {
    const { data, ...g } = rasterise(model.slice(Math.min(height - 0.01, Math.max(0.01, k * dz))), box, px);
    grid ??= g;
    dist.push(chessboard({ ...g, data }));
  }
  return { grid: grid!, dz, height, dist };
}

/** Chessboard distance (px) from each set pixel to the nearest unset one, outside the grid counting as unset. */
function chessboard(m: Mask): Uint8Array {
  const { w, h, data } = m;
  const d = new Uint8Array(w * h);
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : d[j * w + i]);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) if (data[j * w + i]) d[j * w + i] = Math.min(255, 1 + Math.min(at(i - 1, j), at(i - 1, j - 1), at(i, j - 1), at(i + 1, j - 1)));
  for (let j = h - 1; j >= 0; j--)
    for (let i = w - 1; i >= 0; i--) if (data[j * w + i]) d[j * w + i] = Math.min(d[j * w + i], 1 + Math.min(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1), at(i - 1, j + 1)));
  return d;
}

/**
 * Where a Switch centre has room (1) with the seam at model height `zs` and
 * the model scaled by `s`, for the bands of `half` (or both). Null when it
 * has room nowhere, including when a band runs off the model.
 */
function room(st: Stack, fr: Frame, zs: number, s: number, half?: Half): Uint8Array | null {
  const size = st.grid.w * st.grid.h;
  const out = new Uint8Array(size).fill(1);
  let alive = size;
  for (const b of fr.bands) {
    if (half && b.half !== half) continue;
    const anchor = b.half === "bottom" ? fr.seam : fr.seam + fr.gap;
    const za = zs + (b.z0 - anchor) / s, zb = zs + (b.z1 - anchor) / s;
    if (za < -0.05 || zb > st.height + 0.05) return null;
    // Every slice within one step of the band, each held to the most the band asks over that step.
    const k0 = Math.max(0, Math.floor(za / st.dz + 1e-6)), k1 = Math.min(st.dist.length - 1, Math.ceil(zb / st.dz - 1e-6));
    for (let k = k0; k <= k1; k++) {
      const zp = anchor + (k * st.dz - zs) * s, step = st.dz * s;
      const clamp = (z: number) => Math.min(b.z1, Math.max(b.z0, z));
      const need = Math.max(b.need(clamp(zp - step)), b.need(clamp(zp + step)));
      // As erodeBox: half a pixel stricter than the square.
      const thr = Math.ceil(need / (s * st.grid.px) + 0.5) + 1;
      const d = st.dist[k];
      for (let i = 0; i < size; i++)
        if (out[i] && d[i] < thr) {
          out[i] = 0;
          alive--;
        }
      if (!alive) return null;
    }
  }
  return out;
}

/** The first seam height (model mm, slice steps, nearest the middle) where a Switch has room at scale `s`. */
function firstFit(st: Stack, fr: Frame, s: number): number | null {
  const zs: number[] = [];
  for (let k = 1; k < st.dist.length - 1; k++) zs.push(k * st.dz);
  zs.sort((a, b) => Math.abs(a - st.height / 2) - Math.abs(b - st.height / 2) || a - b);
  return zs.find((z) => room(st, fr, z, s)) ?? null;
}

/** The smallest scale at which some seam has room (within 0.1–4×), and that seam. Null when even 4× has none. */
function smallestFit(st: Stack, fr: Frame): { s: number; zs: number } | null {
  let lo = 0.1, hi = 4;
  const z = firstFit(st, fr, hi);
  if (z === null) return null;
  let best = { s: hi, zs: z };
  for (let i = 0; i < 10; i++) {
    const mid = Math.sqrt(lo * hi);
    const zm = firstFit(st, fr, mid);
    if (zm === null) lo = mid;
    else (hi = mid), (best = { s: mid, zs: zm });
  }
  return best;
}

const maskOf = (st: Stack, data: Uint8Array, shift: Pt = [0, 0]): Mask => ({ ...st.grid, x0: st.grid.x0 - shift[0], y0: st.grid.y0 - shift[1], data });

function isSet(m: Mask, p: Pt): boolean {
  const i = Math.floor((p[0] - m.x0) / m.px), j = Math.floor((p[1] - m.y0) / m.px);
  return i >= 0 && j >= 0 && i < m.w && j < m.h && m.data[j * m.w + i] === 1;
}

/** `p` when it is set, else the nearest set pixel's centre. */
function nearestSet(m: Mask, p: Pt): Pt {
  if (isSet(m, p)) return p;
  let best = p, bd = Infinity;
  for (let j = 0; j < m.h; j++)
    for (let i = 0; i < m.w; i++) {
      if (!m.data[j * m.w + i]) continue;
      const c: Pt = [m.x0 + (i + 0.5) * m.px, m.y0 + (j + 0.5) * m.px];
      const d = Math.hypot(c[0] - p[0], c[1] - p[1]);
      if (d < bd) (bd = d), (best = c);
    }
  return best;
}

/** What the preview and the Split card need: the seam and gap (plate frame), where the model's bottom sits, its height, and the smallest size that fits (mm). */
export type SplitInfo = { seamZ: number; gap: number; modelZ0: number; height: number; minWidth: number | null; auto: boolean };

export type SplitResult = { top: Manifold; bottom: Manifold; switches: Pt[]; info: SplitInfo };

/** The two halves of the uploaded model, or null (with a warning) when there is no usable model. */
export function splitModel(design: Design, warnings: string[], memo?: Memo): SplitResult | null {
  const model = loadModel(design, warnings, memo);
  if (!model || !design.model) return null;
  const { Manifold } = K();
  const { fit } = design;
  const opts: SplitOptions = { ...newSplit(), ...design.split };
  const fr = frameOf(opts.style, fit, opts.wall);
  const sized = modelKey(design);
  const st = recall<Stack>(memo, "split-stack", sized) ?? keep(memo, "split-stack", sized, stackOf(model));
  const H = st.height;

  const searchKey = `${sized}|${opts.style}|${opts.wall}|${JSON.stringify(fit)}`;
  const search =
    recall<{ fits: number | null; smallest: { s: number; zs: number } | null }>(memo, "split-search", searchKey) ??
    keep(memo, "split-search", searchKey, { fits: firstFit(st, fr, 1), smallest: smallestFit(st, fr) });
  // Automatic: the fitting seam nearest mid-height, else the roomiest one.
  const zs = opts.at === null ? (search.fits ?? search.smallest?.zs ?? H / 2) : Math.min(H - st.dz, Math.max(st.dz, opts.at * H));
  const info: SplitInfo = {
    seamZ: fr.seam,
    gap: fr.gap,
    modelZ0: fr.seam - zs,
    height: H,
    // A little over the estimate, since the model is sliced afresh at the new size; never over a size that fits.
    minWidth: search.smallest ? Math.min(search.fits === null ? Infinity : design.model.width, Math.ceil(design.model.width * search.smallest.s * 1.02)) : null,
    auto: opts.at === null,
  };

  const section = model.slice(zs);
  if (section.isEmpty()) {
    warnings.push("warn.splitMiss");
    const [up, low] = model.translate([0, 0, fr.seam - zs]).splitByPlane([0, 0, 1], fr.seam);
    return { top: up.translate([0, 0, fr.gap]), bottom: low, switches: [], info };
  }
  if (design.parts !== "caps" && model.slice(0.1).area() < SMALL_FOOT) warnings.push("warn.splitSmallFoot");

  // The plug and its well must fit inside every slice the well passes.
  let core = section;
  if (opts.style === "plug") for (let z = zs - fr.seam; z < zs; z += 1) core = core.intersect(model.slice(Math.max(0.01, z)));

  const okBottom = room(st, fr, zs, 1, "bottom"), okTop = room(st, fr, zs, 1, "top");
  const both = okBottom && okTop ? okBottom.map((v, i) => v & okTop[i]) : null;
  const ok = both?.includes(1) ? both : null;
  const deep = deepestPoint(core.isEmpty() ? section : core);
  const origin: Pt = ok ? nearestSet(maskOf(st, ok), deep) : deep;

  let spots: Pt[] = [[0, 0]];
  if (ok) {
    const inside = rasterise(offset(section, -0.6), section.bounds(), st.grid.px);
    const placed = placeIn(maskOf(st, ok, origin), { ...inside, x0: inside.x0 - origin[0], y0: inside.y0 - origin[1] }, section.translate([-origin[0], -origin[1]]), fit, design.cap.switches);
    warnings.push(...placed.warnings);
    spots = placed.at;
  } else warnings.push("warn.splitNoRoom");
  const switches = spots.map(([x, y]): Pt => [x + opts.nudge[0], y + opts.nudge[1]]);
  if (ok) {
    const fits = (m: Uint8Array) => switches.every(([x, y]) => isSet(maskOf(st, m), [x + origin[0], y + origin[1]]));
    if (!fits(okBottom!)) warnings.push("warn.splitBottom");
    if (!fits(okTop!)) warnings.push("warn.splitTop");
  }

  const placedModel = model.translate([-origin[0], -origin[1], fr.seam - zs]);
  const [up, low] = placedModel.splitByPlane([0, 0, 1], fr.seam);
  const cuts: Manifold[] = switches.flatMap((s) => switchPocket(fit, s, -(fit.plate + fit.under)));
  let top = up.translate([0, 0, fr.gap]);
  if (opts.style === "plug") {
    const inner = offset(core.translate([-origin[0], -origin[1]]), -opts.wall);
    cuts.push(slab(inner, 0, fr.seam + 1));
    top = top.add(slab(offset(inner, -fit.clearance), capHeights(fit).skirtBottom, fr.seam + fr.gap + 0.01));
  }
  const bottom = low.subtract(Manifold.union(cuts));
  // As on a cap: every housing is cleared over the whole travel, then a stem boss with its socket goes over each Switch.
  const clear: Manifold[] = [], bosses: Manifold[] = [];
  switches.forEach((s, i) => {
    const { boss, socket } = stemBoss(fit, fit.stemFit + (i > 0 ? fit.extraStemFit : 0));
    const at = (m: Manifold) => m.translate([s[0], s[1], 0]);
    clear.push(at(keepOut(fit)), at(socket));
    bosses.push(at(boss));
  });
  top = top.subtract(Manifold.union(clear)).add(Manifold.union(bosses));
  return { top, bottom, switches, info };
}
