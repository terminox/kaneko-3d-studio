import { beforeAll, describe, expect, test } from "bun:test";
import { K, loadKernel } from "../src/geometry/kernel.ts";
import { build } from "../src/geometry/build.ts";
import { nodeAssets } from "../scripts/node-assets.ts";
import { baseFootprint, baseSupports, buildBase, loopCentres } from "../src/geometry/base.ts";
import { baseLevels, loopLift, loopRange } from "../src/geometry/levels.ts";
import { capOutline } from "../src/geometry/outline.ts";
import { upgradeBase, newDesign, type BaseOptions, type Texture } from "../src/design/types.ts";
import { DEFAULT_FIT } from "../src/geometry/switch.ts";
import type { Side } from "../src/geometry/connector.ts";

beforeAll(async () => {
  await loadKernel();
});

const holeR = 1.75;
const d = holeR + 0.9;

const feet = () => ({
  square: capOutline("square", 26, 2),
  heart: capOutline("heart", 26, 2),
  cat: capOutline("cat", 26, 2),
  offset: capOutline("capsule", 30, 2).translate([5, -3]),
});

describe("Any angle loop", () => {
  const presets = [
    [0, "right"],
    [90, "top"],
    [180, "left"],
    [270, "bottom"],
  ] as const;
  for (const name of ["square", "heart", "cat", "offset"] as const)
    for (const [angle, preset] of presets)
      test(`${name}: ${angle}° sits where the ${preset} preset does`, () => {
        const foot = feet()[name];
        const [want] = loopCentres(foot, preset, holeR);
        const [got] = loopCentres(foot, "angle", holeR, new Set(), angle, 0);
        expect(Math.hypot(got[0] - want[0], got[1] - want[1])).toBeLessThan(0.01);
      });

  test("at 45° on a circle the loop is one hole radius plus 0.9 beyond the rim", () => {
    const circle = K().CrossSection.circle(15, 180);
    const [x, y] = loopCentres(circle, "angle", holeR, new Set(), 45, 0)[0];
    expect(Math.hypot(x, y)).toBeCloseTo(15 + d, 1);
    expect(Math.atan2(y, x) * (180 / Math.PI)).toBeCloseTo(45, 1);
  });

  test("slide moves the loop along the tangent", () => {
    const circle = K().CrossSection.circle(15, 180);
    const a = loopCentres(circle, "angle", holeR, new Set(), 0, 0)[0];
    const b = loopCentres(circle, "angle", holeR, new Set(), 0, 3)[0];
    expect(b[1] - a[1]).toBeCloseTo(3, 5);
    expect(Math.abs(b[0] - a[0])).toBeLessThan(0.5);
  });

  test("a slide past the footprint stops the loop at the end of the rim", () => {
    const circle = K().CrossSection.circle(12, 180);
    const [x, y] = loopCentres(circle, "angle", holeR, new Set(), 45, 30)[0];
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    expect(Math.hypot(x, y)).toBeLessThan(12 + d + 1);
  });

  test("a side an H-connector takes gets no loop, others keep theirs", () => {
    const foot = feet().square;
    const taken = new Set<Side>(["right"]);
    expect(loopCentres(foot, "angle", holeR, taken, 20, 0)).toEqual([]);
    expect(loopCentres(foot, "angle", holeR, taken, 135, 0)).toHaveLength(1);
  });

  test("a design saved before the angle loop loads with the top-pointing default", () => {
    const fresh = newDesign("cap").base;
    const { loopAngle, loopSlide, ...old } = fresh;
    const up = upgradeBase(fresh, old);
    expect([up.loopAngle, up.loopSlide]).toEqual([90, 0]);
  });

  test("the printed Base grows toward the chosen angle", () => {
    const keys = [{ at: [0, 0] as [number, number], outline: capOutline("square", 18, 2) }];
    const width = (angle: number) => {
      const opts = { ...newDesign("cap").base, loop: "angle" as const, loopAngle: angle };
      const b = buildBase(keys, opts, DEFAULT_FIT, baseFootprint(keys, opts, DEFAULT_FIT)).boundingBox();
      return [b.max[0] - b.min[0], b.max[1] - b.min[1]];
    };
    const [w0, h0] = width(0);
    const [w90, h90] = width(90);
    expect(w0).toBeGreaterThan(w90 + 3);
    expect(h90).toBeGreaterThan(h0 + 3);
  });
});

