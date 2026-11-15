// A Design is everything needed to rebuild one Clicker exactly. It is saved as
// `.clicker.json`, with its source images embedded.
import { DEFAULT_FIT, type Fit } from "../geometry/switch.ts";

export type Kind = "cap" | "picture" | "row" | "grid" | "fluted" | "model" | "split";

export type CapShape =
  | "square"
  | "capsule"
  | "circle"
  | "heart"
  | "cloud"
  | "bear"
  | "cat"
  | "flower"
  | "hexagon"
  | "octagon"
  | "keycap";

export type Layout = "row" | "column" | "grid" | "wasd" | "arrows" | "t" | "custom";

export type Texture = "none" | "ribs" | "sawtooth" | "grooves" | "diamond" | "wave" | "dots";

/** Keyring loop sides. "both" is left + right (kept for saved designs); "topBottom" is top + bottom. */
export type Loop = "none" | "left" | "top" | "right" | "bottom" | "both" | "topBottom";

/** A Base side, seen from above: top is +y. */
export type Side = "left" | "right" | "top" | "bottom";

/** What an H-connector side carries (Bubbly-compatible hinge joint, ADR 0011). */
export type End = "none" | "tab" | "socket";

export type Connectors = Record<Side, End>;

/** Which parts get exported. */
export type PartsMode = "cap+base" | "caps" | "base" | "az-set";

/** A patch's own height (mm), remembered by a spot on the traced picture (0–1, y down) so it survives a retrace. */
export type Pin = { at: [number, number]; h: number };

/** A patch's own filament, remembered by a spot on the traced picture like a Pin. */
export type Paint = { at: [number, number]; color: string };

/**
 * A picture's per-patch settings. A patch's height comes from the last pin
 * inside it, else its colour's height, else the default (the Decoration
 * height). Its filament comes from the last paint inside it, else its colour.
 */
export type LayerHeights = { colour: (number | null)[]; pins: Pin[]; paints?: Paint[] };

/** What sits on top of a Top Cap or Keycap. */
export type Decoration =
  | { type: "none" }
  | { type: "text"; text: string; font: string }
  | { type: "icon"; icon: string }
  | { type: "emoji"; emoji: string }
  | { type: "image"; image: string; heights?: LayerHeights };

export type Key = {
  deco: Decoration;
  /** Decoration size, as a share of the cap's top (0.2–1). */
  decoScale: number;
  capColor: string;
  decoColor: string;
  /** 0, 1 or 2 outline rings around the Decoration. */
  outline: 0 | 1 | 2;
  outlineColors: [string, string];
  /** Fluted chain only: this key's own Base colour. */
  baseColor?: string;
};

export type CapOptions = {
  shape: CapShape;
  /** Width of the cap's footprint, mm. */
  size: number;
  /** Total cap height, mm. */
  height: number;
  corner: number;
  /** Rounding of the top edge, mm. */
  topRound: number;
  wall: number;
  /** raised = Decoration stands on top (printed face up); inlay = flush (printed face down). */
  style: "raised" | "inlay";
  decoHeight: number;
  /** Outline ring width, mm. */
  outlineWidth: number;
  /** Picture Designs: cap colour left around the picture, mm. 0 = the picture reaches the edge. */
  border: number;
  /** Switches under a shared cap (cap, picture, model): 0 = as many as its size needs, else 1–4. */
  switches: 0 | 1 | 2 | 3 | 4;
};

export type BaseOptions = {
  shape: "follow" | "circle" | "hexagon";
  /** Wall thickness around the cap. */
  rim: number;
  /** How far the wall rises around the cap skirt. */
  rimRise: number;
  floor: number;
  texture: Texture;
  textureDepth: number;
  loop: Loop;
  loopHole: number;
  loopThickness: number;
  /** Space between neighbouring keys in a Block Clicker. */
  gap: number;
  /** H-connector end on each side. */
  connectors: Connectors;
  /** Fluted chain only: link the Bases with metal jump rings or H-connectors. */
  join: "rings" | "connector";
};

export type PictureOptions = {
  image: string;
  crop: { x: number; y: number; w: number; h: number; rotate: number };
  adjust: { brightness: number; contrast: number; saturation: number };
  removeBackground: boolean;
  bgStrength: number;
  punchHoles: boolean;
  colors: number;
  /** Filament colour given to each traced colour, in cluster order. */
  palette: string[];
  /** Footprint width of the picture cap, mm. */
  width: number;
  /** Use the AI cartoon version of the image when present. */
  useCartoon: boolean;
  /** Per-colour heights, and per-patch heights and filaments. */
  heights?: LayerHeights;
  /** Traced colours with every patch repainted, so their filament isn't used. Derived; the price and order sheet read it. */
  emptied?: number[];
};

