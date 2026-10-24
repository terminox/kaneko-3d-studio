// Fluted chain: one scalloped ("cupcake") Base per key, each with a small loop
// on both sides. Neighbours are joined with metal jump rings, the end loops take
// the keyring.
import type { Design } from "../design/types.ts";
import { K, type CrossSection, type Manifold } from "./kernel.ts";
import { buildBase, type BaseKey } from "./base.ts";
import { circle, offset } from "./outline.ts";
import { stations } from "./texture.ts";

/** Link-loop hole for jump rings, mm. */
export const LINK_HOLE = 3;

/** The scalloped footprint around one key. */
export function flutedFootprint(outline: CrossSection, design: Design): CrossSection {
  const body = offset(outline, design.fit.clearance + design.base.rim - 0.6);
  const bumps = stations(body, 3.0).map((st) => circle(1.25, st.p));
  return K().CrossSection.union([body, ...bumps]);
}

/** Distance between neighbouring keys: footprint plus both loops plus a gap. */
export function chainPitch(outline: CrossSection, design: Design): number {
  const b = flutedFootprint(outline, design).bounds();
  const reach = LINK_HOLE + 0.9 + 2.4;
  return b.max[0] - b.min[0] + 2 * reach + 2;
}

export function buildChain(keys: BaseKey[], design: Design): Manifold[] {
  return keys.map((k) => {
    const foot = flutedFootprint(k.outline, design).translate(k.at);
    return buildBase([k], { ...design.base, loop: "both", loopHole: LINK_HOLE, texture: "none" }, design.fit, foot);
  });
}
