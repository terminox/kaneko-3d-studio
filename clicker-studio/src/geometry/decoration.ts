// Decorations -> coloured 2D layers, fitted into the flat top of a cap.
import type { Key } from "../design/types.ts";
import type { FontSource } from "../text/shape.ts";
import { textRings } from "../text/shape.ts";
import { K, type CrossSection } from "./kernel.ts";
import { offset, rings } from "./outline.ts";
import { mapRings, pathToRings, type Ring } from "./path.ts";
import { SYMBOLS, symbol, type SymbolName } from "./symbols.ts";
import { patchRef, tracedPatches, type PatchRef } from "./patches.ts";

/** An icon as SVG path data in its own viewBox (y down). */
export type IconData = { paths: string[]; viewBox: [number, number, number, number] };

/** A traced image: rings per colour in image units (y down), plus its outline. */
export type Traced = {
  width: number;
  height: number;
  layers: { color: string; rings: Ring[] }[];
  outline: Ring[];
  /** Where the Switch goes (image px); the outline's centre when absent. */
  anchor?: [number, number];
};

export type Assets = {
  font: FontSource;
  icon: (id: string) => Promise<IconData>;
  traced: Record<string, Traced>;
};

/** A coloured area on a cap top. Picture patches carry their own height (mm; 0 = flush) and where they came from. */
export type Layer = { cs: CrossSection; color: string; h?: number; patch?: PatchRef };

/** Scales and centres layers so their union fits a `w` × `h` box. */
export function fitLayers(layers: Layer[], w: number, h: number): Layer[] {
  if (!layers.length) return layers;
  const all = K().CrossSection.union(layers.map((l) => l.cs));
  const b = all.bounds();
  const bw = b.max[0] - b.min[0], bh = b.max[1] - b.min[1];
  if (bw <= 0 || bh <= 0) return [];
  const s = Math.min(w / bw, h / bh);
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  return layers.map((l) => ({ ...l, cs: l.cs.translate([-cx, -cy]).scale(s) }));
}

/** Image units (y down) -> mm-agnostic units (y up). */
export function flipY(rs: Ring[]): Ring[] {
  return mapRings(rs, ([x, y]) => [x, -y]);
}

/** The raw (unfitted) colour layers of a key's Decoration. */
export async function decorationLayers(key: Key, assets: Assets): Promise<Layer[]> {
  const d = key.deco;
  switch (d.type) {
    case "none":
      return [];
    case "text": {
      if (!d.text.trim()) return [];
      return [{ cs: rings(await textRings(assets.font, d.font, d.text)), color: key.decoColor }];
    }
    case "emoji":
      return [{ cs: rings(await textRings(assets.font, "NotoEmoji-700", d.emoji)), color: key.decoColor }];
    case "icon": {
      if (d.icon.startsWith("symbol:")) {
        const name = d.icon.slice(7) as SymbolName;
        if (!SYMBOLS.includes(name)) return [];
        return [{ cs: symbol(name, 10), color: key.decoColor }];
      }
      const icon = await assets.icon(d.icon);
      const rs = flipY(icon.paths.flatMap((p) => pathToRings(p, 0.02)));
      return [{ cs: rings(rs, "NonZero"), color: key.decoColor }];
    }
    case "image": {
      const t = assets.traced[d.image];
      if (!t) return [];
      return tracedPatches(t, d.heights).map((p) => ({ cs: p.cs, color: t.layers[p.layer].color, h: p.h, patch: patchRef(p) }));
    }
  }
}

/** Rings around the union of the layers: [inner ring, outer ring]. */
export function outlineRings(layers: Layer[], width: number, count: 0 | 1 | 2): CrossSection[] {
  if (!count || !layers.length) return [];
  const all = K().CrossSection.union(layers.map((l) => l.cs));
  const r1 = offset(all, width).subtract(all);
  if (count === 1) return [r1];
  const r2 = offset(all, 2 * width).subtract(offset(all, width));
  return [r1, r2];
}

/** Reads the path data and viewBox of a simple icon SVG. */
export function parseIconSvg(svg: string): IconData {
  const vb = (svg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 256 256").split(/[\s,]+/).map(Number) as IconData["viewBox"];
  const paths = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  return { paths, viewBox: vb };
}
