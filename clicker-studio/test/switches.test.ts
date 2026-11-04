import { beforeAll, describe, expect, test } from "bun:test";
import { K, loadKernel } from "../src/geometry/kernel.ts";
import { build, packPlates } from "../src/geometry/build.ts";
import { buildCap } from "../src/geometry/cap.ts";
import { capOutline } from "../src/geometry/outline.ts";
import { DEFAULT_FIT, capHeights } from "../src/geometry/switch.ts";
import { edgePoints, erodeBox, rasterise, reachOf } from "../src/geometry/switches.ts";
import { newDesign, type CapShape, type Design } from "../src/design/types.ts";
import { switchesOf } from "../src/design/price.ts";
import { switchCount } from "../src/design/order.ts";
import type { Traced } from "../src/geometry/decoration.ts";
import { assets } from "./helpers.ts";

beforeAll(async () => {
  await loadKernel();
});

const fit = DEFAULT_FIT;

function solids(r: Awaited<ReturnType<typeof build>>) {
  return r.assembled.map((p) => K().Manifold.ofMesh(new (K().Mesh)({ numProp: 3, vertProperties: p.mesh.vertices, triVerts: p.mesh.triangles })));
}

/** A picture Design whose traced outline is a `w` × `h` mm bar (anchor in the middle unless given). */
function bar(w: number, h: number, anchor: [number, number] = [w / 2, h / 2]): { design: Design; traced: Record<string, Traced> } {
  const design = newDesign("picture");
  design.cap.border = 0;
  design.picture = {
    image: "p",
    crop: { x: 0, y: 0, w: 1, h: 1, rotate: 0 },
    adjust: { brightness: 0, contrast: 0, saturation: 0 },
    removeBackground: true,
    bgStrength: 70,
    punchHoles: false,
    colors: 1,
    palette: [],
    width: w,
    useCartoon: false,
  };
  const outline: [number, number][][] = [[[0, 0], [w, 0], [w, h], [0, h]]];
  return { design, traced: { p: { width: w, height: h, layers: [], outline, anchor } } };
}

function capDesign(shape: CapShape, size: number): Design {
  const d = newDesign("cap");
  d.cap.shape = shape;
  d.cap.size = size;
  d.cap.corner = shape === "square" ? 2 : 0;
  return d;
}

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("raster helpers", () => {
  test("rasterise fills a square's area; erodeBox keeps where a box fits", () => {
    const sq = K().CrossSection.square([20, 20], true);
    const m = rasterise(sq, sq.bounds());
    const count = (x: typeof m) => x.data.reduce((s, v) => s + v, 0);
    expect(count(m) * m.px * m.px).toBeCloseTo(400, -1);
    // A 10 mm box fits only in the middle 10 × 10, less the half-pixel safety margin each side.
    expect(count(erodeBox(m, 5)) * m.px * m.px).toBeCloseTo(81, -1);
    // A 21 mm box never fits.
    expect(count(erodeBox(m, 10.5))).toBe(0);
  });

  test("reach is the farthest edge point from its nearest centre", () => {
    const sq = K().CrossSection.square([60, 20], true);
    const edge = edgePoints(sq);
    expect(reachOf(edge, [[0, 0]])).toBeCloseTo(Math.hypot(30, 10), 1);
    expect(reachOf(edge, [[15, 0], [-15, 0]])).toBeCloseTo(Math.hypot(15, 10), 1);
  });
});

