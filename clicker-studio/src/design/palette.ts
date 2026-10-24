// The owner's filament colours (filaments.json) and preset colour pairs.
import data from "../../filaments.json";

export type Filament = { hex: string; en: string; th: string };

export const FILAMENTS: Filament[] = data.filaments;

export function filamentName(hex: string, lang: "en" | "th"): string {
  const f = FILAMENTS.find((x) => x.hex.toUpperCase() === hex.toUpperCase());
  return f ? f[lang] : hex.toUpperCase();
}

/** Nearest stocked filament to any colour (for traced pictures). */
export function nearestFilament(hex: string): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = rgb(hex);
  let best = FILAMENTS[0].hex, d = Infinity;
  for (const f of FILAMENTS) {
    const [r2, g2, b2] = rgb(f.hex);
    // Weighted RGB distance; close enough for picking a spool.
    const dd = 2 * (r - r2) ** 2 + 4 * (g - g2) ** 2 + 3 * (b - b2) ** 2;
    if (dd < d) (d = dd), (best = f.hex);
  }
  return best;
}

const hex = (en: string) => FILAMENTS.find((f) => f.en === en)?.hex ?? "#FFFFFF";

/** Preset pairs: first = Base and Decoration, second = cap. */
export const PAIRS: [string, string][] = [
  ["Blue", "Sky Blue"],
  ["Pink", "Sakura Pink"],
  ["Black", "White"],
  ["Green", "Lime"],
  ["Purple", "Lilac"],
  ["Red", "Black"],
  ["Orange", "Yellow"],
  ["Sky Blue", "Blue"],
  ["Navy", "Ivory"],
  ["Brown", "Beige"],
  ["Mint", "White"],
  ["Lilac", "Purple"],
  ["Yellow", "Orange"],
  ["White", "Pink"],
  ["Grey", "Light Grey"],
  ["Sakura Pink", "White"],
  ["Black", "Yellow"],
  ["Blue", "White"],
  ["Green", "Ivory"],
  ["Red", "White"],
].map(([a, b]) => [hex(a), hex(b)]);
