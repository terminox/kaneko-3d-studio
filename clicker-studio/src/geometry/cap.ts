// Top Caps and Keycaps. Built in the "plate frame": z = 0 is the top of the
// Switch plate, x/y centred on the Switch, cap at rest.
import type { CapOptions } from "../design/types.ts";
import { K, type CrossSection, type Manifold } from "./kernel.ts";
import { offset } from "./outline.ts";
import { capHeights, minCapHeight, type Fit } from "./switch.ts";
import type { Layer } from "./decoration.ts";
import { mergeAreas } from "./patches.ts";
import { FLUSH_DEPTH } from "../design/heights.ts";

export type Solid = { name: string; color: string; m: Manifold };

/** Extrudes `cs` from z0 to z1. */
export function slab(cs: CrossSection, z0: number, z1: number): Manifold {
  return cs.extrude(z1 - z0).translate([0, 0, z0]);
}

/** A prism with its top edge rounded by `r`, built from stacked offset slabs. */
function roundedPrism(cs: CrossSection, z0: number, z1: number, r: number): Manifold {
  r = Math.min(r, (z1 - z0) / 2);
  if (r < 0.05) return slab(cs, z0, z1);
  const steps = 6;
  const parts = [slab(cs, z0, z1 - r)];
  for (let i = 1; i <= steps; i++) {
    const za = z1 - r + ((i - 1) * r) / steps;
    const zb = z1 - r + (i * r) / steps;
    const inset = r - Math.sqrt(Math.max(0, r * r - ((i * r) / steps) ** 2));
    const layer = offset(cs, -inset);
    if (!layer.isEmpty()) parts.push(slab(layer, za, zb));
  }
  return K().Manifold.union(parts);
}

/** Scales x/y linearly from 1 at z0 to `top` at z1 (keyboard-key taper). */
function taper(m: Manifold, z0: number, z1: number, top: number): Manifold {
  return m.warp((v) => {
    const t = Math.min(1, Math.max(0, (v[2] - z0) / (z1 - z0)));
    const s = 1 - (1 - top) * t;
    v[0] *= s;
    v[1] *= s;
  });
}

/** The switch top housing above the plate (convex, tapering upward). */
export function housingEnvelope(fit: Fit, margin = 0): Manifold {
  const { CrossSection } = K();
  const w0 = fit.housingBottom + 2 * margin;
  const w1 = fit.housingTop + 2 * margin;
  return CrossSection.square([w0, w0], true).extrude(fit.housingHeight + margin, 0, 0, [w1 / w0, w1 / w0]);
}

/** The space a resting cap must leave free: the housing swept up by the travel, plus 0.3 mm. */
export function keepOut(fit: Fit): Manifold {
  const env = housingEnvelope(fit, 0.3).translate([0, 0, -0.3]);
  return K().Manifold.hull([env, env.translate([0, 0, fit.travel])]);
}

/** True when clearing the housing at `at` would cut through the cap wall above `rimTop` (plate frame). */
export function skirtExposed(outline: CrossSection, fit: Fit, rimTop: number, at: [number, number] = [0, 0]): boolean {
  const s = keepOut(fit).slice(rimTop).translate(at);
  return s.subtract(offset(outline, -0.6)).area() > 0.01;
}

/**
 * Layers -> printed parts: the patches of one filament make one part (other
 * layers are one part each). Areas at the same height are merged and
 * clipped together, so a flat picture costs one extrusion per colour.
 */
function partsOf(layers: Layer[], heightOf: (l: Layer) => number, clip: (cs: CrossSection) => CrossSection) {
  const groups = new Map<string, { color: string; byH: Map<number, Layer[]> }>();
  layers.forEach((l, i) => {
    const key = l.patch ? `p${l.color.toUpperCase()}` : `d${i}`;
    const g = groups.get(key) ?? { color: l.color, byH: new Map() };
    const lh = heightOf(l);
    g.byH.set(lh, [...(g.byH.get(lh) ?? []), l]);
    groups.set(key, g);
  });
  return [...groups.values()]
    .map((g) => ({
      color: g.color,
      levels: [...g.byH].map(([h, ls]) => ({ h, cs: clip(mergeAreas(ls)) })).filter((l) => !l.cs.isEmpty()),
    }))
    .filter((g) => g.levels.length);
}

export type CapGeometry = {
  solids: Solid[];
  /** Cap top z (plate frame), for stacking raised Decorations. */
  top: number;
  /** Flat area of the top, where Decorations may go. */
  flat: CrossSection;
};

/**
 * One cap over one or more Switches. `deco` layers must already be fitted and
 * centred (cap-local x/y). `rings` are outline rings around them, inner first.
 * `inset` is how far Decorations stay in from the outline. `switches` are the
 * stem centres; the first gets the tight socket, the others `extraStemFit`.
 */
