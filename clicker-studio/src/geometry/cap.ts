// Top Caps and Keycaps. Built in the "plate frame": z = 0 is the top of the
// Switch plate, x/y centred on the Switch, cap at rest.
import type { CapOptions } from "../design/types.ts";
import { K, type CrossSection, type Manifold } from "./kernel.ts";
import { offset } from "./outline.ts";
import { capHeights, minCapHeight, type Fit } from "./switch.ts";
import type { Layer } from "./decoration.ts";

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

/** True when clearing the housing would cut through the cap wall above `rimTop` (plate frame). */
export function skirtExposed(outline: CrossSection, fit: Fit, rimTop: number): boolean {
  const s = keepOut(fit).slice(rimTop);
  return s.subtract(offset(outline, -0.6)).area() > 0.01;
}

export type CapGeometry = {
  solids: Solid[];
  /** Cap top z (plate frame), for stacking raised Decorations. */
  top: number;
  /** Flat area of the top, where Decorations may go. */
  flat: CrossSection;
};

/**
 * One cap over one Switch. `deco` layers must already be fitted and centred
 * (cap-local x/y). `rings` are outline rings around them, inner first.
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
  // Stem boss with the cross socket.
  const boss = Manifold.cylinder(ceiling - bossBottom + 0.4, fit.boss / 2, fit.boss / 2, 48).translate([0, 0, bossBottom]);
  const L = fit.crossLength + 2 * fit.stemFit;
  const W = fit.crossWidth + 2 * fit.stemFit;
  const cross = CrossSection.square([L, W], true).add(CrossSection.square([W, L], true));
  const socket = slab(cross, bossBottom - 1, ceiling - 0.001);
  // Everything except the boss must clear the housing over the whole travel.
  let cap = body.subtract(cavity).subtract(keepOut(fit)).add(boss.subtract(socket));

  // Flat top area (Decorations stay inside it).
  const flatScale = topScale;
  const flat = offset(outline, -(opts.topRound + 0.4)).scale(flatScale);

  const solids: Solid[] = [];
  const clip = (cs: CrossSection) => cs.intersect(flat);
  if (opts.style === "inlay") {
    const depth = Math.max(0.4, opts.decoHeight);
    const pieces = [...deco, ...rings].map((l) => ({ ...l, cs: clip(l.cs) })).filter((l) => !l.cs.isEmpty());
    if (pieces.length) {
      const cut = slab(CrossSection.union(pieces.map((p) => p.cs)), z1 - depth, z1 + 1);
      cap = cap.subtract(cut);
      pieces.forEach((p, i) => solids.push({ name: `${label} colour ${i + 1}`, color: p.color, m: slab(p.cs, z1 - depth, z1) }));
    }
  } else {
    // Raised: Decoration at full height, outline rings in lower steps.
    const h = Math.max(0.4, opts.decoHeight);
    deco.forEach((l, i) => {
      const cs = clip(l.cs);
      if (!cs.isEmpty()) solids.push({ name: `${label} decoration ${i + 1}`, color: l.color, m: slab(cs, z1, z1 + h) });
    });
    rings.forEach((l, i) => {
      const cs = clip(l.cs);
      const hr = Math.max(0.2, h * (1 - (i + 1) / (rings.length + 1)));
      if (!cs.isEmpty()) solids.push({ name: `${label} outline ${i + 1}`, color: l.color, m: slab(cs, z1, z1 + hr) });
    });
  }
  solids.unshift({ name: label, color: capColor, m: cap });
  return { solids, top: z1, flat };
}
