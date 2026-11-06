import { beforeAll, describe, expect, test } from "bun:test";
import { K, loadKernel, type Manifold } from "../src/geometry/kernel.ts";
import { mergeAreas, tracedPatches } from "../src/geometry/patches.ts";
import type { Traced } from "../src/geometry/decoration.ts";
import { buildCap } from "../src/geometry/cap.ts";
import { capOutline } from "../src/geometry/outline.ts";
import { DEFAULT_FIT } from "../src/geometry/switch.ts";
import { build } from "../src/geometry/build.ts";
import { newDesign, type Design, type LayerHeights } from "../src/design/types.ts";
import { FLUSH_DEPTH, emptiedLayers, emptyHeights, flatten, samePt, makeItPop, patchAt, remapHeights, remapPins, resetPatchColours, resetPatches, setColourHeight, setPatchColours, setPatchHeights } from "../src/design/heights.ts";
import { designColours } from "../src/design/price.ts";
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
    const ref = (layer: number, x: number) => ({ layer, at: [x, 0] as [number, number], pins: [], paints: [], depth: 0 });
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
    design.cap.switches = 1; // a 40 mm square would take four; these tests are about heights
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
    // Inlay ignores heights but still reports patches, flush, for colouring.
    design.cap.style = "inlay";
    const inlay = await build(design, { ...assets, traced });
    expect(inlay.patches.length).toBe(tall.patches.length);
    expect(inlay.patches.every((p) => p.h === 0 && !p.own)).toBe(true);
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