export function buildCap(
  outline: CrossSection,
  opts: CapOptions,
  fit: Fit,
  capColor: string,
  deco: Layer[],
  rings: Layer[],
  label: string,
  tapered = opts.shape === "keycap",
  inset = opts.topRound + 0.4,
  switches: [number, number][] = [[0, 0]],
): CapGeometry {
  const { Manifold, CrossSection } = K();
  const { skirtBottom, ceiling, bossBottom } = capHeights(fit);
  const height = Math.max(opts.height, minCapHeight(fit));
  const z0 = skirtBottom;
  const z1 = z0 + height;
  const topScale = tapered ? 0.82 : 1;

  let body = roundedPrism(outline, z0, z1, opts.topRound);
  let cavity = slab(offset(outline, -opts.wall), z0 - 1, ceiling);
  if (tapered) {
    body = taper(body, z0, z1, topScale);
    cavity = taper(cavity, z0, z1, topScale);
  }
  // A stem boss with its cross socket over every Switch. Everything except the
  // bosses must clear every housing over the whole travel.
  const bosses: Manifold[] = [], keepOuts: Manifold[] = [];
  switches.forEach((s, i) => {
    const sf = fit.stemFit + (i > 0 ? fit.extraStemFit : 0);
    const L = fit.crossLength + 2 * sf;
    const W = fit.crossWidth + 2 * sf;
    const cross = CrossSection.square([L, W], true).add(CrossSection.square([W, L], true));
    const socket = slab(cross, bossBottom - 1, ceiling - 0.001);
    const boss = Manifold.cylinder(ceiling - bossBottom + 0.4, fit.boss / 2, fit.boss / 2, 48).translate([0, 0, bossBottom]);
    bosses.push(boss.subtract(socket).translate([s[0], s[1], 0]));
    keepOuts.push(keepOut(fit).translate([s[0], s[1], 0]));
  });
  let cap = body.subtract(cavity).subtract(Manifold.union(keepOuts)).add(Manifold.union(bosses));

  // Top area Decorations stay inside.
  const flatScale = topScale;
  const flat = offset(outline, -inset).scale(flatScale);
  // Past the flat top they follow the rounded edge: raised ones fill down
  // over it, flush and inlaid ones are trimmed to it.
  const edge = inset < opts.topRound + 0.4 && opts.topRound >= 0.05;
  const raise = (cs: CrossSection, top: number) => (edge ? slab(cs, z1 - opts.topRound, top).subtract(body) : slab(cs, z1, top));
  const sink = (cs: CrossSection, depth: number) => (edge ? slab(cs, z1 - depth, z1).intersect(body) : slab(cs, z1 - depth, z1));

  const solids: Solid[] = [];
  const clip = (cs: CrossSection) => cs.intersect(flat);
  if (opts.style === "inlay") {
    const depth = Math.max(0.4, opts.decoHeight);
    const parts = partsOf([...deco, ...rings], () => depth, clip);
    if (parts.length) {
      const cut = slab(CrossSection.union(parts.flatMap((p) => p.levels.map((l) => l.cs))), z1 - depth, z1 + 1);
      cap = cap.subtract(cut);
      parts.forEach((p, i) => solids.push({ name: `${label} colour ${i + 1}`, color: p.color, m: sink(p.levels[0].cs, depth) }));
    }
  } else {
    // Raised: each patch at its own height (0 = inlaid flush), outline rings in lower steps.
    const h = Math.max(0.4, opts.decoHeight);
    const parts = partsOf(deco, (l) => l.h ?? h, clip);
    const flush = parts.flatMap((p) => p.levels.filter((l) => l.h <= 0).map((l) => l.cs));
    if (flush.length) cap = cap.subtract(slab(CrossSection.union(flush), z1 - FLUSH_DEPTH, z1 + 1));
    parts.forEach((p, i) => {
      const ms = p.levels.map((l) => (l.h > 0 ? raise(l.cs, z1 + l.h) : sink(l.cs, FLUSH_DEPTH)));
      solids.push({ name: `${label} decoration ${i + 1}`, color: p.color, m: ms.length > 1 ? Manifold.union(ms) : ms[0] });
    });
    rings.forEach((l, i) => {
      const cs = clip(l.cs);
      const hr = Math.max(0.2, h * (1 - (i + 1) / (rings.length + 1)));
      if (!cs.isEmpty()) solids.push({ name: `${label} outline ${i + 1}`, color: l.color, m: raise(cs, z1 + hr) });
    });
  }
  solids.unshift({ name: label, color: capColor, m: cap });
  return { solids, top: z1, flat };
}
