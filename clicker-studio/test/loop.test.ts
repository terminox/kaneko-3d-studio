import { beforeAll, describe, expect, test } from "bun:test";
import { K, loadKernel } from "../src/geometry/kernel.ts";
import { baseFootprint, buildBase, loopCentres } from "../src/geometry/base.ts";
import { capOutline } from "../src/geometry/outline.ts";
import { upgradeBase, newDesign } from "../src/design/types.ts";
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
