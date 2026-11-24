import { beforeAll, describe, expect, test } from "bun:test";
import { K, loadKernel } from "../src/geometry/kernel.ts";
import { build } from "../src/geometry/build.ts";
import { DEFAULT_FIT } from "../src/geometry/switch.ts";
import { maskAt, middle } from "../src/geometry/spots.ts";
import { newDesign, type Design } from "../src/design/types.ts";
import { switchesOf } from "../src/design/price.ts";
import { assets } from "./helpers.ts";

beforeAll(async () => {
  await loadKernel();
});

function circle(size: number, spots?: [number, number][]): Design {
  const d = newDesign("cap");
  d.cap.shape = "circle";
  d.cap.size = size;
  if (spots) d.cap.spots = spots;
  return d;
}
const run = (d: Design) => build(d, assets);
const gap = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("pinned switch spots", () => {
  test("a spot that fits is used exactly, for every parts mode", async () => {
    for (const parts of ["cap+base", "caps", "base"] as const) {
      const d = circle(36, [[0.1, -0.05]]);
      d.parts = parts;
      const r = await run(d);
      const c = middle(r.place!);
      expect(r.place!.at[0][0] - c[0]).toBeCloseTo(3.6, 1);
      expect(r.place!.at[0][1] - c[1]).toBeCloseTo(-1.8, 1);
      expect(r.warnings).toEqual([]);
    }
  });

  test("a spot past the edge stops where the switch fits, and nothing collides", async () => {
    for (const s of [[0.9, 0], [-0.4, 0.4], [0, -3]] as [number, number][]) {
      const r = await run(circle(36, [s]));
      expect(maskAt(r.place!.ok, r.place!.at[0])).toBe(true);
      expect(r.warnings.filter((w) => w === "warn.smallCap" || w === "warn.pocket")).toEqual([]);
      const [cap, base] = [r.assembled[0], r.assembled.at(-1)!].map((p) => K().Manifold.ofMesh(new (K().Mesh)({ numProp: 3, vertProperties: p.mesh.vertices, triVerts: p.mesh.triangles })));
      expect(cap.status()).toBe("NoError");
      expect(cap.intersect(base).volume()).toBeLessThan(1e-3);
      expect(cap.translate([0, 0, -DEFAULT_FIT.travel]).intersect(base).volume()).toBeLessThan(1e-3);
    }
  });

  test("two spots on top of each other are kept the pitch apart, in order", async () => {
    const r = await run(circle(55, [[0.1, 0], [0.1, 0]]));
    expect(r.switchesPerCap).toBe(2);
    expect(gap(r.switches[0], r.switches[1])).toBeGreaterThanOrEqual(DEFAULT_FIT.pitch - 1e-6);
    expect(r.switches[0][0] - middle(r.place!)[0]).toBeCloseTo(5.5, 1);
  });

  test("spots follow the cap's size", async () => {
    const offset = async (size: number) => {
      const r = await run(circle(size, [[0.1, 0]]));
      return r.place!.at[0][0] - middle(r.place!)[0];
    };
    expect(await offset(40)).toBeCloseTo((await offset(30)) * (4 / 3), 1);
  });

  test("a pinned switch far from an edge warns; switches that can't fit go back to automatic", async () => {
    expect((await run(circle(44, [[0.5, 0]]))).warnings).toContain("warn.spotsReach");
    const d = circle(26, [[-0.3, 0], [0.3, 0]]);
    const r = await run(d);
    expect(r.warnings).toContain("warn.spotsDropped");
    expect(r.switchesPerCap).toBe(1);
    d.cap.switches = 2;
    d.placedSwitches = r.switchesPerCap;
    expect(switchesOf(d)).toBe(1);
  });

  test("a saved and reopened Design builds the same; without spots placement stays automatic", async () => {
    const d = circle(36, [[0.12, 0.07]]);
    expect((await run(JSON.parse(JSON.stringify(d)))).switches).toEqual((await run(d)).switches);
    expect((await run(circle(36))).switches).toEqual([[0, 0]]);
  });
});