describe("auto switch count", () => {
  test("a 30 mm circle and every default cap keep one switch at the origin", async () => {
    for (const shape of ["square", "circle", "heart", "cat", "keycap"] as CapShape[]) {
      const r = await build(capDesign(shape, shape === "heart" ? 36.5 : 30), assets);
      expect(r.switches).toEqual([[0, 0]]);
      expect(r.switchesPerCap).toBe(1);
      expect(r.warnings).toEqual([]);
    }
  });

  test("a 60 × 20 bar gets two switches, mirrored on its long axis", async () => {
    const { design, traced } = bar(60, 20);
    const r = await build(design, { ...assets, traced });
    expect(r.warnings).toEqual([]);
    expect(r.switchesPerCap).toBe(2);
    const [a, b] = r.switches;
    expect(Math.abs(a[0] + b[0])).toBeLessThan(0.5);
    expect(Math.abs(a[1])).toBeLessThan(0.5);
    expect(Math.abs(b[1])).toBeLessThan(0.5);
    expect(dist(a, b)).toBeGreaterThanOrEqual(fit.pitch - 1e-6);
    // Both pockets are cut: the plate has two windows.
    const base = solids(r).at(-1)!;
    const plate = base.slice(-fit.plate / 2);
    for (const s of r.switches) expect(plate.intersect(K().CrossSection.square([13, 13], true).translate(s)).area()).toBeCloseTo(0, 2);
  });

  test("a 45 mm circle gets three switches, equally far from the centre", async () => {
    const r = await build(capDesign("circle", 45), assets);
    expect(r.warnings).toEqual([]);
    expect(r.switchesPerCap).toBe(3);
    const radii = r.switches.map((s) => Math.hypot(s[0], s[1]));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1.5);
    expect(reachOf(edgePoints(capOutline("circle", 45, 0)), r.switches)).toBeLessThanOrEqual(fit.reach);
  });

  test("a 50 mm square gets four switches at the quadrant centres, and the parts stay valid", async () => {
    const r = await build(capDesign("square", 50), assets);
    expect(r.warnings).toEqual([]);
    expect(r.switchesPerCap).toBe(4);
    const quadrants = new Set(r.switches.map((s) => `${Math.sign(s[0])},${Math.sign(s[1])}`));
    expect(quadrants.size).toBe(4);
    for (const s of r.switches) expect(Math.abs(Math.abs(s[0]) - Math.abs(s[1]))).toBeLessThan(0.5);
    const [cap, base] = solids(r);
    for (const m of [cap, base]) {
      expect(m.status()).toBe("NoError");
      expect(m.volume()).toBeGreaterThan(1);
    }
    expect(cap.intersect(base).volume()).toBeLessThan(1e-3);
    expect(cap.translate([0, 0, -fit.travel]).intersect(base).volume()).toBeLessThan(1e-3);
    expect(packPlates(r.print).length).toBe(1);
  });

  test("a cap too large for four switches warns, and still gets four", async () => {
    const r = await build(capDesign("circle", 100), assets);
    expect(r.warnings).toContain("warn.hugeCap");
    expect(r.switchesPerCap).toBe(4);
  });

  test("a thin bar keeps the single switch at its anchor and warns as before", async () => {
    const { design, traced } = bar(60, 8, [2, 4]);
    const r = await build(design, { ...assets, traced });
    expect(r.switches).toEqual([[0, 0]]);
    expect(r.warnings).toContain("warn.pocket");
  });
});

describe("forced switch count", () => {
  test("forcing two on an 18 mm square falls back to one and warns", async () => {
    const d = capDesign("square", 18);
    d.cap.switches = 2;
    const r = await build(d, assets);
    expect(r.switchesPerCap).toBe(1);
    expect(r.warnings).toContain("warn.noRoom");
  });

  test("forcing one on a 50 mm square keeps one, quietly", async () => {
    const d = capDesign("square", 50);
    d.cap.switches = 1;
    const r = await build(d, assets);
    expect(r.switches).toEqual([[0, 0]]);
    expect(r.warnings).not.toContain("warn.hugeCap");
  });

  test("forcing two on a 40 mm circle places two", async () => {
    const d = capDesign("circle", 40);
    d.cap.switches = 2;
    const r = await build(d, assets);
    expect(r.switchesPerCap).toBe(2);
    expect(r.warnings).toEqual([]);
  });
});

describe("sockets", () => {
  test("the first socket is tight, the others get the extra stem fit", () => {
    const design = newDesign("cap");
    const tight = { ...fit, stemFit: -0.05, extraStemFit: 0.1 };
    const outline = K().CrossSection.square([60, 20], true);
    const cap = buildCap(outline, design.cap, tight, "#fff", [], [], "cap", false, undefined, [[-15, 0], [15, 0]]).solids[0].m;
    const s = cap.slice(capHeights(tight).bossBottom + 1);
    const crossArea = (sf: number) => {
      const L = fit.crossLength + 2 * sf, W = fit.crossWidth + 2 * sf;
      return 2 * L * W - W * W;
    };
    const hole = (at: [number, number]) => {
      const window = K().CrossSection.circle(fit.boss / 2 - 0.1, 96).translate(at);
      return window.area() - s.intersect(window).area();
    };
    expect(hole([-15, 0])).toBeCloseTo(crossArea(-0.05), 1);
    expect(hole([15, 0])).toBeCloseTo(crossArea(0.05), 1);
  });
});

describe("price and order sheet", () => {
  test("count the switches a build placed, or the forced count", () => {
    const d = capDesign("square", 50);
    expect(switchesOf(d)).toBe(1);
    d.placedSwitches = 4;
    expect(switchesOf(d)).toBe(4);
    expect(switchCount(d)).toBe(4);
    d.cap.switches = 2;
    expect(switchesOf(d)).toBe(2);
    d.parts = "caps";
    expect(switchCount(d)).toBe(0);
    const row = newDesign("row");
    row.keys = [row.keys[0], row.keys[0], row.keys[0]];
    expect(switchesOf(row)).toBe(3);
  });
});
