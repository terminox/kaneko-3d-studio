import { beforeAll, describe, expect, test } from "bun:test";
import { K, loadKernel, type Manifold } from "../src/geometry/kernel.ts";
import { build, toMesh } from "../src/geometry/build.ts";
import { housingEnvelope } from "../src/geometry/cap.ts";
import { newDesign, type SplitOptions } from "../src/design/types.ts";
import { writeBinaryStl } from "@mm/pipeline/mesh.ts";
import { assets } from "./helpers.ts";

beforeAll(async () => {
  await loadKernel();
});

/** A 40 × 34 × 50 egg, fatter at the bottom. */
const egg = () => K().Manifold.sphere(1, 96).warp((v) => {
  const s = 1 - 0.15 * v[2];
  v[0] *= 20 * s;
  v[1] *= 17 * s;
  v[2] *= 25;
});

function splitDesign(solid: Manifold, width: number, opts: Partial<SplitOptions> = {}, cut = 0.1) {
  const d = newDesign("split");
  d.files["model-1"] = `data:model/stl;base64,${Buffer.from(writeBinaryStl([toMesh(solid)])).toString("base64")}`;
  d.model = { file: "model-1", name: "m.stl", width, cut, rotate: [0, 0, 0] };
  d.split = { ...d.split!, ...opts };
  return d;
}

async function halves(d: ReturnType<typeof splitDesign>) {
  const r = await build(d, assets);
  const solid = (name: string) => {
    const p = r.assembled.find((x) => x.name === name)!;
    return K().Manifold.ofMesh(new (K().Mesh)({ numProp: 3, vertProperties: p.mesh.vertices, triVerts: p.mesh.triangles }));
  };
  return { r, top: solid("Top half"), bottom: solid("Bottom half") };
}

describe("Split a model", () => {
  for (const style of ["plug", "plain"] as const) {
    test(`${style}: two halves that clear the switch at rest and never touch when pressed`, async () => {
      const d = splitDesign(egg(), 44, { style });
      const { r, top, bottom } = await halves(d);
      expect(r.warnings).toEqual([]);
      expect(top.volume()).toBeGreaterThan(1000);
      expect(bottom.volume()).toBeGreaterThan(1000);
      expect(r.print.map((g) => g.name).sort()).toEqual(["Bottom half", "Top half"]);
      expect(top.translate([0, 0, -d.fit.travel]).intersect(bottom).volume()).toBeLessThan(0.01);
      for (const [x, y] of r.switches) {
        const housing = housingEnvelope(d.fit).translate([x, y, 0]);
        expect(housing.intersect(top).volume()).toBeLessThan(0.01);
        expect(housing.intersect(bottom).volume()).toBeLessThan(0.01);
      }
    });
  }

  test("plug: the top half hangs inside the well with the clearance all round, at rest and pressed", async () => {
    const d = splitDesign(egg(), 44);
    const { r, top, bottom } = await halves(d);
    const { seamZ, gap } = r.split!;
    expect(top.boundingBox().min[2]).toBeLessThan(seamZ + gap - 4);
    const clear = (t: Manifold, zs: number[]) => {
      for (const z of zs) expect(t.slice(z).offset(d.fit.clearance - 0.05, "Round").intersect(bottom.slice(z)).area()).toBeLessThan(0.01);
    };
    clear(top, [4.8, 5.6, 6.4]);
    clear(top.translate([0, 0, -d.fit.travel]), [1, 3, 5, 6.4]);
  });

  test("a small egg has no room for a switch, and its smallest size does", async () => {
    const small = await build(splitDesign(egg(), 18), assets);
    expect(small.warnings).toContain("warn.splitNoRoom");
    const min = small.split!.minWidth!;
    expect(min).toBeGreaterThan(18);
    const fitted = await build(splitDesign(egg(), min), assets);
    expect(fitted.warnings).not.toContain("warn.splitNoRoom");
  });

  test("a 90 × 25 bar sits on two or more switches", async () => {
    const bar = K().Manifold.cube([90, 25, 40], true).translate([0, 0, 20]);
    const r = await build(splitDesign(bar, 90, {}, 0), assets);
    expect(r.warnings).toEqual([]);
    expect(r.switches.length).toBeGreaterThanOrEqual(2);
  });

  test("a big nudge breaks through the bottom half; no nudge is clean", async () => {
    expect((await build(splitDesign(egg(), 44), assets)).warnings).toEqual([]);
    expect((await build(splitDesign(egg(), 44, { nudge: [9, 0] }), assets)).warnings).toContain("warn.splitBottom");
  });

  test("the seam goes where it is asked, and the automatic one leaves room above and below", async () => {
    for (const style of ["plug", "plain"] as const) {
      const asked = (await build(splitDesign(egg(), 44, { style, at: 0.4 }), assets)).split!;
      expect(asked.auto).toBe(false);
      expect(asked.seamZ - asked.modelZ0).toBeCloseTo(0.4 * asked.height, 2);

      const d = splitDesign(egg(), 44, { style });
      const auto = (await build(d, assets)).split!;
      const f = d.fit, wall = d.split!.wall;
      // Below: the clip room and a floor under the plate (and the well over it); above: the stem socket and a roof.
      const below = auto.seamZ + f.plate + f.under + wall;
      const above = f.stemTop + wall - (auto.seamZ + auto.gap);
      const z = auto.seamZ - auto.modelZ0;
      expect(auto.auto).toBe(true);
      expect(z).toBeGreaterThanOrEqual(below);
      expect(z).toBeLessThanOrEqual(auto.height - above);
    }
  });

  test("the Apart view lifts the top half and leaves the bottom half with the switches", async () => {
    const { r } = await halves(splitDesign(egg(), 44));
    expect(r.assembled.map((p) => [p.name, p.half])).toEqual([["Bottom half", undefined], ["Top half", "top"]]);
    expect(r.print.flatMap((g) => g.parts).every((p) => p.half === undefined)).toBe(true);
  });

  test("a round egg stands on a point until Flat bottom cuts it", async () => {
    expect((await build(splitDesign(egg(), 44, {}, 0), assets)).warnings).toContain("warn.splitSmallFoot");
    expect((await build(splitDesign(egg(), 44, {}, 0.15), assets)).warnings).not.toContain("warn.splitSmallFoot");
  });
});
