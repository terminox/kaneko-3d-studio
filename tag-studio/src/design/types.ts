// A Tag Design is everything needed to rebuild a set of Name Tags exactly: one
// picture and style, and one tag per name. It is saved as `.tag.json`, with
// its source image embedded.
import type { PictureOptions } from "@cs/design/types.ts";

export type NamePosition = "below" | "above" | "left" | "right";
export type LoopSide = "top" | "left" | "right" | "none";

export type TagDesign = {
  version: 1;
  /** Design name, used for file names. */
  name: string;
  /** One tag per name. Empty names are skipped; no names makes one picture-only tag. */
  names: string[];
  font: string;
  /** Capital letter height, mm. */
  textSize: number;
  /** Stroke weight: 1 = the font as drawn, higher = bolder. */
  weight: number;
  /** Letter spacing: below 1 squeezes the letters together. */
  spacing: number;
  position: NamePosition;
  /** Space between the picture and the name, mm. */
  gap: number;
  /** `picture.image` is "" until one is uploaded. */
  picture: PictureOptions;
  plate: {
    /** 2 = a plate with the artwork raised on top; 1 = a flat cut-out, every colour from the bed to `thickness`. */
    layers: 1 | 2;
    thickness: number;
    /** Height of the picture, name and rings above the plate (two layers only). */
    relief: number;
    /** How far the plate reaches past the artwork. With one layer, a flat frame in the plate colour. */
    border: number;
    /** Fill holes inside the outline (inside letters like O, or a punched picture). */
    fillHoles: boolean;
  };
  colours: { plate: string; name: string };
  /** Sticker-style bands around the artwork, inner first. */
  rings: { count: 0 | 1 | 2; width: number; colors: [string, string] };
  loop: {
    side: LoopSide;
    /** Slides the loop along its edge, mm. */
    offset: number;
    hole: number;
    wall: number;
  };
  /** Embedded images as data URLs, by id (`<id>:cartoon` for the AI version). */
  files: Record<string, string>;
};

export function newTagDesign(): TagDesign {
  return {
    version: 1,
    name: "Name tag",
    names: ["Kaneko"],
    font: "Fredoka-700",
    textSize: 10,
    weight: 1,
    spacing: 1,
    position: "below",
    gap: 2,
    picture: {
      image: "",
      crop: { x: 0, y: 0, w: 1, h: 1, rotate: 0 },
      adjust: { brightness: 0, contrast: 0, saturation: 0 },
      removeBackground: true,
      bgStrength: 70,
      punchHoles: false,
      colors: 2,
      palette: [],
      width: 40,
      useCartoon: false,
    },
    plate: { layers: 2, thickness: 3, relief: 1.2, border: 2.5, fillHoles: true },
    colours: { plate: "#FFFFFF", name: "#2F5FB3" },
    rings: { count: 0, width: 1.5, colors: ["#FFFFFF", "#1E1E1E"] },
    loop: { side: "top", offset: 0, hole: 4, wall: 2.5 },
    files: {},
  };
}

/** Fills fields added after a Design was saved. */
export function upgradeTag(d: Partial<TagDesign>): TagDesign {
  const fresh = newTagDesign();
  return {
    ...fresh,
    ...d,
    picture: { ...fresh.picture, ...d.picture },
    plate: { ...fresh.plate, ...d.plate },
    colours: { ...fresh.colours, ...d.colours },
    rings: { ...fresh.rings, ...d.rings },
    loop: { ...fresh.loop, ...d.loop },
    names: Array.isArray(d.names) ? d.names : fresh.names,
    files: d.files ?? {},
  } as TagDesign;
}

/** The names that get a tag: trimmed, non-empty, or one blank tag if there are none. */
export function tagNames(d: TagDesign): string[] {
  const names = d.names.map((n) => n.trim()).filter(Boolean);
  return names.length ? names : [""];
}
