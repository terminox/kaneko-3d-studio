// Assets for Bun (CLI and tests): fonts and icons from disk.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseIconSvg, type Assets, type IconData } from "../src/geometry/decoration.ts";
import { fontSource } from "../src/text/font-source.ts";

const ROOT = join(import.meta.dir, "..");
const FONT_DIRS = [join(ROOT, "public/fonts"), join(ROOT, "../model-maker/public/fonts")];

export async function nodeFont(name: string): Promise<ArrayBuffer> {
  for (const dir of FONT_DIRS) {
    try {
      const b = await readFile(join(dir, `${name}.ttf`));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    } catch {}
  }
  throw new Error(`Font ${name} not found (run bun run setup)`);
}

export async function nodeIcon(id: string): Promise<IconData> {
  const svg = await readFile(join(ROOT, "public/icons", `${id}.svg`), "utf8");
  return parseIconSvg(svg);
}

/** `files`: a Design's files, so fonts the owner imported resolve too. */
export function nodeAssets(files: Record<string, string> = {}): Assets {
  return { font: fontSource(files, nodeFont), icon: nodeIcon, traced: {} };
}
