// Layer heights and part colours: edits to a picture's per-colour heights and
// per-patch pins and paints, plus picking helpers. No kernel, so the panels and
// preview can use it too (Tag Studio shares it).
import type { LayerHeights, PictureOptions } from "./types.ts";
import type { Pt, Ring } from "../geometry/path.ts";

/** Slider range, mm above the top. 0 is flush. */
export const MAX_HEIGHT = 8;
/** Above this, thin patches can snap: the slider turns amber and a warning shows. */
export const TALL = 4;
/** Make it pop: each patch sits this much higher than the patch around it. */
export const POP_STEP = 0.8;
/** A flush (0 mm) patch is inlaid this deep into the top. */
export const FLUSH_DEPTH = 0.6;

/** One raised patch, as the geometry worker reports it for picking and the panels. */
export type PatchInfo = {
  /** -1 for the picture (Picture kind, Tag Studio); otherwise the key index. */
  owner: number;
  /** Index of its traced colour. */
  layer: number;
  /** A point inside it, 0–1 across the traced picture (y down): where its pin goes. */
  at: [number, number];
  /** The pins that land on it (their `at`). */
  pins: [number, number][];
  /** How many other patches surround it. */
  depth: number;
  /** Its height above the top, mm (0 = flush). */
  h: number;
  /** True when a pin sets its height, rather than its colour. */
  own: boolean;
  /** Its filament. */
  color: string;
  /** The paints that land on it (their `at`). */
  paints: [number, number][];
  /** True when a paint sets its filament, rather than its colour. */
  painted: boolean;
  /** Its top, in the preview's model frame. */
  top: number;
  /** Its footprint, in the preview's model frame (mm). */
  rings: Ring[];
};

/** Signed area: positive for an outer contour (counter-clockwise, y up), negative for a hole. */
export function signedArea(r: Ring): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

export const samePt = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1];

/** Even-odd point-in-polygon over all rings (outer contours and holes). */
export function pointInRings(rings: Ring[], [x, y]: Pt): boolean {
  let inside = false;
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
}

/** The patch under a point of the preview, preferring the one whose top is nearest the hit. */
export function patchAt(patches: PatchInfo[], [x, y, z]: [number, number, number]): PatchInfo | null {
  let best: PatchInfo | null = null;
  for (const p of patches) {
    if (!pointInRings(p.rings, [x, y])) continue;
    if (!best || Math.abs(p.top - z) < Math.abs(best.top - z)) best = p;
  }
  return best;
}

export function emptyHeights(): LayerHeights {
  return { colour: [], pins: [] };
}

const round = (h: number) => Math.round(Math.min(MAX_HEIGHT, Math.max(0, h)) * 10) / 10;

type Spot = { at: [number, number] };

/** `spots` without those on these patches. Safe with a stale build: spots are matched by position. */
function without<T extends Spot>(spots: T[], patches: (Spot & { landed: [number, number][] })[]): T[] {
  return spots.filter((s) => !patches.some((p) => samePt(s.at, p.at) || p.landed.some((q) => samePt(q, s.at))));
}

function dropPins(hs: LayerHeights, patches: Pick<PatchInfo, "at" | "pins">[]) {
  hs.pins = without(hs.pins, patches.map((p) => ({ at: p.at, landed: p.pins })));
}

function dropPaints(hs: LayerHeights, patches: Pick<PatchInfo, "at" | "paints">[]) {
  hs.paints = without(hs.paints ?? [], patches.map((p) => ({ at: p.at, landed: p.paints })));
}

/** Gives these patches their own height. */
export function setPatchHeights(hs: LayerHeights, patches: Pick<PatchInfo, "at" | "pins">[], h: number) {
  dropPins(hs, patches);
  for (const p of patches) hs.pins.push({ at: [p.at[0], p.at[1]], h: round(h) });
}

/** These patches follow their colour again. */
export function resetPatches(hs: LayerHeights, patches: Pick<PatchInfo, "at" | "pins">[]) {
  dropPins(hs, patches);
}

/** Gives these patches their own filament. */
export function setPatchColours(hs: LayerHeights, patches: Pick<PatchInfo, "at" | "paints">[], color: string) {
  dropPaints(hs, patches);
  for (const p of patches) hs.paints!.push({ at: [p.at[0], p.at[1]], color });
}

