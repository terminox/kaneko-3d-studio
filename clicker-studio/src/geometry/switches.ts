// Where the Switches go under one shared cap (Single key, Picture, 3D model).
//
// A cap is a lever on its stems: the farther a press lands from the nearest
// Switch, the more the stem binds and the more the edge droops. Keyboards fix
// this with stabilisers from 2u (38 mm) up; clickers have none, so a large
// cap gets more Switches instead. The rule: every point of the cap must lie
// within `fit.reach` of a Switch. Positions are chosen here
// unless the owner pinned them (ADR 0016).
//
// The work runs on a small raster (0.5 mm pixels) of the cap and Base
// outlines, so it costs two cheap manifold ops and some typed-array loops.
import type { CrossSection } from "./kernel.ts";
import { offset } from "./outline.ts";
import type { Fit } from "./switch.ts";
import { keepOut } from "./cap.ts";
import { maskAt, resolveSpots, type Mask, type Pt } from "./spots.ts";

export type { Mask, Pt };

export type Placement = { at: Pt[]; warnings: string[] };

/** Raster size, mm per pixel. */
const PX = 0.5;
const MAX_SWITCHES = 4;

/** Rasterises a CrossSection onto a grid covering `b` (plus a margin), even-odd fill. */
export function rasterise(cs: CrossSection, b: { min: number[]; max: number[] }, px = PX): Mask {
  const x0 = b.min[0] - 2, y0 = b.min[1] - 2;
  const w = Math.ceil((b.max[0] - b.min[0] + 4) / px), h = Math.ceil((b.max[1] - b.min[1] + 4) / px);
  const data = new Uint8Array(w * h);
  const polys = cs.toPolygons() as number[][][];
  const xs: number[] = [];
  for (let j = 0; j < h; j++) {
    const y = y0 + (j + 0.5) * px;
    xs.length = 0;
    for (const poly of polys)
      for (let k = 0; k < poly.length; k++) {
        const p = poly[k], q = poly[(k + 1) % poly.length];
        if (p[1] > y !== q[1] > y) xs.push(p[0] + ((y - p[1]) * (q[0] - p[0])) / (q[1] - p[1]));
      }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - x0) / px - 0.5)), i1 = Math.min(w - 1, Math.floor((xs[k + 1] - x0) / px - 0.5));
      for (let i = i0; i <= i1; i++) data[j * w + i] = 1;
    }
  }
  return { w, h, x0, y0, px, data };
}

/** Keeps the pixels where a square of half-width `half` (mm) fits entirely inside the mask. */
export function erodeBox(m: Mask, half: number): Mask {
  // Half a pixel stricter than the box, so a centre on the mask's edge still passes the exact checks.
  const r = Math.ceil(half / m.px + 0.5);
  const { w, h } = m;
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  // Along x: a pixel stays when every pixel within r is set (outside the grid counts as unset).
  for (let j = 0; j < h; j++) {
    let run = 0;
    for (let i = 0; i < w; i++) {
      run = m.data[j * w + i] ? run + 1 : 0;
      if (run >= 2 * r + 1) tmp[j * w + i - r] = 1;
    }
  }
  for (let i = 0; i < w; i++) {
    let run = 0;
    for (let j = 0; j < h; j++) {
      run = tmp[j * w + i] ? run + 1 : 0;
      if (run >= 2 * r + 1) out[(j - r) * w + i] = 1;
    }
  }
  return { ...m, data: out };
}

function centres(m: Mask, stride = 1): Pt[] {
  const out: Pt[] = [];
  for (let j = 0; j < m.h; j += stride) for (let i = 0; i < m.w; i += stride) if (m.data[j * m.w + i]) out.push([m.x0 + (i + 0.5) * m.px, m.y0 + (j + 0.5) * m.px]);
  return out;
}

/** Points along the outline's edges, at most `step` apart. */
export function edgePoints(cs: CrossSection, step = 1): Pt[] {
  const out: Pt[] = [];
  for (const poly of cs.toPolygons() as number[][][])
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k], q = poly[(k + 1) % poly.length];
      const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / step));
      for (let s = 0; s < n; s++) out.push([p[0] + ((q[0] - p[0]) * s) / n, p[1] + ((q[1] - p[1]) * s) / n]);
    }
  return out;
}

