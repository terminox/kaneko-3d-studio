// Text -> outline rings, shaped with HarfBuzz so Thai marks, Korean and Chinese
// render correctly. Fonts are loaded by name through a FontSource.
import * as hb from "harfbuzzjs";
import { mapRings, pathToRings, type Ring } from "../geometry/path.ts";

/** Returns the bytes of a font, such as "Kanit-700" -> Kanit-700.ttf. */
export type FontSource = (name: string) => Promise<ArrayBuffer>;

type Loaded = { font: hb.Font; upem: number; ascender: number; descender: number };

const cache = new Map<string, Promise<Loaded>>();

function load(source: FontSource, name: string): Promise<Loaded> {
  let p = cache.get(name);
  if (!p) {
    p = source(name).then((data) => {
      const face = new hb.Face(new hb.Blob(data));
      const font = new hb.Font(face);
      const ext = font.hExtents();
      return { font, upem: face.upem, ascender: ext.ascender, descender: ext.descender };
    });
    cache.set(name, p);
    p.catch(() => cache.delete(name));
  }
  return p;
}

/** Fonts for scripts the chosen font may not cover, tried in order per character. */
export const FALLBACKS = ["Kanit-700", "NotoSansKR-700", "NotoSansSC-700", "NotoEmoji-700"];

function covers(font: hb.Font, ch: string): boolean {
  const buf = new hb.Buffer();
  buf.addText(ch);
  buf.guessSegmentProperties();
  hb.shape(font, buf);
  return buf.getGlyphInfos().every((g) => g.codepoint !== 0);
}

/** Splits text into runs that one font can draw, falling back per character. */
async function runs(source: FontSource, fontName: string, text: string): Promise<{ font: Loaded; text: string }[]> {
  const main = await load(source, fontName);
  const out: { font: Loaded; text: string }[] = [];
  // Keep grapheme clusters together so Thai marks stay with their base.
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const { segment } of seg.segment(text)) {
    let use = main;
    if (!covers(main.font, segment)) {
      for (const name of FALLBACKS) {
        if (name === fontName) continue;
        try {
          const f = await load(source, name);
          if (covers(f.font, segment)) {
            use = f;
            break;
          }
        } catch {
          // Missing fallback font: skip it.
        }
      }
    }
    const last = out[out.length - 1];
    if (last && last.font === use) last.text += segment;
    else out.push({ font: use, text: segment });
  }
  return out;
}

/**
 * Shapes one or more lines of text. Returns rings in mm with the text's
 * cap-height set to `height`, centred on the origin, y up.
 */
export async function textRings(source: FontSource, fontName: string, text: string, height = 10, lineGap = 1.15): Promise<Ring[]> {
  const lines = text.split("\n");
  const all: Ring[] = [];
  const lineBoxes: { minX: number; maxX: number }[] = [];
  for (let li = 0; li < lines.length; li++) {
    let pen = 0;
    const lineRings: Ring[] = [];
    for (const run of await runs(source, fontName, lines[li])) {
      const { font, upem } = run.font;
      const s = height / (upem * 0.7);
      const buf = new hb.Buffer();
      buf.addText(run.text);
      buf.guessSegmentProperties();
      hb.shape(font, buf);
      const infos = buf.getGlyphInfos();
      const pos = buf.getGlyphPositions();
      for (let i = 0; i < infos.length; i++) {
        const d = font.glyphToPath(infos[i].codepoint);
        if (d) {
          const ox = pen + pos[i].xOffset;
          const oy = pos[i].yOffset;
          const y0 = -li * height * lineGap * 1.4;
          lineRings.push(...mapRings(pathToRings(d, upem / 400), ([x, y]) => [(x + ox) * s, (y + oy) * s + y0]));
        }
        pen += pos[i].xAdvance;
      }
    }
    let minX = Infinity, maxX = -Infinity;
    for (const r of lineRings) for (const [x] of r) (minX = Math.min(minX, x)), (maxX = Math.max(maxX, x));
    lineBoxes.push({ minX, maxX });
    // Centre each line horizontally.
    const cx = isFinite(minX) ? (minX + maxX) / 2 : 0;
    all.push(...mapRings(lineRings, ([x, y]) => [x - cx, y]));
  }
  return all;
}