describe("part colours", () => {
  const RED = "#D32F2F", BLUE = "#2F5FB3";
  const eyes = (hs?: LayerHeights) => tracedPatches(picture(), hs).filter((p) => p.layer === 1);

  /** A Picture Design of `picture()`, with its traced colours as the palette. */
  function pictureDesign(style: "raised" | "inlay") {
    const design = newDesign("picture");
    design.cap.style = style;
    const traced = { p: picture() };
    design.picture = { image: "p", crop: { x: 0, y: 0, w: 1, h: 1, rotate: 0 }, adjust: { brightness: 0, contrast: 0, saturation: 0 }, removeBackground: false, bgStrength: 0, punchHoles: false, colors: 3, palette: traced.p.layers.map((l) => l.color), width: 40, useCartoon: false, heights: emptyHeights() };
    return { design, assets: { ...assets, traced } };
  }

  test("a paint colours only the patch under it; the last paint wins", () => {
    const hs = emptyHeights();
    const [left, right] = eyes();
    setPatchColours(hs, [left], RED);
    const painted = eyes(hs);
    expect(painted[0].color).toBe(RED);
    expect(painted[1].color).toBeUndefined();
    expect(painted[0].paints.length).toBe(1);
    hs.paints!.push({ at: [left.at[0], left.at[1]], color: BLUE });
    expect(eyes(hs)[0].color).toBe(BLUE);
    expect(right.color).toBeUndefined();
  });

  test("setting replaces, reset removes, and a stale paint on the patch goes with them", () => {
    const hs = emptyHeights();
    const [left, right] = eyes();
    setPatchColours(hs, [left, right], RED);
    setPatchColours(hs, [left], BLUE);
    expect(hs.paints!.length).toBe(2);
    // A retrace can leave a paint off the patch's own point.
    const near: [number, number] = [left.at[0] + 0.02, left.at[1] + 0.02];
    hs.paints = [{ at: near, color: RED }, ...hs.paints!];
    resetPatchColours(hs, eyes(hs).slice(0, 1));
    expect(hs.paints!.map((p) => p.color)).toEqual([RED]);
    expect(eyes(hs)[0].color).toBeUndefined();
    expect(eyes(hs)[1].color).toBe(RED);
  });

  test("a retrace keeps colour by position, and heights stay separate", () => {
    const hs = emptyHeights();
    const [left] = eyes();
    setPatchColours(hs, [left], RED);
    setPatchHeights(hs, [left], 3);
    // The same picture with its layers in another order.
    const t = picture();
    t.layers.reverse();
    const ps = tracedPatches(t, hs).filter((p) => p.color === RED);
    expect(ps.length).toBe(1);
    expect(ps[0].layer).toBe(1);
    expect(ps[0].h).toBe(3);
  });

  test("Make it pop and Flatten leave colours alone", () => {
    const hs = emptyHeights();
    setPatchColours(hs, eyes().slice(0, 1), RED);
    makeItPop(hs, tracedPatches(picture()), 0.8);
    flatten(hs);
    expect(hs.paints!.length).toBe(1);
  });

  test("a re-crop moves paints with pins and drops those cropped away", () => {
    const whole = { x: 0, y: 0, w: 1, h: 1, rotate: 0 };
    const half = { x: 0.5, y: 0, w: 0.5, h: 1, rotate: 0 };
    const hs: LayerHeights = { colour: [], pins: [{ at: [0.75, 0.5], h: 2 }], paints: [{ at: [0.75, 0.5], color: RED }, { at: [0.25, 0.5], color: BLUE }] };
    remapHeights(hs, whole, half, 100, 100);
    expect(hs.pins.length).toBe(1);
    expect(hs.pins[0].at[0]).toBeCloseTo(0.5, 6);
    expect(hs.paints!.map((p) => p.color)).toEqual([RED]);
    expect(hs.paints![0].at[0]).toBeCloseTo(0.5, 6);
    // Old saves have no paints.
    const old: LayerHeights = { colour: [], pins: [] };
    remapHeights(old, whole, half, 100, 100);
    expect(old.paints).toBeUndefined();
  });

  for (const style of ["raised", "inlay"] as const) {
    test(`${style}: a repainted patch joins that filament's part and leaves the other`, async () => {
      const { design, assets: a } = pictureDesign(style);
      const parts = (r: Awaited<ReturnType<typeof build>>) => r.assembled.filter((p) => p.name.includes("colour") || p.name.includes("decoration"));
      const before = await build(design, a);
      expect(parts(before).map((p) => p.color).sort()).toEqual(["#1E1E1E", "#F7D046", "#FFFFFF"]);
      const eye = before.patches.filter((p) => p.layer === 1 && p.depth === 1)[0];
      // Into a filament the picture already uses: no new part.
      setPatchColours(design.picture!.heights!, [eye], "#FFFFFF");
      const after = await build(design, a);
      expect(after.patches.find((p) => samePt(p.at, eye.at))?.color).toBe("#FFFFFF");
      expect(after.patches.find((p) => samePt(p.at, eye.at))?.painted).toBe(true);
      expect(parts(after).map((p) => p.color).sort()).toEqual(["#1E1E1E", "#F7D046", "#FFFFFF"]);
      // Repainting every black patch removes the black part altogether.
      setPatchColours(design.picture!.heights!, after.patches.filter((p) => p.color === "#1E1E1E"), RED);
      const red = await build(design, a);
      expect(parts(red).map((p) => p.color).sort()).toEqual(["#D32F2F", "#F7D046", "#FFFFFF"]);
      for (const p of red.assembled) expect(K().Manifold.ofMesh(new (K().Mesh)({ numProp: 3, vertProperties: p.mesh.vertices, triVerts: p.mesh.triangles })).status()).toBe("NoError");
    });
  }

  test("a hairline between two traced colours closes when they share a filament", () => {
    const area = (x: number) => K().CrossSection.square([4, 4]).translate([x, 0]);
    const ref = (layer: number) => ({ layer, at: [0, 0] as [number, number], pins: [], paints: [], depth: 0 });
    const gap = [{ cs: area(0), patch: ref(0) }, { cs: area(4.1), patch: ref(1) }];
    expect(mergeAreas(gap).decompose().length).toBe(1);
    // A real gap stays, and so do islands of one traced colour.
    expect(mergeAreas([gap[0], { cs: area(4.5), patch: ref(1) }]).decompose().length).toBe(2);
    expect(mergeAreas([gap[0], { cs: area(4.1), patch: ref(0) }]).decompose().length).toBe(2);
  });

  test("image Decorations on keys take paints too, and each key keeps its own", async () => {
    const design = newDesign("row");
    design.cap.style = "inlay";
    const heights = emptyHeights();
    design.keys = [0, 1].map(() => ({ ...design.keys[0], deco: { type: "image" as const, image: "p", heights: emptyHeights() } }));
    const a = { ...assets, traced: { p: picture() } };
    const first = (await build(design, a)).patches.filter((p) => p.owner === 0);
    setPatchColours(heights, first.slice(0, 1), RED);
    design.keys[0].deco = { type: "image", image: "p", heights };
    const r = await build(design, a);
    expect(r.patches.filter((p) => p.painted).map((p) => [p.owner, p.color])).toEqual([[0, RED]]);
    expect(r.assembled.filter((p) => p.color === RED).length).toBe(1);
  });

  test("a colour with every patch repainted stops counting as a filament", async () => {
    const { design, assets: a } = pictureDesign("inlay");
    const before = await build(design, a);
    expect(emptiedLayers(before.patches)).toEqual([]);
    const eyes = before.patches.filter((p) => p.layer === 1);
    setPatchColours(design.picture!.heights!, eyes.slice(0, 1), RED);
    expect(emptiedLayers((await build(design, a)).patches)).toEqual([]);
    setPatchColours(design.picture!.heights!, eyes, RED);
    const emptied = emptiedLayers((await build(design, a)).patches);
    expect(emptied).toEqual([1]);
    design.picture!.emptied = emptied;
    expect(designColours(design)).not.toContain("#1E1E1E");
    expect(designColours(design)).toContain(RED);
  });

  test("the Design's colours include paints", () => {
    const { design } = pictureDesign("inlay");
    expect(designColours(design)).not.toContain(RED);
    design.picture!.heights!.paints = [{ at: [0.5, 0.5], color: RED }];
    expect(designColours(design)).toContain(RED);
    const row = newDesign("row");
    row.keys[0].deco = { type: "image", image: "p", heights: { colour: [], pins: [], paints: [{ at: [0.5, 0.5], color: BLUE }] } };
    expect(designColours(row)).toContain(BLUE);
  });
});

