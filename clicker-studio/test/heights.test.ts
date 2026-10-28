import { beforeAll, describe, expect, test } from "bun:test";
import { K, loadKernel, type Manifold } from "../src/geometry/kernel.ts";
import { tracedPatches } from "../src/geometry/patches.ts";
import type { Traced } from "../src/geometry/decoration.ts";
import { buildCap } from "../src/geometry/cap.ts";
import { capOutline } from "../src/geometry/outline.ts";
import { DEFAULT_FIT } from "../src/geometry/switch.ts";
import { build } from "../src/geometry/build.ts";
import { newDesign, type Design, type LayerHeights } from "../src/design/types.ts";
import { FLUSH_DEPTH, emptyHeights, makeItPop, patchAt, remapPins, resetPatches, setColourHeight, setPatchHeights } from "../src/design/heights.ts";
import { assets } from "./helpers.ts";

beforeAll(async () => {
  await loadKernel();
});

const sq = (x: number, y: number, w: number, h = w): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/**
 * A 100 × 100 picture: a big face (colour 0, with two eye holes) and two eyes
 * (colour 1), one of them with a pupil (colour 2).
 */
function picture(): Traced {
  return {
    width: 100,
    height: 100,
    outline: [sq(0, 0, 100)],
    layers: [
      { color: "#F7D046", rings: [sq(0, 0, 100), sq(20, 20, 20), sq(60, 20, 20)] },
      { color: "#1E1E1E", rings: [sq(20, 20, 20), sq(60, 20, 20), sq(65, 25, 10)] },
      { color: "#FFFFFF", rings: [sq(65, 25, 10)] },
    ],
  };
}

describe("patches", () => {
  test("one patch per island, each with a point inside it and a depth", () => {
    const ps = tracedPatches(picture());
    expect(ps.map((p) => p.layer).sort()).toEqual([0, 1, 1, 2]);
    for (const p of ps) {
      // `at` (0–1, y down) lands inside its own patch.
      const probe = K().CrossSection.square([0.01, 0.01], true).translate([p.at[0] * 100, -p.at[1] * 100]);
      expect(p.cs.intersect(probe).area()).toBeGreaterThan(0);
    }
    const depth = (layer: number) => ps.filter((p) => p.layer === layer).map((p) => p.depth);
    expect(depth(0)).toEqual([0]);
    expect(depth(1)).toEqual([1, 1]);
    expect(depth(2)).toEqual([2]);
  });

  test("a pin beats its colour, which beats the default; pins follow position", () => {
    const hs: LayerHeights = { colour: [null, 2], pins: [] };
    let ps = tracedPatches(picture(), hs);
    expect(ps.find((p) => p.layer === 0)!.h).toBeUndefined();
    expect(ps.filter((p) => p.layer === 1).map((p) => p.h)).toEqual([2, 2]);
    // Raise the right eye on its own.
    const right = ps.find((p) => p.layer === 1 && p.at[0] > 0.5)!;
    setPatchHeights(hs, [right], 3.4);
    ps = tracedPatches(picture(), hs);
    expect(ps.filter((p) => p.layer === 1).map((p) => p.h).sort()).toEqual([2, 3.4]);
    expect(ps.find((p) => p.layer === 1 && p.at[0] > 0.5)!.pins.length).toBe(1);
    // Setting it again replaces the pin, even with the stale patch info.
    setPatchHeights(hs, [right], 1);
    setPatchHeights(hs, [right], 1.2);
    expect(hs.pins.length).toBe(1);
    expect(hs.pins[0].h).toBe(1.2);
    resetPatches(hs, [right]);
    expect(hs.pins).toEqual([]);
  });

  test("Make it pop raises what sits inside other patches", () => {
    const hs = emptyHeights();
    setColourHeight(hs, 0, 2);
    makeItPop(hs, tracedPatches(picture()), 0.8);
    expect(hs.colour).toEqual([]);
    const ps = tracedPatches(picture(), hs);
    expect(ps.find((p) => p.layer === 0)!.h).toBeUndefined();
    expect(ps.filter((p) => p.layer === 1).map((p) => p.h)).toEqual([1.6, 1.6]);
    expect(ps.find((p) => p.layer === 2)!.h).toBe(2.4);
  });

  test("pins survive a re-crop and a rotation, and drop when cropped away", () => {
    const full = { x: 0, y: 0, w: 1, h: 1, rotate: 0 };
    const pins = [{ at: [0.75, 0.5] as [number, number], h: 2 }, { at: [0.1, 0.1] as [number, number], h: 3 }];
    // The right half of a 200 × 100 image.
    const half = remapPins(pins, full, { x: 0.5, y: 0, w: 0.5, h: 1, rotate: 0 }, 200, 100);
    expect(half.length).toBe(1);
    expect(half[0].at[0]).toBeCloseTo(0.5, 6);
    expect(half[0].at[1]).toBeCloseTo(0.5, 6);
    // Turned 90°: the rotated canvas is 100 × 200, and the point moves with it.
    const turned = remapPins(pins, full, { ...full, rotate: 90 }, 200, 100);
    const back = remapPins(turned, { ...full, rotate: 90 }, full, 200, 100);
    expect(back[0].at[0]).toBeCloseTo(0.75, 2);
    expect(back[0].at[1]).toBeCloseTo(0.5, 2);
    expect(turned[0].at).not.toEqual(back[0].at);
  });
});

