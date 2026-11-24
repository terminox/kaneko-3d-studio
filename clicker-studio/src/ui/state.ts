// App state: the Design being edited, the Order, and view settings. Changes
// call `changed()` (rebuild geometry) or `rerender()` (rebuild the panels too).
import { newDesign, newSplit, upgradeBase, DEFAULT_KEY, type Design, type Kind } from "../design/types.ts";
import { newOrder, type Order } from "../design/order.ts";
import type { Traced } from "../geometry/decoration.ts";
import type { BuildReply } from "../worker.ts";
import type { Lang } from "../i18n/strings.ts";
import { PAIRS } from "../design/palette.ts";
import { samePt, type PatchInfo } from "../design/heights.ts";
import type { Slice, View } from "./viewport.ts";

/** A picked patch: its owner (-1 = the picture, else a key) and its point (see PatchInfo). */
export type Selected = { owner: number; at: [number, number] };

export type State = {
  design: Design;
  selectedKey: number;
  mode: "simple" | "advanced";
  lang: Lang;
  view: View;
  /** How far the Apart view lifts the top parts, mm. */
  apart: number;
  slice: Slice & { on: boolean };
  showSwitch: boolean;
  order: Order;
  /** Index in the Order of the item being edited, if any. */
  editing: number | null;
  /** Derived from the Design's images; rebuilt on load. */
  traced: Record<string, Traced>;
  build: BuildReply | null;
  status: string;
  error: string;
  cartoonEnabled: boolean;
  /** Order export: one-colour pieces on plates of their own colour. */
  byColour: boolean;
  /** Patches picked in the preview, for their own height. */
  selected: Selected[];
  /** Handles over the 3D preview, for moving Switches. */
  moveSwitches: boolean;
  /** The Switch the arrows and number boxes move. */
  selectedSwitch: number;
  /** Split a model: grow a just-uploaded model to the smallest size that fits a switch, once its first build says what that is. */
  fitOnBuild: boolean;
};

const STORE = "clicker-studio:v1";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${STORE}:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(`${STORE}:${key}`, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the session still works, it just won't be remembered.
  }
}

export const state: State = {
  design: upgrade(load("design", newDesign("cap"))),
  selectedKey: 0,
  mode: load("mode", "simple"),
  lang: load("lang", "th"),
  view: "assembled",
  apart: 16,
  slice: { on: false, axis: "y", at: 0.5 },
  showSwitch: false,
  order: load("order", newOrder()),
  editing: null,
  traced: {},
  build: null,
  status: "",
  error: "",
  cartoonEnabled: false,
  byColour: true,
  selected: [],
  moveSwitches: false,
  selectedSwitch: 0,
  fitOnBuild: false,
};

/** Fills fields added after a Design was saved. */
export function upgrade(d: Design): Design {
  const fresh = newDesign(d.kind ?? "cap");
  return {
    ...fresh,
    ...d,
    cap: { ...fresh.cap, ...d.cap },
    base: upgradeBase(fresh.base, d.base ?? {}),
    fit: { ...fresh.fit, ...d.fit },
    keys: (d.keys?.length ? d.keys : fresh.keys).map((k) => ({ ...DEFAULT_KEY, ...k })),
    files: d.files ?? {},
    ...(d.kind === "split" ? { split: { ...newSplit(), ...d.split } } : {}),
  };
}

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
  save("order", state.order);
  save("mode", state.mode);
  save("lang", state.lang);
  for (const l of listeners) l("panels");
}

/** Starting values when the owner switches kind, keeping colours where it makes sense. */
export function switchKind(kind: Kind) {
  const old = state.design;
  const d = newDesign(kind);
  d.fit = old.fit;
  d.baseColor = old.baseColor;
  const proto = { ...old.keys[0] };
  if (kind === "row" || kind === "fluted") {
    d.keys = [..."MAA"].map((ch) => ({ ...proto, deco: { type: "text", text: ch, font: fontOf(proto) } }));
    if (kind === "fluted") d.cap.corner = 4;
  } else if (kind === "grid") {
    d.layout = "grid";
    d.columns = 3;
    const decos = ["symbol:heart", "symbol:flower", "symbol:star", "symbol:sparkle", "symbol:heart", "symbol:flower", "symbol:star", "symbol:sparkle", "symbol:heart"];
    d.keys = decos.map((icon, i) => ({ ...proto, deco: { type: "icon", icon }, capColor: [PAIRS[4][0], "#FFFFFF", PAIRS[6][1]][i % 3], decoColor: i % 3 === 1 ? PAIRS[4][0] : "#FFFFFF" }));
    d.base.loop = "right";
  } else if (kind === "picture") {
    d.keys = [{ ...proto, deco: { type: "none" }, capColor: "#FFFFFF" }];
    d.cap.style = "inlay";
    d.cap.topRound = 0.6;
    d.cap.border = 1;
    d.base.shape = "follow";
    d.picture = {
      image: "",
      crop: { x: 0, y: 0, w: 1, h: 1, rotate: 0 },
      adjust: { brightness: 0, contrast: 0, saturation: 0 },
      removeBackground: true,
      bgStrength: 70,
      punchHoles: false,
      colors: 3,
      palette: [],
      width: 40,
      useCartoon: false,
    };
  } else if (kind === "model" || kind === "split") {
    d.keys = [{ ...proto, deco: { type: "none" } }];
    // 3D model and Split a model share the upload, so it carries over (sized for the new kind).
    if (old.model && old.files[old.model.file]) {
      const [lo, hi] = kind === "split" ? [25, 150] : [20, 80];
      d.model = { ...old.model, width: Math.min(hi, Math.max(lo, old.model.width)) };
      d.files = { [old.model.file]: old.files[old.model.file] };
    }
  } else {
    d.keys = [proto];
  }
  if (old.userFonts?.length) {
    d.userFonts = old.userFonts;
    for (const f of old.userFonts) d.files[f.id] = old.files[f.id];
  }
  state.design = d;
  state.selectedKey = 0;
  state.moveSwitches = false;
  state.selectedSwitch = 0;
  state.traced = {};
  state.selected = [];
}

function fontOf(k: Design["keys"][number]): string {
  return k.deco.type === "text" ? k.deco.font : "Fredoka-700";
}