describe("picture border", () => {
  const box = (m: Manifold) => m.boundingBox();
  const outline = () => capOutline("square", 24, 2);
  const whole = (h?: number) => [{ cs: outline(), color: "#F7D046", h }];
  const ob = () => outline().bounds();

  test("by default Decorations keep off the rounded top edge", () => {
    const opts = { ...newDesign("cap").cap, style: "raised" as const };
    const [, deco] = buildCap(outline(), opts, DEFAULT_FIT, "#FFFFFF", whole(), [], "cap").solids.map((s) => s.m);
    expect(box(deco).min[0]).toBeCloseTo(ob().min[0] + opts.topRound + 0.4, 2);
  });

  test("0 mm, raised: the picture runs to the edge and fills down over the rounded top", () => {
    const opts = { ...newDesign("cap").cap, style: "raised" as const };
    const g = buildCap(outline(), opts, DEFAULT_FIT, "#FFFFFF", whole(), [], "cap", false, 0);
    const [cap, deco] = g.solids.map((s) => s.m);
    expect(box(deco).min[0]).toBeCloseTo(ob().min[0], 2);
    expect(box(deco).max[1]).toBeCloseTo(ob().max[1], 2);
    expect(box(deco).min[2]).toBeCloseTo(g.top - opts.topRound, 3);
    expect(box(deco).max[2]).toBeCloseTo(g.top + opts.decoHeight, 3);
    expect(cap.intersect(deco).volume()).toBeLessThan(1e-3);
  });

  test("0 mm, flush and inlay: the picture runs to the edge, trimmed to the rounded top", () => {
    for (const [style, h, depth] of [["raised", 0, FLUSH_DEPTH], ["inlay", undefined, 0.8]] as const) {
      const opts = { ...newDesign("cap").cap, style, decoHeight: 0.8 };
      const g = buildCap(outline(), opts, DEFAULT_FIT, "#FFFFFF", whole(h), [], "cap", false, 0);
      const [cap, piece] = g.solids.map((s) => s.m);
      // Within the rounding of the edge (a 0.6 mm flush patch stops just above its widest step).
      expect(box(piece).min[0]).toBeLessThan(ob().min[0] + 0.1);
      expect(box(piece).max[2]).toBeCloseTo(g.top, 3);
      expect(box(piece).min[2]).toBeCloseTo(g.top - depth, 3);
      // Smaller than a straight slab: the rounding trims its top edge.
      expect(piece.volume()).toBeLessThan(outline().area() * depth - 0.1);
      expect(cap.intersect(piece).volume()).toBeLessThan(1e-3);
    }
  });

  test("a picture Design's border grows the cap and Base outward; the picture keeps its width", async () => {
    const design: Design = newDesign("picture");
    design.cap.switches = 1; // a 40 mm square would take four; these tests are about heights
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
    };
    const traced = { p: { ...picture(), anchor: [50, 50] as [number, number] } };
    const run = async (border: number) => {
      design.cap.border = border;
      return build(design, { ...assets, traced });
    };
    const width = async (border: number, name: string) => {
      const v = (await run(border)).assembled.find((p) => p.name === name)!.mesh.vertices;
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < v.length; i += 3) (min = Math.min(min, v[i])), (max = Math.max(max, v[i]));
      return max - min;
    };
    expect(await width(0, "Top Cap decoration 1")).toBeCloseTo(await width(0, "Top Cap"), 1);
    for (const border of [1.2, 3]) {
      expect(await width(border, "Top Cap decoration 1")).toBeCloseTo(40, 1);
      expect(await width(border, "Top Cap")).toBeCloseTo(40 + 2 * border, 1);
      expect((await width(border, "Base")) - (await width(0, "Base"))).toBeCloseTo(2 * border, 1);
    }
    // No overlap between the cap body and the picture, and every part is one solid piece.
    const r = await run(1.2);
    expect(r.warnings).not.toContain("warn.smallCap");
    expect(r.warnings).not.toContain("warn.pocket");
    for (const border of [0, 0.8]) expect((await run(border)).warnings).not.toContain("warn.thinBorder");
    expect((await run(0.4)).warnings).toContain("warn.thinBorder");
  });
});
