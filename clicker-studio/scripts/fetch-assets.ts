// Downloads what Clicker Studio needs at runtime but doesn't commit: the
// bundled Google Fonts and the Phosphor "fill" icons. Safe to re-run.
//   bun run setup
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const FONTS = join(ROOT, "public/fonts");
const ICONS = join(ROOT, "public/icons");

// Google Fonts serves plain TrueType to clients that can't take WOFF2.
const UA = "Wget/1.21";

type FontEntry = { family: string; weight: number; script: string };
export type FontInfo = { name: string; label: string; script: string };

export function fontName(f: { family: string; weight: number }): string {
  return `${f.family.replace(/\s+/g, "")}-${f.weight}`;
}

async function fetchFonts() {
  mkdirSync(FONTS, { recursive: true });
  const config = JSON.parse(readFileSync(join(import.meta.dir, "fonts.config.json"), "utf8")) as { families: FontEntry[] };
  const manifest: FontInfo[] = [];
  for (const f of config.families) {
    const name = fontName(f);
    const file = join(FONTS, `${name}.ttf`);
    if (!existsSync(file)) {
      const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family)}:wght@${f.weight}`, { headers: { "User-Agent": UA } })).text();
      const url = css.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
      if (!url) throw new Error(`No TTF for ${f.family} ${f.weight}`);
      process.stdout.write(`${name}… `);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
      writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
    }
    manifest.push({ name, label: f.weight >= 700 && f.weight !== 400 ? `${f.family} ${f.weight === 700 ? "Bold" : f.weight}` : f.family, script: f.script });
  }
  writeFileSync(join(FONTS, "fonts.json"), JSON.stringify(manifest, null, 1));
  console.log(`\n${manifest.length} fonts`);
}

function copyIcons() {
  // Phosphor Icons (MIT): the filled weight prints as solid shapes.
  const src = join(ROOT, "node_modules/@phosphor-icons/core/assets/fill");
  mkdirSync(ICONS, { recursive: true });
  const names: string[] = [];
  for (const f of readdirSync(src)) {
    if (!f.endsWith("-fill.svg")) continue;
    const name = f.slice(0, -"-fill.svg".length);
    copyFileSync(join(src, f), join(ICONS, `${name}.svg`));
    names.push(name);
  }
  names.sort();
  writeFileSync(join(ICONS, "icons.json"), JSON.stringify(names));
  console.log(`${names.length} icons`);
}

if (import.meta.main) {
  await fetchFonts();
  copyIcons();
}
