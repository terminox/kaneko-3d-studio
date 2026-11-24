// Moving Switches by hand: what the flat map, the 3D handles, the arrow keys
// and the number boxes all call.
import { middle, nearestSpot, resolveSpots, spotFits, toShare, type Place, type Pt } from "../geometry/spots.ts";
import { changed, state } from "./state.ts";

/** The last build's placement, when this Design's Switches can be moved. */
export function movable(): Place | null {
  const { kind, parts } = state.design;
  return (kind === "cap" || kind === "picture" || kind === "model") && parts !== "az-set" ? (state.build?.place ?? null) : null;
}

export const hasRoom = (p: Place) => p.ok.data.includes(1);

/** Where the Switches are now, ahead of a build still running. */
export function spotsNow(place: Place): Pt[] {
  const s = state.design.cap.spots;
  return (s?.length && resolveSpots(place, s)) || place.at;
}

export const selectedIndex = (n: number) => Math.min(state.selectedSwitch, n - 1);

/** Moves Switch `i` to the nearest spot to `p` (cap-local) where it fits; this pins every Switch. */
export function moveSwitch(i: number, p: Pt) {
  const place = movable();
  if (!place) return;
  const at = spotsNow(place);
  if (!at[i]) return;
  const q = nearestSpot(place, at.filter((_, k) => k !== i), p);
  if (!q) return;
  state.design.cap.spots = at.map((a, k) => toShare(place, k === i ? q : a));
  changed();
}

/** Moves the selected Switch by a step. A step onto a spot where it doesn't fit does nothing. */
export function stepSwitch(dx: number, dy: number) {
  const place = movable();
  if (!place) return;
  const at = spotsNow(place);
  const i = selectedIndex(at.length);
  const others = at.filter((_, k) => k !== i);
  const p: Pt = [at[i][0] + dx, at[i][1] + dy];
  if (spotFits(place, others, p) || !spotFits(place, others, at[i])) moveSwitch(i, p);
}

/** Moves the selected Switch to `mm` from the cap's middle along one axis. */
export function setSwitchAxis(axis: 0 | 1, mm: number) {
  const place = movable();
  if (!place || !Number.isFinite(mm)) return;
  const at = spotsNow(place);
  const i = selectedIndex(at.length);
  const p: Pt = [...at[i]];
  p[axis] = middle(place)[axis] + mm;
  moveSwitch(i, p);
}

const ARROWS: Record<string, Pt> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };

/** Handles an arrow key (0.5 mm, 0.1 mm with Shift). */
export function arrowKey(e: KeyboardEvent) {
  const dir = ARROWS[e.key];
  if (!dir || e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  e.stopPropagation();
  const s = e.shiftKey ? 0.1 : 0.5;
  stepSwitch(dir[0] * s, dir[1] * s);
}