export type ModelOptions = {
  /** Embedded STL/OBJ, by image-store id. */
  file: string;
  name: string;
  width: number;
  /** Height the model is cut at, as a share of its height (0 = keep all). Split a model calls it Flat bottom. */
  cut: number;
  rotate: [number, number, number];
};

/** Split a model (ADR 0015): how the uploaded model in `Design.model` is cut into a bottom and a top half. */
export type SplitOptions = {
  /** plug: the top half hangs a plug into a well in the bottom half. plain: a flat seam. */
  style: "plug" | "plain";
  /** Seam height as a share of the model's height (after Flat bottom). null = the best spot, found automatically. */
  at: number | null;
  /** Moves every Switch from where it was placed (mm, x and y). */
  nudge: [number, number];
  /** Solid material kept round every cut, mm. */
  wall: number;
};

export const newSplit = (): SplitOptions => ({ style: "plug", at: null, nudge: [0, 0], wall: 1.6 });

export type Design = {
  version: 1;
  name: string;
  kind: Kind;
  parts: PartsMode;
  /** Keys, one per Switch. A cap/picture/model Design has exactly one. */
  keys: Key[];
  layout: Layout;
  /** Grid columns, for layout "grid". */
  columns: number;
  /** Custom layout: key centres in key units. */
  cells: [number, number][];
  cap: CapOptions;
  base: BaseOptions;
  baseColor: string;
  picture: PictureOptions | null;
  model: ModelOptions | null;
  /** Split a model only. */
  split?: SplitOptions;
  /** Keychain preview: ball chain, cord or nothing. Affects price only. */
  chain: "ball" | "cord" | "none";
  fit: Fit;
  /** Embedded files (images, models) as data URLs, by id. */
  files: Record<string, string>;
  /** Switches the last build placed under the shared cap. Derived; the price and order sheet read it. */
  placedSwitches?: number;
};

export const DEFAULT_KEY: Key = {
  deco: { type: "text", text: "A", font: "Fredoka-700" },
  decoScale: 0.7,
  capColor: "#FFFFFF",
  decoColor: "#6B3FD1",
  outline: 0,
  outlineColors: ["#FFFFFF", "#1E1E1E"],
};

export function newDesign(kind: Kind = "cap"): Design {
  return {
    version: 1,
    name: "Clicker",
    kind,
    parts: "cap+base",
    keys: [structuredClone(DEFAULT_KEY)],
    layout: "row",
    columns: 3,
    cells: [],
    cap: {
      shape: "square",
      size: 18,
      height: 9,
      corner: 2,
      topRound: 0.8,
      wall: 1.2,
      style: "raised",
      decoHeight: 0.8,
      outlineWidth: 1.2,
      border: 1.2,
      switches: 0,
    },
    base: {
      shape: "follow",
      rim: 3,
      rimRise: 2,
      floor: 1.6,
      texture: "none",
      textureDepth: 0.6,
      loop: "right",
      loopHole: 3.5,
      loopThickness: 3,
      gap: 1.6,
      connectors: { left: "none", right: "none", top: "none", bottom: "none" },
      join: "rings",
    },
    baseColor: "#FFFFFF",
    picture: null,
    model: null,
    ...(kind === "split" ? { split: newSplit() } : {}),
    chain: "ball",
    fit: { ...DEFAULT_FIT },
    files: {},
  };
}

/**
 * Base options of a saved Design, with fields added since filled in. Designs
 * saved with the first H-connector (presets "open" / "close" / "double" and a
 * tab side) get the same ends per side.
 */
export function upgradeBase(fresh: BaseOptions, saved: Partial<BaseOptions> & { connector?: string; connectorSide?: "left" | "right" }): BaseOptions {
  const { connector, connectorSide, ...rest } = saved;
  const out: BaseOptions = { ...fresh, ...rest, connectors: { ...fresh.connectors, ...rest.connectors } };
  if (!rest.connectors && connector && connector !== "none") {
    const tab = connectorSide ?? "left";
    const other = tab === "left" ? "right" : "left";
    if (connector === "double") out.connectors = { ...out.connectors, left: "tab", right: "tab" };
    else out.connectors = { ...out.connectors, [tab]: "tab", ...(connector === "open" ? { [other]: "socket" } : {}) };
  }
  return out;
}
