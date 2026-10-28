// App state: the Tag Design being edited and view settings. Changes call
// `changed()` (rebuild geometry) or `rerender()` (rebuild the panels too).
import type { Traced } from "@cs/geometry/decoration.ts";
import { newTagDesign, upgradeTag, type TagDesign } from "../design/types.ts";
import type { BuildReply } from "../worker.ts";
import type { Lang } from "../i18n/strings.ts";
import { samePt, type PatchInfo } from "@cs/design/heights.ts";

export type View = "tag" | "plate";

/** A picked picture patch, by its point (see PatchInfo). */
export type Selected = { owner: number; at: [number, number] };

export type State = {
  design: TagDesign;
  /** Index into the Design's tag names of the tag in the preview. */
  preview: number;
  lang: Lang;
  view: View;
  /** Derived from the Design's picture; rebuilt on load. */
  traced: Record<string, Traced>;
  build: BuildReply | null;
  status: string;
  error: string;
  cartoonEnabled: boolean;
  /** Patches picked in the preview, for their own height. */
  selected: Selected[];
};

const STORE = "tag-studio:v1";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${STORE}:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(`${STORE}:${key}`, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the session still works, it just won't be remembered.
  }
}

export const state: State = {
  design: upgradeTag(load("design", newTagDesign())),
  preview: 0,
  lang: load("lang", "th"),
  view: "tag",
  traced: {},
  build: null,
  status: "",
  error: "",
  cartoonEnabled: false,
  selected: [],
};

/** geometry: rebuild the model · panels: re-render and rebuild · status: repaint the status line only · selection: re-render the panels and the highlight, no rebuild. */
type Listener = (what: "geometry" | "panels" | "status" | "selection") => void;
const listeners: Listener[] = [];
export function subscribe(fn: Listener) {
  listeners.push(fn);
}

/** Geometry-affecting change: rebuild the model, keep the panels. */
export function changed() {
  save("design", state.design);
  for (const l of listeners) l("geometry");
}

/** Status or warning text changed; nothing to rebuild. */
export function statusChanged() {
  for (const l of listeners) l("status");
}

/** The built patches that are picked. */
export function selectedPatches(): PatchInfo[] {
  return (state.build?.patches ?? []).filter((p) => state.selected.some((s) => s.owner === p.owner && samePt(s.at, p.at)));
}

/** Picked patches changed. */
export function selectionChanged() {
  for (const l of listeners) l("selection");
}

/** Structural change: re-render the panels as well. */
export function rerender() {
  save("design", state.design);
  save("lang", state.lang);
  for (const l of listeners) l("panels");
}