/** These patches follow their colour again. */
export function resetPatchColours(hs: LayerHeights, patches: Pick<PatchInfo, "at" | "paints">[]) {
  dropPaints(hs, patches);
}

/** The filaments painted onto patches. */
export function paintColours(hs: LayerHeights | undefined): string[] {
  return (hs?.paints ?? []).map((p) => p.color);
}

/** Traced colours where every patch has its own filament, so the colour's filament goes unused. */
export function emptiedLayers(patches: Pick<PatchInfo, "layer" | "painted">[]): number[] {
  const layers = [...new Set(patches.map((p) => p.layer))];
  return layers.filter((l) => patches.every((p) => p.layer !== l || p.painted)).sort((a, b) => a - b);
}

export function setColourHeight(hs: LayerHeights, layer: number, h: number) {
  while (hs.colour.length <= layer) hs.colour.push(null);
  hs.colour[layer] = round(h);
}

/** A colour's height, or the default when it has none. */
export function colourHeight(hs: LayerHeights | undefined, layer: number, def: number): number {
  return hs?.colour[layer] ?? def;
}

/**
 * Suggested depth: patches surrounded by others (eyes in a face, pupils in
 * eyes) step up by POP_STEP per level, capped at TALL. Outermost patches
 * follow their colour, so the colour heights still move the background.
 */
export function makeItPop(hs: LayerHeights, patches: Pick<PatchInfo, "at" | "depth">[], base: number) {
  hs.colour = [];
  hs.pins = patches.filter((p) => p.depth > 0).map((p) => ({ at: [p.at[0], p.at[1]], h: round(Math.min(TALL, base + POP_STEP * p.depth)) }));
}

export function flatten(hs: LayerHeights) {
  hs.colour = [];
  hs.pins = [];
}

/** True when any height differs from the default. */
export function hasHeights(hs: LayerHeights | undefined): boolean {
  return Boolean(hs && (hs.pins.length || hs.colour.some((c) => c !== null && c !== undefined)));
}

type Crop = PictureOptions["crop"];

/** Size of the canvas holding the image rotated by `deg` (as the crop dialog draws it). */
function rotatedSize(w: number, h: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [Math.round(Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))), Math.round(Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a)))];
}

/** A point of the cropped picture (0–1) -> source image pixels. */
function toSource([u, v]: [number, number], c: Crop, w: number, h: number): Pt {
  const [cw, ch] = rotatedSize(w, h, c.rotate);
  const qx = (c.x + u * c.w) * cw - cw / 2, qy = (c.y + v * c.h) * ch - ch / 2;
  const a = (-c.rotate * Math.PI) / 180;
  return [qx * Math.cos(a) - qy * Math.sin(a) + w / 2, qx * Math.sin(a) + qy * Math.cos(a) + h / 2];
}

/** Source image pixels -> a point of the cropped picture (0–1). */
function fromSource([px, py]: Pt, c: Crop, w: number, h: number): [number, number] {
  const [cw, ch] = rotatedSize(w, h, c.rotate);
  const a = (c.rotate * Math.PI) / 180;
  const x = px - w / 2, y = py - h / 2;
  const qx = x * Math.cos(a) - y * Math.sin(a) + cw / 2, qy = x * Math.sin(a) + y * Math.cos(a) + ch / 2;
  return [(qx / cw - c.x) / c.w, (qy / ch - c.y) / c.h];
}

/** Moves pins to a new crop of the same `w` × `h` image; pins cropped away are dropped. */
export function remapPins<T extends Spot>(pins: T[], from: Crop, to: Crop, w: number, h: number): T[] {
  return pins
    .map((p) => ({ ...p, at: fromSource(toSource(p.at, from, w, h), to, w, h) }))
    .filter((p) => p.at.every((v) => v >= 0 && v <= 1));
}

/** Moves a picture's pins and paints to a new crop of the same `w` × `h` image. */
export function remapHeights(hs: LayerHeights, from: Crop, to: Crop, w: number, h: number) {
  hs.pins = remapPins(hs.pins, from, to, w, h);
  if (hs.paints) hs.paints = remapPins(hs.paints, from, to, w, h);
}
