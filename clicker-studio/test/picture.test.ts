import { beforeAll, expect, test } from "bun:test";
import { loadKernel, K } from "../src/geometry/kernel.ts";
import { tracePicture, type Img } from "../src/picture/process.ts";
import { newDesign } from "../src/design/types.ts";
import { build, packPlates } from "../src/geometry/build.ts";
import { rings } from "../src/geometry/outline.ts";
import { assets } from "./helpers.ts";

beforeAll(async () => {
  await loadKernel();
});

/** A yellow face with two dark eyes and a white ring hole, on white or transparent. */
function face(transparentBg: boolean): Img {
  const w = 200, h = 200;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = Math.hypot(x - 100, y - 100);
      let c = [255, 255, 255, transparentBg ? 0 : 255];
      if (r < 80) c = [250, 200, 20, 255];
      if (Math.hypot(x - 70, y - 85) < 12 || Math.hypot(x - 130, y - 85) < 12) c = [30, 30, 30, 255];
      // A white hole fully enclosed by the face.
      if (Math.hypot(x - 100, y - 140) < 10) c = [255, 255, 255, 255];
      data.set(c, i);
    }
  return { width: w, height: h, data };
}

test("white background: the face is kept, enclosed white stays unless holes are punched", () => {
  const keep = tracePicture(face(false), { removeBackground: true, bgStrength: 70, punchHoles: false, colors: 3 });
  const punch = tracePicture(face(false), { removeBackground: true, bgStrength: 70, punchHoles: true, colors: 3 });
  const area = (t: typeof keep) => rings(t.outline, "EvenOdd").area();
  // Disc of radius 80 px ≈ 20106 px².
  expect(area(keep)).toBeGreaterThan(19000);
  expect(area(keep)).toBeLessThan(21000);
  // Punching removes the 10 px hole (≈ 314 px²).
  expect(area(keep) - area(punch)).toBeGreaterThan(200);
  expect(keep.layers.length).toBe(3);
});

test("transparent PNG uses its alpha; colours come out biggest first", () => {
  const t = tracePicture(face(true), { removeBackground: true, bgStrength: 70, punchHoles: false, colors: 2 });
  expect(t.colours.length).toBe(2);
  // Yellow is the biggest area.
  expect(t.colours[0].startsWith("#F")).toBe(true);
  // The Switch goes deep inside the disc.
  expect(t.depth).toBeGreaterThan(50);
});

test("a picture Design builds a cap and base shaped like the picture", async () => {
  const t = tracePicture(face(true), { removeBackground: true, bgStrength: 70, punchHoles: false, colors: 2 });
  const design = newDesign("picture");
  design.cap.style = "inlay";
  design.picture = {
    image: "img1",
    crop: { x: 0, y: 0, w: 1, h: 1, rotate: 0 },
    adjust: { brightness: 0, contrast: 0, saturation: 0 },
    removeBackground: true,
    bgStrength: 70,
    punchHoles: false,
    colors: 2,
    palette: ["#F7D046", "#1E1E1E"],
    width: 40,
    useCartoon: false,
  };
  const r = await build(design, { ...assets, traced: { img1: t } });
  expect(r.warnings).toEqual([]);
  const plates = packPlates(r.print);
  const cap = plates[0].groups.find((g) => g.name === "Top Cap")!;
  expect(cap.parts.map((p) => p.color)).toEqual(["#FFFFFF", "#F7D046", "#1E1E1E"]);
  // About 40 mm across.
  const v = r.assembled[0].mesh.vertices;
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < v.length; i += 3) (minX = Math.min(minX, v[i])), (maxX = Math.max(maxX, v[i]));
  expect(maxX - minX).toBeGreaterThan(36);
  expect(maxX - minX).toBeLessThan(42);
  void K;
});
