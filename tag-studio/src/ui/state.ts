// App state: the Tag Design being edited and view settings. Changes call
// `changed()` (rebuild geometry) or `rerender()` (rebuild the panels too).
import type { Traced } from "@cs/geometry/decoration.ts";
import { newTagDesign, upgradeTag, type TagDesign } from "../design/types.ts";
import type { BuildReply } from "../worker.ts";
import type { Lang } from "../i18n/strings.ts";

export type View = "tag" | "plate";

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
};

/** geometry: rebuild the model · panels: re-render and rebuild · status: repaint the status line only. */
type Listener = (what: "geometry" | "panels" | "status") => void;
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

/** Structural change: re-render the panels as well. */
export function rerender() {
  save("design", state.design);
  save("lang", state.lang);
  for (const l of listeners) l("panels");
}