/** The farthest any edge point is from its nearest centre. */
export function reachOf(edge: Pt[], cs: Pt[]): number {
  let worst = 0;
  for (const e of edge) {
    let best = Infinity;
    for (const c of cs) best = Math.min(best, Math.hypot(e[0] - c[0], e[1] - c[1]));
    worst = Math.max(worst, best);
  }
  return worst;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const round = (v: number) => Math.round(v * 20) / 20;

class Field {
  readonly feasible: Pt[];
  readonly samples: Pt[];
  readonly edge: Pt[];
  readonly mean: Pt;
  constructor(readonly ok: Mask, inside: Mask, outline: CrossSection) {
    this.feasible = centres(ok);
    this.samples = centres(inside, 2);
    this.edge = edgePoints(outline);
    const n = this.samples.length || 1;
    this.mean = [this.samples.reduce((s, p) => s + p[0], 0) / n, this.samples.reduce((s, p) => s + p[1], 0) / n];
  }
  isOk(p: Pt) {
    return maskAt(this.ok, p);
  }
  /** `p` itself when it is feasible, else the nearest feasible pixel centre (null when there is none). */
  snap(p: Pt): Pt | null {
    if (this.isOk(p)) return p;
    let best: Pt | null = null, bd = Infinity;
    for (const f of this.feasible) {
      const d = dist(f, p);
      if (d < bd) (bd = d), (best = f);
    }
    return best;
  }
  reach(cs: Pt[]) {
    return reachOf(this.edge, cs);
  }
}

type Try = { at: Pt[]; reach: number; ok: boolean };

/** Two Switches on the shape's long axis, as far apart as helps. */
function placeTwo(f: Field, pitch: number): Try {
  // Principal axis of the area.
  let a = 0, b = 0, c = 0;
  for (const p of f.samples) {
    const dx = p[0] - f.mean[0], dy = p[1] - f.mean[1];
    a += dx * dx;
    b += dx * dy;
    c += dy * dy;
  }
  const th = Math.abs(a - c) < 1e-6 && Math.abs(b) < 1e-6 ? 0 : 0.5 * Math.atan2(2 * b, a - c);
  const axis: Pt = [Math.cos(th), Math.sin(th)];
  let extent = 0;
  for (const p of f.samples) extent = Math.max(extent, Math.abs((p[0] - f.mean[0]) * axis[0] + (p[1] - f.mean[1]) * axis[1]));
  let best: Try = { at: [], reach: Infinity, ok: false };
  for (let d = pitch / 2; d <= extent; d += 0.25) {
    const pair = [f.snap([f.mean[0] + d * axis[0], f.mean[1] + d * axis[1]]), f.snap([f.mean[0] - d * axis[0], f.mean[1] - d * axis[1]])];
    if (!pair[0] || !pair[1] || dist(pair[0], pair[1]) < pitch - 1e-6) continue;
    const r = f.reach(pair as Pt[]);
    if (r < best.reach - 1e-9) best = { at: pair as Pt[], reach: r, ok: true };
  }
  return best;
}

/** k-means over the area (farthest-point seeds), then each centre moved to feasible ground and spread to the pitch. */
function placeMany(f: Field, n: number, pitch: number): Try {
  const S = f.samples;
  if (S.length < n) return { at: [], reach: Infinity, ok: false };
  // Seeds: the farthest sample from the centroid, then the sample farthest from every seed so far.
  const seeds: Pt[] = [];
  const farthest = (score: (p: Pt) => number) => {
    let best = S[0], bs = -Infinity;
    for (const p of S) {
      const s = score(p);
      if (s > bs + 1e-9 || (Math.abs(s - bs) <= 1e-9 && (p[0] < best[0] || (p[0] === best[0] && p[1] < best[1])))) (bs = s), (best = p);
    }
    return best;
  };
  seeds.push(farthest((p) => dist(p, f.mean)));
  while (seeds.length < n) seeds.push(farthest((p) => Math.min(...seeds.map((s) => dist(s, p)))));
  let cs: Pt[] = seeds.map((s) => [s[0], s[1]]);
  for (let it = 0; it < 40; it++) {
    const sum = cs.map(() => [0, 0, 0]);
    for (const p of S) {
      let k = 0, bd = Infinity;
      cs.forEach((c, i) => {
        const d = dist(c, p);
        if (d < bd) (bd = d), (k = i);
      });
      sum[k][0] += p[0];
      sum[k][1] += p[1];
      sum[k][2]++;
    }
    let moved = 0;
    // Each centre moves to its region's mean, kept on feasible ground.
    const next = cs.map((c, i) => (sum[i][2] ? (f.snap([sum[i][0] / sum[i][2], sum[i][1] / sum[i][2]]) ?? c) : c));
    next.forEach((c, i) => (moved = Math.max(moved, dist(c, cs[i]))));
    cs = next;
    if (moved < 0.05) break;
  }
  // Onto feasible ground, then apart to the pitch.
  const snapped = cs.map((c) => f.snap(c));
  if (snapped.some((c) => !c)) return { at: [], reach: Infinity, ok: false };
  cs = snapped as Pt[];
  for (let round = 0; round < 10; round++) {
    let bad = false;
    for (let i = 0; i < cs.length; i++)
      for (let j = i + 1; j < cs.length; j++) {
        const d = dist(cs[i], cs[j]);
        if (d >= pitch - 1e-6) continue;
        bad = true;
        const push = (pitch - d) / 2 + 0.05;
        const ux = d > 1e-6 ? (cs[j][0] - cs[i][0]) / d : 1, uy = d > 1e-6 ? (cs[j][1] - cs[i][1]) / d : 0;
        cs[i] = f.snap([cs[i][0] - ux * push, cs[i][1] - uy * push]) ?? cs[i];
        cs[j] = f.snap([cs[j][0] + ux * push, cs[j][1] + uy * push]) ?? cs[j];
      }
    if (!bad) break;
  }
  const ok = cs.every((c, i) => f.isOk(c) && cs.every((o, j) => j <= i || dist(c, o) >= pitch - 1e-6));
  return { at: cs, reach: f.reach(cs), ok };
}

function tidy(at: Pt[]): Pt[] {
  const pts = at.map((p) => [round(p[0]), round(p[1])] as Pt);
  // The primary Switch (the first, with the tight socket) is the one nearest today's single-Switch spot.
  let first = 0;
  pts.forEach((p, i) => {
    if (Math.hypot(p[0], p[1]) < Math.hypot(pts[first][0], pts[first][1]) - 1e-9) first = i;
  });
  const rest = pts.filter((_, i) => i !== first).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return [pts[first], ...rest];
}

/**
 * Switch centres (cap-local) for a shared cap. `want` 0 picks the smallest count
 * that keeps every edge within `fit.reach`; 1–4 forces a count (falling back to
 * fewer when they don't fit). One Switch always sits at the origin: today's
 * deepest point or picture anchor. `spots` the owner pinned win over both.
 */
export function placeSwitches(outline: CrossSection, g: SwitchGround, fit: Fit, want: 0 | 1 | 2 | 3 | 4, spots?: Pt[]): Placement {
  if (spots?.length) {
    const b = outline.bounds();
    const at = resolveSpots({ ok: g.ok, pitch: fit.pitch, min: [b.min[0], b.min[1]], max: [b.max[0], b.max[1]] }, spots);
    if (at) return { at, warnings: reachOf(edgePoints(outline), at) > fit.reach * 1.25 ? ["warn.spotsReach"] : [] };
    const auto = placeIn(g.ok, g.inside, outline, fit, want);
    return { at: auto.at, warnings: [...auto.warnings, "warn.spotsDropped"] };
  }
  return placeIn(g.ok, g.inside, outline, fit, want);
}

/** `ok`: where a Switch fits (housing inside the cap wall, pocket inside the Base). `inside`: the cap area to cover. */
export type SwitchGround = { ok: Mask; inside: Mask };

export function switchGround(outline: CrossSection, foot: CrossSection, fit: Fit, rimTop: number): SwitchGround {
  const b = foot.bounds();
  const inside = rasterise(offset(outline, -0.6), b);
  const keep = keepOut(fit).slice(rimTop).bounds();
  const capOk = erodeBox(inside, (keep.max[0] - keep.min[0]) / 2);
  const baseOk = erodeBox(rasterise(foot.offset(-1, "Round"), b), fit.clipRoom / 2);
  return { ok: { ...capOk, data: capOk.data.map((v, i) => v & baseOk.data[i]) }, inside };
}

/**
 * The same choice on ready-made masks: `ok` is where a Switch may sit, `inside`
 * the area to cover, `outline` its edge. The origin must be the first Switch's spot.
 */
export function placeIn(ok: Mask, inside: Mask, outline: CrossSection, fit: Fit, want: 0 | 1 | 2 | 3 | 4): Placement {
  const one: Placement = { at: [[0, 0]], warnings: [] };
  if (want === 1) return one;
  const f = new Field(ok, inside, outline);
  const place = (n: number) => (n === 2 ? placeTwo(f, fit.pitch) : placeMany(f, n, fit.pitch));

  if (want === 0) {
    const reach1 = f.reach([[0, 0]]);
    if (reach1 <= fit.reach) return one;
    // None reaches every edge: take the count that comes closest, and say so.
    let fallback: Try | null = null;
    for (let n = 2; n <= MAX_SWITCHES; n++) {
      const t = place(n);
      if (!t.ok) continue;
      if (t.reach <= fit.reach) return { at: tidy(t.at), warnings: [] };
      if (!fallback || t.reach < fallback.reach) fallback = t;
    }
    // The best that fits; it only warns when the miss is large (a quarter over the reach).
    const best = fallback ?? { at: one.at, reach: reach1 };
    return { at: tidy(best.at), warnings: best.reach > fit.reach * 1.25 ? ["warn.hugeCap"] : [] };
  }
  for (let n = want; n >= 2; n--) {
    const t = place(n);
    if (t.ok) return { at: tidy(t.at), warnings: n === want ? [] : ["warn.noRoom"] };
  }
  return { at: one.at, warnings: ["warn.noRoom"] };
}
