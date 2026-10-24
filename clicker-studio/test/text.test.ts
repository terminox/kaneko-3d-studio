import { beforeAll, expect, test } from "bun:test";
import { loadKernel } from "../src/geometry/kernel.ts";
import { textRings } from "../src/text/shape.ts";
import { rings } from "../src/geometry/outline.ts";
import { ringsBounds } from "../src/geometry/path.ts";
import { decorationLayers } from "../src/geometry/decoration.ts";
import { DEFAULT_KEY } from "../src/design/types.ts";
import { nodeFont } from "../scripts/node-assets.ts";
import { assets } from "./helpers.ts";

beforeAll(async () => {
  await loadKernel();
});

for (const [label, font, text] of [
  ["latin", "Fredoka-700", "Miyu"],
  ["thai with stacked marks", "Kanit-700", "ที่นี่"],
  ["korean", "NotoSansKR-700", "한글"],
  ["chinese", "NotoSansSC-700", "中文"],
] as const) {
  test(`${label} text makes a solid outline`, async () => {
    const rs = await textRings(nodeFont, font, text, 10);
    const cs = rings(rs);
    expect(cs.area()).toBeGreaterThan(10);
    const b = ringsBounds(rs);
    expect(b.w).toBeGreaterThan(5);
  });
}

test("characters the font lacks fall back to a font that has them", async () => {
  // Fredoka has no Thai or Hangul.
  const cs = rings(await textRings(nodeFont, "Fredoka-700", "A ก 가"));
  expect(cs.decompose().length).toBeGreaterThanOrEqual(3);
});

test("thai tone mark sits above, not beside, its consonant", async () => {
  const base = ringsBounds(await textRings(nodeFont, "Kanit-700", "น", 10));
  const marked = ringsBounds(await textRings(nodeFont, "Kanit-700", "น่", 10));
  expect(marked.w).toBeLessThan(base.w * 1.15);
  expect(marked.h).toBeGreaterThan(base.h * 1.15);
});

test("emoji, icons and symbols become decoration layers", async () => {
  for (const deco of [
    { type: "emoji", emoji: "😀" },
    { type: "icon", icon: "heart" },
    { type: "icon", icon: "symbol:star" },
  ] as const) {
    const layers = await decorationLayers({ ...DEFAULT_KEY, deco }, assets);
    expect(layers.length).toBe(1);
    expect(layers[0].cs.area()).toBeGreaterThan(1);
  }
});
