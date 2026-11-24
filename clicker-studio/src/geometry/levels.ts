// Heights of a Base and its keyring loop, in the plate frame. No kernel code, so the page can use it.
import type { BaseOptions } from "../design/types.ts";
import { capHeights, type Fit } from "./switch.ts";

export function baseLevels(opts: BaseOptions, fit: Fit) {
  const bottom = -(fit.plate + fit.under + opts.floor);
  const wallTop = capHeights(fit).skirtBottom + opts.rimRise;
  return { bottom, wallTop };
}

/** The most a keyring loop can rise off the underside, mm: its top then meets the rim. */
export function loopRange(opts: BaseOptions, fit: Fit): number {
  const { bottom, wallTop } = baseLevels(opts, fit);
  return Math.max(0, wallTop - bottom - opts.loopThickness);
}

/** How far a Base's keyring loop sits above the underside, mm. */
export function loopLift(opts: BaseOptions, fit: Fit): number {
  return (loopRange(opts, fit) * Math.min(100, Math.max(0, opts.loopHeight))) / 100;
}
