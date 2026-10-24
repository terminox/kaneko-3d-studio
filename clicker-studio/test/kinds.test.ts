import { beforeAll, describe, expect, test } from "bun:test";
import { K, loadKernel } from "../src/geometry/kernel.ts";
import { build, packPlates, toMesh } from "../src/geometry/build.ts";
import { newDesign, type Design, type Texture } from "../src/design/types.ts";
import { writeBinaryStl } from "@mm/pipeline/mesh.ts";
import { assets } from "./helpers.ts";

beforeAll(async () => {
  await loadKernel();
});

function solids(r: Awaited<ReturnType<typeof build>>) {
  return r.assembled.map((p) => K().Manifold.ofMesh(new (K().Mesh)({ numProp: 3, vertProperties: p.mesh.vertices, triVerts: p.mesh.triangles })));
}

function expectValid(r: Awaited<ReturnType<typeof build>>) {
  for (const m of solids(r)) {
    expect(m.status()).toBe("NoError");
    expect(m.volume()).toBeGreaterThan(0.1);
  }
  expect(packPlates(r.print).length).toBeGreaterThanOrEqual(1);
}

describe("base textures", () => {
  for (const tex of ["ribs", "sawtooth", "grooves", "diamond", "wave", "dots"] as Texture[]) {
    test(`${tex} keeps the base valid and changes its surface`, async () => {
      const plain = newDesign("cap");
      const textured = newDesign("cap");
      textured.base.texture = tex;
      const [a, b] = [await build(plain, assets), await build(textured, assets)];
      expectValid(b);
      const vol = (r: typeof a) => solids(r).at(-1)!.volume();
      expect(Math.abs(vol(a) - vol(b))).toBeGreaterThan(5);
    });
  }
});

describe("parts modes", () => {
  test("caps only, base only, and the A–Z set", async () => {
    const d = newDesign("row");
    d.keys = [..."HI"].map((c) => ({ ...d.keys[0], deco: { type: "text", text: c, font: "Fredoka-700" } }));
    d.parts = "caps";
    expect((await build(d, assets)).print.map((g) => g.name)).toEqual(["Keycap 1", "Keycap 2"]);
    d.parts = "base";
    expect((await build(d, assets)).print.map((g) => g.name)).toEqual(["Base"]);
    d.parts = "az-set";
    const az = await build(d, assets);
    expect(az.print.length).toBe(26);
    expect(az.print[25].name).toBe("Keycap Z");
    expect(packPlates(az.print).length).toBe(1);
  });
});

describe("layouts", () => {
  for (const layout of ["column", "grid", "wasd", "arrows", "t", "custom"] as Design["layout"][]) {
    test(`${layout} builds one pocket per key`, async () => {
      const d = newDesign("grid");
      d.layout = layout;
      d.columns = 3;
      d.cells = [[0, 0], [2, 0], [1, 1]];
      const n = layout === "wasd" || layout === "arrows" ? 4 : layout === "custom" ? 3 : 5;
      d.keys = Array.from({ length: n }, () => ({ ...d.keys[0] }));
      const r = await build(d, assets);
      expectValid(r);
      expect(r.switches.length).toBe(n);
      // Keys never overlap.
      const caps = solids(r).filter((_, i) => r.assembled[i].name.startsWith("Keycap") && !r.assembled[i].name.includes(" decoration"));
      for (let i = 0; i < caps.length; i++) for (let j = i + 1; j < caps.length; j++) expect(caps[i].intersect(caps[j]).volume()).toBeLessThan(1e-3);
      expect(r.warnings).toEqual([]);
    });
  }
});

test("fluted chain: one scalloped base per key with link loops, not touching", async () => {
  const d = newDesign("fluted");
  d.keys = [..."ABC"].map((c) => ({ ...d.keys[0], deco: { type: "text", text: c, font: "Fredoka-700" } }));
  const r = await build(d, assets);
  expectValid(r);
  const bases = solids(r).filter((_, i) => r.assembled[i].name.startsWith("Base"));
  expect(bases.length).toBe(3);
  expect(bases[0].intersect(bases[1]).volume()).toBeLessThan(1e-3);
  // Each base has two link holes besides its switch pocket: genus 2 or more.
  expect(bases[0].genus()).toBeGreaterThanOrEqual(2);
});

test("3D model: an STL becomes a cap that clears the switch", async () => {
  const blob = K().Manifold.sphere(10, 48).add(K().Manifold.cube([6, 6, 14], true).translate([0, 0, 10]));
  const stl = writeBinaryStl([toMesh(blob)]);
  const d = newDesign("model");
  d.files.m1 = `data:model/stl;base64,${Buffer.from(stl).toString("base64")}`;
  d.model = { file: "m1", name: "blob.stl", width: 30, cut: 0.3, rotate: [0, 0, 0] };
  const r = await build(d, assets);
  expect(r.warnings).toEqual([]);
  expectValid(r);
  const [cap, base] = solids(r);
  expect(cap.translate([0, 0, -d.fit.travel]).intersect(base).volume()).toBeLessThan(1e-3);
  // Taller than a plain cap: the model sits on top.
  expect(cap.boundingBox().max[2]).toBeGreaterThan(20);
});

test("a switch near the edge of a picture warns", async () => {
  const d = newDesign("picture");
  d.picture = {
    image: "p",
    crop: { x: 0, y: 0, w: 1, h: 1, rotate: 0 },
    adjust: { brightness: 0, contrast: 0, saturation: 0 },
    removeBackground: true,
    bgStrength: 70,
    punchHoles: false,
    colors: 1,
    palette: [],
    width: 60,
    useCartoon: false,
  };
  // A thin 60 × 8 bar with the anchor at one end.
  const traced = { width: 60, height: 8, layers: [], outline: [[[0, 0], [60, 0], [60, 8], [0, 8]]] as [number, number][][], anchor: [2, 4] as [number, number] };
  const r = await build(d, { ...assets, traced: { p: traced } });
  expect(r.warnings).toContain("warn.pocket");
});
