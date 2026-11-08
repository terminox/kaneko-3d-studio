// Bases: the printed body holding one or more Switches. Built in the plate
// frame (z = 0 is the top of the Switch plate).
import type { BaseOptions, Loop } from "../design/types.ts";
import { K, type CrossSection, type Manifold } from "./kernel.ts";
import { circle, coverWith, offset, roundConcave } from "./outline.ts";
import { capHeights, type Fit } from "./switch.ts";
import { slab } from "./cap.ts";
import { applyTexture } from "./texture.ts";
import { connectorJoints, connectorRoles, padOutline, padSolid, pinSolid, slitCut, socketCut, supportVolume, tabSolid, tongueSlab, type Joint, type Side } from "./connector.ts";

/** One cap on the Base: its outline at `at`, and its Switch centres relative to `at` (default one, at the cap origin). */
export type BaseKey = { at: [number, number]; outline: CrossSection; switches?: [number, number][] };

/** Every Switch centre of a key, in the plate frame. */
export function keySwitches(k: BaseKey): [number, number][] {
  return (k.switches ?? [[0, 0]]).map((s) => [k.at[0] + s[0], k.at[1] + s[1]]);
}

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

/** Sides an H-connector takes, so no keyring loop goes there. */
export function connectorSides(opts: BaseOptions): Set<Side> {
  return new Set(Object.keys(connectorRoles(opts.connectors)) as Side[]);
}

/** Keyring loop centres for a footprint. Sides in `taken` (an H-connector's) get none. */
export function loopCentres(foot: CrossSection, loop: Loop, holeR: number, taken: Set<Side> = new Set()): [number, number][] {
  if (loop === "none") return [];
  const b = foot.bounds();
  const cy = (b.min[1] + b.max[1]) / 2;
  const cx = (b.min[0] + b.max[0]) / 2;
  const d = holeR + 0.9;
  const pts: [number, number][] = [];
  // Place the loop where the footprint actually is on that side: probe the edge at the centre line.
  if ((loop === "left" || loop === "both") && !taken.has("left")) pts.push([edgeX(foot, cy, -1) - d, cy]);
  if ((loop === "right" || loop === "both") && !taken.has("right")) pts.push([edgeX(foot, cy, 1) + d, cy]);
  if ((loop === "top" || loop === "topBottom") && !taken.has("top")) pts.push([cx, edgeY(foot, cx, 1) + d]);
  if ((loop === "bottom" || loop === "topBottom") && !taken.has("bottom")) pts.push([cx, edgeY(foot, cx, -1) - d]);
  return pts;
}

function edgeX(cs: CrossSection, y: number, dir: 1 | -1): number {
  const b = cs.bounds();
  const probe = K().CrossSection.square([b.max[0] - b.min[0] + 2, 0.5], true).translate([(b.min[0] + b.max[0]) / 2, y]);
  const hit = cs.intersect(probe).bounds();
  return dir > 0 ? hit.max[0] : hit.min[0];
}

function edgeY(cs: CrossSection, x: number, dir: 1 | -1): number {
  const b = cs.bounds();
  const probe = K().CrossSection.square([0.5, b.max[1] - b.min[1] + 2], true).translate([x, (b.min[1] + b.max[1]) / 2]);
  const hit = cs.intersect(probe).bounds();
  return dir > 0 ? hit.max[1] : hit.min[1];
}

/** The H-connector joints of a Base. */
export function baseJoints(keys: BaseKey[], opts: BaseOptions, fit: Fit, footprint?: CrossSection): Joint[] {
  return connectorJoints(footprint ?? baseFootprint(keys, opts, fit), keys.flatMap(keySwitches), opts);
}

/** Support-enforcer volumes under a Base's tabs, for the slicer. */
export function baseSupports(keys: BaseKey[], opts: BaseOptions, fit: Fit, footprint?: CrossSection): Manifold[] {
  const foot = footprint ?? baseFootprint(keys, opts, fit);
  const { bottom } = baseLevels(opts, fit);
  return baseJoints(keys, opts, fit, foot)
    .filter((j) => j.role === "tab")
    .map((j) => supportVolume(j, bottom));
}

/** A Base with a skirt room per key and a Switch Pocket per Switch. */
export function buildBase(keys: BaseKey[], opts: BaseOptions, fit: Fit, footprint?: CrossSection): Manifold {
  const { CrossSection, Manifold } = K();
  const { bottom, wallTop } = baseLevels(opts, fit);
  const foot = footprint ?? baseFootprint(keys, opts, fit);
  let body = slab(foot, bottom, wallTop);
  if (opts.texture !== "none") body = applyTexture(body, foot, bottom, wallTop, opts.texture, opts.textureDepth);

  // Keyring loops sit flush with the bottom.
  const holeR = opts.loopHole / 2;
  const loops = loopCentres(foot, opts.loop, holeR, connectorSides(opts));
  for (const c of loops) body = body.add(slab(circle(holeR + 2.4, c), bottom, bottom + opts.loopThickness));

  const joints = baseJoints(keys, opts, fit, foot);
  const tabs = joints.filter((j) => j.role === "tab");
  const sockets = joints.filter((j) => j.role === "socket");
  // Housings and arms out to the joint faces, then the tabs.
  if (joints.length) body = body.add(Manifold.union([...joints.map((j) => padSolid(j, bottom)), ...tabs.map((j) => tabSolid(j, bottom))]));

  const cuts: Manifold[] = [];
  for (const k of keys) {
    // Room above the plate for the cap skirt.
    cuts.push(slab(offset(k.outline, fit.clearance).translate(k.at), 0, wallTop + 1));
    for (const s of keySwitches(k)) {
      // Clip room under the plate for the bottom housing and pins.
      cuts.push(slab(CrossSection.square([fit.clipRoom, fit.clipRoom], true).translate(s), bottom + opts.floor, -fit.plate));
      // The plate cutout.
      cuts.push(slab(CrossSection.square([fit.pocket, fit.pocket], true).translate(s), -fit.plate - 0.5, 0.5));
    }
  }
  for (const c of loops) cuts.push(slab(circle(holeR, c), bottom - 1, wallTop + 1));
  for (const j of sockets) cuts.push(socketCut(j, bottom));
  body = body.subtract(Manifold.union(cuts));
  if (!sockets.length) return body;

  // Socket: the tongue's floor (clipped to the footprint and housings) and its pin, then the slits that free it.
  const footSlab = slab(CrossSection.union([foot, ...sockets.map(padOutline)]), bottom - 1, bottom + 10);
  body = body.add(Manifold.union(sockets.flatMap((j) => [tongueSlab(j, bottom).intersect(footSlab), pinSolid(j, bottom)])));
  return body.subtract(Manifold.union(sockets.map((j) => slitCut(j, bottom, opts.floor))));
}
