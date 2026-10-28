// Fonts for Bun (CLI and tests), read from disk.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const FONT_DIRS = [join(ROOT, "public/fonts"), join(ROOT, "../clicker-studio/public/fonts")];

export async function nodeFont(name: string): Promise<ArrayBuffer> {
  for (const dir of FONT_DIRS) {
    try {
      const b = await readFile(join(dir, `${name}.ttf`));
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    } catch {}
  }
  throw new Error(`Font ${name} not found (run bun run setup)`);
}
