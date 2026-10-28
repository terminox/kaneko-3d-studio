// Gets the fonts Tag Studio needs at runtime but doesn't commit: the same
// Google Fonts as Clicker Studio (Thai, Korean, Chinese, emoji included).
// Copies them from ../clicker-studio/public/fonts when they are there, else
// downloads them. Safe to re-run.
//   bun run setup
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const FONTS = join(ROOT, "public/fonts");
const CLICKER_FONTS = join(ROOT, "../clicker-studio/public/fonts");
const CONFIG = join(ROOT, "../clicker-studio/scripts/fonts.config.json");

// Google Fonts serves plain TrueType to clients that can't take WOFF2.
const UA = "Wget/1.21";

type FontEntry = { family: string; weight: number; script: string };
type FontInfo = { name: string; label: string; script: string };

const fontName = (f: { family: string; weight: number }) => `${f.family.replace(/\s+/g, "")}-${f.weight}`;

mkdirSync(FONTS, { recursive: true });
const config = JSON.parse(readFileSync(CONFIG, "utf8")) as { families: FontEntry[] };
const manifest: FontInfo[] = [];
for (const f of config.families) {
  const name = fontName(f);
  const file = join(FONTS, `${name}.ttf`);
  if (!existsSync(file)) {
    const shared = join(CLICKER_FONTS, `${name}.ttf`);
    if (existsSync(shared)) copyFileSync(shared, file);
    else {
      const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family)}:wght@${f.weight}`, { headers: { "User-Agent": UA } })).text();
      const url = css.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
      if (!url) throw new Error(`No TTF for ${f.family} ${f.weight}`);
      process.stdout.write(`${name}… `);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
      writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
    }
  }
  manifest.push({ name, label: f.weight >= 700 && f.weight !== 400 ? `${f.family} ${f.weight === 700 ? "Bold" : f.weight}` : f.family, script: f.script });
}
writeFileSync(join(FONTS, "fonts.json"), JSON.stringify(manifest, null, 1));
console.log(`${manifest.length} fonts`);
