// Fluted chain: one scalloped ("cupcake") Base per key. Neighbours are joined
// with metal jump rings through a small loop on both sides, or with H-connectors
// (ADR 0011): every link has a tab on its left and a socket on its right, the
// last link only the tab, and the first link's tab takes the keyring.
import type { BaseOptions, Design } from "../design/types.ts";
import { K, type CrossSection, type Manifold } from "./kernel.ts";
import { baseSupports, buildBase, baseJoints, type BaseKey } from "./base.ts";
import { circle, offset } from "./outline.ts";
import { stations } from "./texture.ts";
import { jointPitch, type Joint } from "./connector.ts";

/** Link-loop hole for jump rings, mm. */
export const LINK_HOLE = 3;

/** The scalloped footprint around one key. */
export function flutedFootprint(outline: CrossSection, design: Design): CrossSection {
  const body = offset(outline, design.fit.clearance + design.base.rim - 0.6);
  const bumps = stations(body, 3.0).map((st) => circle(1.25, st.p));
  return K().CrossSection.union([body, ...bumps]);
}

/** Distance between neighbouring keys: footprint plus both loops plus a gap, or the joined H-connector pitch. */
export function chainPitch(outline: CrossSection, design: Design): number {
  const foot = flutedFootprint(outline, design);
  if (design.base.join === "connector") return jointPitch(foot, 0);
  const b = foot.bounds();
  const reach = LINK_HOLE + 0.9 + 2.4;
  return b.max[0] - b.min[0] + 2 * reach + 2;
}

/** Base options of link `i` of `n`. */
function linkOptions(design: Design, i: number, n: number): BaseOptions {
  const base = { ...design.base, texture: "none" as const };
  if (design.base.join !== "connector") return { ...base, loop: "both", loopHole: LINK_HOLE, connector: "none" };
  return { ...base, loop: "none", connector: i === n - 1 ? "close" : "open", connectorSide: "left" };
}

export type Link = { m: Manifold; supports: Manifold[]; joints: Joint[] };

export function buildChain(keys: BaseKey[], design: Design): Link[] {
  return keys.map((k, i) => {
    const foot = flutedFootprint(k.outline, design).translate(k.at);
    const opts = linkOptions(design, i, keys.length);
    return {
      m: buildBase([k], opts, design.fit, foot),
      supports: baseSupports([k], opts, design.fit, foot),
      joints: baseJoints([k], opts, design.fit, foot),
    };
  });
}
