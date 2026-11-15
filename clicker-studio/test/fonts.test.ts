import { beforeAll, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadKernel } from "../src/geometry/kernel.ts";
import { textRings } from "../src/text/shape.ts";
import { fontSource } from "../src/text/font-source.ts";
import { nodeFont } from "../scripts/node-assets.ts";
import { ringsBounds } from "../src/geometry/path.ts";
import { clean } from "../src/design/clean.ts";
import { newDesign } from "../src/design/types.ts";

beforeAll(async () => {
  await loadKernel();
});

async function imported(name: string, id: string) {
  const b = await readFile(join(import.meta.dir, "../public/fonts", `${name}.ttf`));
  return fontSource({ [id]: `data:font/ttf;base64,${b.toString("base64")}` }, nodeFont);
}

test("an imported font shapes the same glyphs as the bundled one", async () => {
  const source = await imported("Kanit-700", "font-a");
  const mine = ringsBounds(await textRings(source, "font-a", "ที่นี่ Aa", 10));
  const bundled = ringsBounds(await textRings(nodeFont, "Kanit-700", "ที่นี่ Aa", 10));
  expect(mine).toEqual(bundled);
});

test("characters an imported Latin font lacks still fall back", async () => {
  const source = await imported("Anton-400", "font-b");
  const latin = ringsBounds(await textRings(source, "font-b", "ABC", 10));
  const mixed = ringsBounds(await textRings(source, "font-b", "ABC กขค 한글 中文", 10));
  expect(mixed.w).toBeGreaterThan(latin.w * 2);
});

test("an imported font missing from the Design files is an error, not a silent swap", async () => {
  const source = fontSource({}, nodeFont);
  await expect(textRings(source, "font-gone", "A")).rejects.toThrow(/missing/);
});

test("the worker's copy of a Design keeps imported fonts and models but not images", () => {
  const d = newDesign("cap");
  d.files = { "font-a": "data:font/ttf;base64,AA==", "model-1": "data:;base64,AA==", "img-1": "data:image/png;base64,AA==" };
  expect(Object.keys(clean(d).files).sort()).toEqual(["font-a", "model-1"]);
});