describe("Loop height", () => {
  const keys = (shape: "square" | "heart" = "square") => [{ at: [0, 0] as [number, number], outline: capOutline(shape, 20, 2) }];
  const opts = (o: Partial<BaseOptions>): BaseOptions => ({ ...newDesign("cap").base, ...o });
  const fitZ = (o: BaseOptions) => baseLevels(o, DEFAULT_FIT);

  test("0 is flush with the underside, 100 puts the top at the rim, 50 is centred", () => {
    const o = (loopHeight: number) => opts({ loopHeight });
    const { bottom, wallTop } = fitZ(o(0));
    expect(loopLift(o(0), DEFAULT_FIT)).toBe(0);
    expect(bottom + loopLift(o(100), DEFAULT_FIT) + 3).toBeCloseTo(wallTop, 6);
    expect(bottom + loopLift(o(50), DEFAULT_FIT) + 1.5).toBeCloseTo((bottom + wallTop) / 2, 6);
    expect(loopLift(o(25), DEFAULT_FIT)).toBeCloseTo(15.3 / 4, 6);
    expect(loopLift(o(75), DEFAULT_FIT)).toBeCloseTo((15.3 * 3) / 4, 6);
  });

  test("percent is clamped and the range is never negative", () => {
    expect(loopLift(opts({ loopHeight: 140 }), DEFAULT_FIT)).toBeCloseTo(15.3, 6);
    expect(loopLift(opts({ loopHeight: -5 }), DEFAULT_FIT)).toBe(0);
    expect(loopRange(opts({ loopThickness: 99 }), DEFAULT_FIT)).toBe(0);
  });

  test("the printed loop sits where the height says", () => {
    for (const loopHeight of [0, 25, 50, 75, 100]) {
      const o = opts({ loop: "right", loopHeight });
      const foot = baseFootprint(keys(), o, DEFAULT_FIT);
      const x = foot.bounds().max[0] + 0.1;
      const out = buildBase(keys(), o, DEFAULT_FIT, foot).intersect(K().Manifold.cube([20, 40, 60]).translate([x, -20, -30])).boundingBox();
      const z = fitZ(o).bottom + loopLift(o, DEFAULT_FIT);
      expect(out.min[2]).toBeCloseTo(z, 4);
      expect(out.max[2]).toBeCloseTo(z + 3, 4);
    }
  });

  test("a raised loop stays welded to the wall: every side, texture and height", () => {
    const textures: Texture[] = ["none", "ribs", "sawtooth", "grooves", "diamond", "wave", "dots"];
    for (const texture of textures)
      for (const shape of ["square", "heart"] as const)
        for (const loop of ["both", "topBottom", "angle"] as const)
          for (const loopHeight of [25, 50, 100]) {
            const o = opts({ texture, textureDepth: 1.5, loop, loopAngle: 45, loopHeight });
            const tag = `${texture} ${shape} ${loop} ${loopHeight}`;
            const pieces = buildBase(keys(shape), o, DEFAULT_FIT).decompose().filter((m) => m.volume() > 1);
            expect(`${tag}: ${pieces.length}`).toBe(`${tag}: 1`);
          }
  }, 120_000);

  test("one support per raised loop, none when flush or on an H-connector's side", () => {
    const n = (o: Partial<BaseOptions>) => baseSupports(keys(), opts(o), DEFAULT_FIT).length;
    expect(n({ loop: "right" })).toBe(0);
    expect(n({ loop: "none", loopHeight: 50 })).toBe(0);
    expect(n({ loop: "right", loopHeight: 50 })).toBe(1);
    expect(n({ loop: "both", loopHeight: 50 })).toBe(2);
    const connectors = { left: "none", right: "socket", top: "none", bottom: "none" } as const;
    expect(n({ loop: "both", loopHeight: 50, connectors })).toBe(1);
  });

  test("the support stands on the bed, outside the Base", () => {
    const o = opts({ loop: "right", loopHeight: 50 });
    const foot = baseFootprint(keys(), o, DEFAULT_FIT);
    const [s] = baseSupports(keys(), o, DEFAULT_FIT, foot);
    expect(s.boundingBox().min[2]).toBeCloseTo(fitZ(o).bottom, 4);
    expect(s.boundingBox().min[0]).toBeGreaterThan(foot.bounds().max[0] - 0.01);
    const under = fitZ(o).bottom + loopLift(o, DEFAULT_FIT);
    expect(s.boundingBox().max[2]).toBeGreaterThan(under);
  });

  test("the keychain follows the loop, and the 3MF gets the support", async () => {
    const at = async (loopHeight: number) => {
      const d = newDesign("cap");
      d.keys[0].deco = { type: "none" };
      d.base.loopHeight = loopHeight;
      return build(d, { ...nodeAssets(), traced: {} });
    };
    const [a, b] = [await at(0), await at(100)];
    expect(b.keyring!.z - a.keyring!.z).toBeCloseTo(15.3, 6);
    const supports = (r: typeof a) => r.print.flatMap((g) => g.parts).filter((p) => p.role === "support").length;
    expect([supports(a), supports(b)]).toEqual([0, 1]);
  });

  test("a fluted chain's ring links ignore the height", async () => {
    const at = async (loopHeight: number) => {
      const d = newDesign("fluted");
      d.keys[0].deco = { type: "none" };
      d.base.loopHeight = loopHeight;
      const r = await build(d, { ...nodeAssets(), traced: {} });
      return r.print.map((g) => g.parts.map((p) => Array.from(p.mesh.vertices)));
    };
    expect(await at(100)).toEqual(await at(0));
  });

  test("a design saved before the height loads flush", () => {
    const fresh = newDesign("cap").base;
    const { loopHeight, loopManual, ...old } = fresh;
    const up = upgradeBase(fresh, old);
    expect([up.loopHeight, up.loopManual]).toEqual([0, false]);
  });
});