describe("raised heights on the cap", () => {
  const top = (m: Manifold) => m.boundingBox().max[2];
  const bottom = (m: Manifold) => m.boundingBox().min[2];

  test("each patch stands at its own height; 0 is inlaid flush; one part per colour", () => {
    const design = newDesign("cap");
    const outline = capOutline("square", 24, 2);
    const sqCs = (x: number, y: number, w: number) => K().CrossSection.square([w, w]).translate([x, y]);
    const ref = (layer: number, x: number) => ({ layer, at: [x, 0] as [number, number], pins: [], depth: 0 });
    const deco = [
      { cs: sqCs(-8, -2, 4), color: "#F7D046", h: 0.8, patch: ref(0, 0) },
      { cs: sqCs(-2, -2, 4), color: "#1E1E1E", h: 3, patch: ref(1, 1) },
      { cs: sqCs(4, -2, 4), color: "#1E1E1E", h: 1.4, patch: ref(1, 2) },
      { cs: sqCs(-2, 4, 4), color: "#FFFFFF", h: 0, patch: ref(2, 3) },
    ];
    const g = buildCap(outline, { ...design.cap, style: "raised" }, DEFAULT_FIT, "#FFFFFF", deco, [], "cap");
    expect(g.solids.map((s) => s.color)).toEqual(["#FFFFFF", "#F7D046", "#1E1E1E", "#FFFFFF"]);
    const [cap, yellow, black, flush] = g.solids.map((s) => s.m);
    expect(top(yellow)).toBeCloseTo(g.top + 0.8, 4);
    expect(top(black)).toBeCloseTo(g.top + 3, 4);
    // The 1.4 mm eye is part of the same black part, so it adds volume below the top.
    expect(black.volume()).toBeCloseTo(16 * 3 + 16 * 1.4, 2);
    expect(top(flush)).toBeCloseTo(g.top, 4);
    expect(bottom(flush)).toBeCloseTo(g.top - FLUSH_DEPTH, 4);
    // The flush patch sits in a pocket: no overlap with the cap.
    expect(cap.intersect(flush).volume()).toBeLessThan(1e-3);
  });

  test("a picture Design with heights reports its patches and warns above 4 mm", async () => {
    const design: Design = newDesign("picture");
    design.cap.style = "raised";
    design.picture = {
      image: "p",
      crop: { x: 0, y: 0, w: 1, h: 1, rotate: 0 },
      adjust: { brightness: 0, contrast: 0, saturation: 0 },
      removeBackground: true,
      bgStrength: 70,
      punchHoles: false,
      colors: 3,
      palette: ["#F7D046", "#1E1E1E", "#FFFFFF"],
      width: 40,
      useCartoon: false,
      heights: { colour: [null, 2], pins: [] },
    };
    const traced = { p: { ...picture(), anchor: [50, 70] as [number, number] } };
    const r = await build(design, { ...assets, traced });
    expect(r.patches.length).toBe(4);
    expect(r.warnings).not.toContain("warn.tall");
    // The left eye (the right one has a pupil in its middle).
    const eye = r.patches.find((p) => p.layer === 1 && p.at[0] < 0.5)!;
    expect(eye.h).toBe(2);
    expect(eye.owner).toBe(-1);
    // Picking: the middle of a patch's footprint finds it again.
    const [x0, y0] = eye.rings[0][0], [x1, y1] = eye.rings[0][2];
    expect(patchAt(r.patches, [(x0 + x1) / 2, (y0 + y1) / 2, eye.top])?.at).toEqual(eye.at);

    setPatchHeights(design.picture.heights!, [eye], 6);
    const tall = await build(design, { ...assets, traced });
    expect(tall.warnings).toContain("warn.tall");
    expect(Math.max(...tall.patches.map((p) => p.h))).toBe(6);
    // Inlay ignores heights and reports no patches.
    design.cap.style = "inlay";
    const inlay = await build(design, { ...assets, traced });
    expect(inlay.patches).toEqual([]);
    expect(inlay.warnings).not.toContain("warn.tall");
  });

  test("image Decorations on keys: patches belong to their key", async () => {
    const design = newDesign("row");
    design.cap.style = "raised";
    design.keys = [0, 1].map(() => ({ ...design.keys[0], deco: { type: "image" as const, image: "p", heights: { colour: [], pins: [] } } }));
    const r = await build(design, { ...assets, traced: { p: picture() } });
    expect(new Set(r.patches.map((p) => p.owner))).toEqual(new Set([0, 1]));
    // Still one part per traced colour per key: cap + 3 colours, twice, plus the Base.
    expect(r.print.flatMap((g) => g.parts).length).toBe(2 * 4 + 1);
  });
});
