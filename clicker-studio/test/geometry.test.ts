import { beforeAll, describe, expect, test } from "bun:test";
import { K, loadKernel, type Manifold } from "../src/geometry/kernel.ts";
import { buildCap, housingEnvelope } from "../src/geometry/cap.ts";
import { buildBase } from "../src/geometry/base.ts";
import { capOutline } from "../src/geometry/outline.ts";
import { DEFAULT_FIT, capHeights } from "../src/geometry/switch.ts";
import { newDesign, type CapShape } from "../src/design/types.ts";
import { build, packPlates } from "../src/geometry/build.ts";
import { assets } from "./helpers.ts";

beforeAll(async () => {
  await loadKernel();
});

const fit = DEFAULT_FIT;

function valid(m: Manifold) {
  expect(m.status()).toBe("NoError");
  expect(m.isEmpty()).toBe(false);
  expect(m.volume()).toBeGreaterThan(1);
}


const SHAPES: CapShape[] = ["square", "capsule", "circle", "heart", "cloud", "bear", "cat", "flower", "hexagon", "octagon", "keycap"];

describe("single key", () => {
  for (const shape of SHAPES) {
    test(`${shape}: cap and base are valid and clear each other when pressed`, () => {
      const design = newDesign("cap");
      const outline = capOutline(shape, 20, 2);
      const cap = buildCap(outline, design.cap, fit, "#fff", [], [], "cap", shape === "keycap");
      const base = buildBase([{ at: [0, 0], outline }], design.base, fit);
      const body = cap.solids[0].m;
      valid(body);
      valid(base);
      expect(body.genus()).toBeGreaterThanOrEqual(0);
      const pressed = body.translate([0, 0, -fit.travel]);
      expect(pressed.intersect(base).volume()).toBeLessThan(1e-3);
      expect(body.intersect(base).volume()).toBeLessThan(1e-3);
      // Only the stem boss may enter the housing envelope.
      const boss = K().Manifold.cylinder(30, fit.boss / 2 + 0.05, fit.boss / 2 + 0.05, 48).translate([0, 0, -10]);
      expect(pressed.subtract(boss).intersect(housingEnvelope(fit)).volume()).toBeLessThan(1e-3);
    });
  }

  test("plate cutout is the pocket size and the plate is the spec thickness", () => {
    const design = newDesign("cap");
    const base = buildBase([{ at: [0, 0], outline: capOutline("square", 20, 2) }], design.base, fit);
    const mid = base.slice(-fit.plate / 2);
    const window = K().CrossSection.square([15, 15], true);
    // Inside a 15 mm window, material = 15² − pocket².
    expect(mid.intersect(window).area()).toBeCloseTo(15 * 15 - fit.pocket * fit.pocket, 1);
    // Just above the plate the window is open (cap skirt room); just below, the clip room.
    expect(base.slice(0.2).intersect(window).area()).toBeCloseTo(0, 3);
    expect(base.slice(-fit.plate - 0.2).intersect(window).area()).toBeCloseTo(0, 3);
  });

  test("cross socket matches the stem fit", () => {
    const design = newDesign("cap");
    const tight = { ...fit, stemFit: -0.05 };
    const cap = buildCap(capOutline("square", 18, 2), design.cap, tight, "#fff", [], [], "cap").solids[0].m;
    const { bossBottom } = capHeights(tight);
    const s = cap.slice(bossBottom + 1);
    const window = K().CrossSection.circle(fit.boss / 2 - 0.1, 96);
    const L = fit.crossLength - 0.1, W = fit.crossWidth - 0.1;
    const crossArea = 2 * L * W - W * W;
    expect(window.area() - s.intersect(window).area()).toBeCloseTo(crossArea, 1);
  });
});

describe("build", () => {
  test("a three-letter row: disjoint colour parts, all on the bed", async () => {
    const design = newDesign("row");
    design.keys = ["M", "A", "A"].map((t) => ({ ...design.keys[0], deco: { type: "text", text: t, font: "Fredoka-700" } }));
    const r = await build(design, assets);
    expect(r.print.length).toBe(4);
    const plates = packPlates(r.print);
    expect(plates.length).toBe(1);
    for (const g of plates[0].groups)
      for (const p of g.parts) {
        const v = p.mesh.vertices;
        for (let i = 2; i < v.length; i += 3) expect(v[i]).toBeGreaterThanOrEqual(-1e-4);
      }
    const ms = r.assembled.map((p) => K().Manifold.ofMesh(new (K().Mesh)({ numProp: 3, vertProperties: p.mesh.vertices, triVerts: p.mesh.triangles })));
    for (let i = 0; i < ms.length; i++)
      for (let j = i + 1; j < ms.length; j++) expect(ms[i].intersect(ms[j]).volume()).toBeLessThan(1e-3);
  });

  test("inlay caps print face down with flush colours", async () => {
    const design = newDesign("cap");
    design.cap.style = "inlay";
    const r = await build(design, assets);
    const cap = packPlates(r.print)[0].groups.find((g) => g.name === "Top Cap")!;
    expect(cap.parts.length).toBe(2);
    // The inlay touches the bed: its min z is 0.
    const v = cap.parts[1].mesh.vertices;
    let minZ = Infinity;
    for (let i = 2; i < v.length; i += 3) minZ = Math.min(minZ, v[i]);
    expect(minZ).toBeCloseTo(0, 4);
  });
});
