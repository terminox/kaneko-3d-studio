// Bases: the printed body holding one or more Switches. Built in the plate
// frame (z = 0 is the top of the Switch plate).
import type { BaseOptions, Loop } from "../design/types.ts";
import { K, type CrossSection, type Manifold } from "./kernel.ts";
import { circle, coverWith, offset, roundConcave } from "./outline.ts";
import { capHeights, type Fit } from "./switch.ts";
import { slab } from "./cap.ts";
import { applyTexture } from "./texture.ts";

export type BaseKey = { at: [number, number]; outline: CrossSection };

export function baseLevels(opts: BaseOptions, fit: Fit) {
  const bottom = -(fit.plate + fit.under + opts.floor);
  const wallTop = capHeights(fit).skirtBottom + opts.rimRise;
  return { bottom, wallTop };
}

/** The Base's footprint for a set of keys. */
export function baseFootprint(keys: BaseKey[], opts: BaseOptions, fit: Fit): CrossSection {
  const { CrossSection } = K();
  const each = keys.map((k) => offset(k.outline, fit.clearance + opts.rim).translate(k.at));
  let out = CrossSection.union(each);
  if (keys.length > 1) out = roundConcave(out, 1.5);
  if (opts.shape !== "follow") out = coverWith(out, opts.shape);
  return out;
}

/** Keyring loop centres for a footprint. */
export function loopCentres(foot: CrossSection, loop: Loop, holeR: number): [number, number][] {
  if (loop === "none") return [];
  const b = foot.bounds();
  const cy = (b.min[1] + b.max[1]) / 2;
  const cx = (b.min[0] + b.max[0]) / 2;
  const d = holeR + 0.9;
  const pts: [number, number][] = [];
  // Place the loop where the footprint actually is on that side: probe the edge at the centre line.
  if (loop === "left" || loop === "both") pts.push([edgeX(foot, cy, -1) - d, cy]);
  if (loop === "right" || loop === "both") pts.push([edgeX(foot, cy, 1) + d, cy]);
  if (loop === "top") pts.push([cx, edgeY(foot, cx) + d]);
  return pts;
}

function edgeX(cs: CrossSection, y: number, dir: 1 | -1): number {
  const b = cs.bounds();
  const probe = K().CrossSection.square([b.max[0] - b.min[0] + 2, 0.5], true).translate([(b.min[0] + b.max[0]) / 2, y]);
  const hit = cs.intersect(probe).bounds();
  return dir > 0 ? hit.max[0] : hit.min[0];
}

function edgeY(cs: CrossSection, x: number): number {
  const b = cs.bounds();
  const probe = K().CrossSection.square([0.5, b.max[1] - b.min[1] + 2], true).translate([x, (b.min[1] + b.max[1]) / 2]);
  return cs.intersect(probe).bounds().max[1];
}

/** A Base with one Switch Pocket per key. */
export function buildBase(keys: BaseKey[], opts: BaseOptions, fit: Fit, footprint?: CrossSection): Manifold {
  const { CrossSection, Manifold } = K();
  const { bottom, wallTop } = baseLevels(opts, fit);
  const foot = footprint ?? baseFootprint(keys, opts, fit);
  let body = slab(foot, bottom, wallTop);
  if (opts.texture !== "none") body = applyTexture(body, foot, bottom, wallTop, opts.texture, opts.textureDepth);

  // Keyring loops sit flush with the bottom.
  const holeR = opts.loopHole / 2;
  const loops = loopCentres(foot, opts.loop, holeR);
  for (const c of loops) body = body.add(slab(circle(holeR + 2.4, c), bottom, bottom + opts.loopThickness));

  const cuts: Manifold[] = [];
  for (const k of keys) {
    // Room above the plate for the cap skirt.
    cuts.push(slab(offset(k.outline, fit.clearance).translate(k.at), 0, wallTop + 1));
    // Clip room under the plate for the bottom housing and pins.
    cuts.push(slab(CrossSection.square([fit.clipRoom, fit.clipRoom], true).translate(k.at), bottom + opts.floor, -fit.plate));
    // The plate cutout.
    cuts.push(slab(CrossSection.square([fit.pocket, fit.pocket], true).translate(k.at), -fit.plate - 0.5, 0.5));
  }
  for (const c of loops) cuts.push(slab(circle(holeR, c), bottom - 1, wallTop + 1));
  return body.subtract(Manifold.union(cuts));
}
