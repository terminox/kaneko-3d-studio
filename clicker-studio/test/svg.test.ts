import { beforeAll, describe, expect, test } from "bun:test";
import { loadKernel } from "../src/geometry/kernel.ts";
import { pathToRings, ringsBounds, type Ring } from "../src/geometry/path.ts";
import { signedArea } from "../src/design/heights.ts";
import { applyMatrix, coversBox, ellipsePath, mergeFills, parseCssColour, pointsPath, rectPath, shapesToTraced, type SvgShape } from "../src/picture/svg.ts";
import { tracedPatches } from "../src/geometry/patches.ts";
import { build } from "../src/geometry/build.ts";
import { newDesign } from "../src/design/types.ts";
import type { Traced } from "../src/geometry/decoration.ts";
import { assets } from "./helpers.ts";

beforeAll(async () => {
  await loadKernel();
});

const area = (rs: Ring[]) => Math.abs(rs.reduce((s, r) => s + signedArea(r), 0));
const shape = (d: string, fill: string, evenOdd = false): SvgShape => ({ rings: pathToRings(d, 0.01), fill, evenOdd });
const square = (x: number, y: number, w: number) => rectPath(x, y, w, w, null, null);

describe("SVG shapes to path data", () => {
  test("a rect is its box; one radius rounds both ways, clamped to half the side", () => {
    expect(area(pathToRings(rectPath(10, 20, 40, 30, null, null)))).toBeCloseTo(1200, 6);
    // rx 5 alone means ry 5 too: four quarter circles cut from the corners.
    expect(area(pathToRings(rectPath(0, 0, 40, 30, 5, null), 0.001))).toBeCloseTo(1200 - (4 - Math.PI) * 25, 1);
    expect(area(pathToRings(rectPath(0, 0, 40, 30, null, 5), 0.001))).toBeCloseTo(1200 - (4 - Math.PI) * 25, 1);
    // Each radius clamps to half its own side, so a 20 × 10 box with radius 50 is an ellipse.
    expect(area(pathToRings(rectPath(0, 0, 20, 10, 50, 50), 0.001))).toBeCloseTo(Math.PI * 10 * 5, 1);
    expect(rectPath(0, 0, 0, 10, null, null)).toBe("");
  });

  test("a circle and an ellipse have their area and bounds", () => {
    const c = pathToRings(ellipsePath(50, 40, 10, 10), 0.001);
    expect(area(c)).toBeCloseTo(Math.PI * 100, 0);
    expect(ringsBounds(c)).toMatchObject({ minX: 40, maxX: 60 });
    const e = pathToRings(ellipsePath(0, 0, 20, 5), 0.001);
    expect(area(e)).toBeCloseTo(Math.PI * 100, 0);
    expect(ringsBounds(e).h).toBeCloseTo(10, 6);
  });

  test("polygon and polyline points close into one ring", () => {
    const rs = pathToRings(pointsPath("0,0 10,0 10,10 0 10"));
    expect(rs).toEqual([[[0, 0], [10, 0], [10, 10], [0, 10]]]);
    expect(pointsPath("1,2 3,4")).toBe("");
  });
});

test("a matrix moves, turns and scales rings as SVG transforms do", () => {
  const sq: Ring[] = [[[0, 0], [10, 0], [10, 10], [0, 10]]];
  // rotate(90) then translate(100, 5): (x, y) -> (100 - y, 5 + x).
  expect(applyMatrix(sq, [0, 1, -1, 0, 100, 5])).toEqual([[[100, 5], [100, 15], [90, 15], [90, 5]]]);
  expect(applyMatrix(sq, [2, 0, 0, 3, 0, 0])[0][2]).toEqual([20, 30]);
});

test("computed CSS colours read as hex and alpha", () => {
  expect(parseCssColour("rgb(255, 0, 128)")).toEqual({ hex: "#FF0080", alpha: 1 });
  expect(parseCssColour("rgba(0, 0, 0, 0)")).toEqual({ hex: "#000000", alpha: 0 });
  expect(parseCssColour("rgb(10 20 30 / 50%)")).toEqual({ hex: "#0A141E", alpha: 0.5 });
  expect(parseCssColour("none")).toBeNull();
});

describe("merging fills", () => {
  const fills = [
    { color: "#E02020", area: 50 },
    { color: "#2050E0", area: 30 },
    { color: "#C01818", area: 5 },
    { color: "#FFFFFF", area: 20 },
    { color: "#E02020", area: 10 },
  ];

  test("the closest colours join, keeping the bigger one's exact colour, biggest first", () => {
    const m = mergeFills(fills, 3);
    expect(m.colours).toEqual(["#E02020", "#2050E0", "#FFFFFF"]);
    expect(m.index).toEqual([0, 1, 0, 2, 0]);
  });

  test("enough colours keeps every distinct fill; one colour keeps the biggest", () => {
    expect(mergeFills(fills, 7).colours).toEqual(["#E02020", "#2050E0", "#FFFFFF", "#C01818"]);
    expect(mergeFills(fills, 1)).toEqual({ colours: ["#E02020"], index: [0, 0, 0, 0, 0] });
  });
});

describe("shapes to a traced picture", () => {
  const face = () => [
    shape(square(0, 0, 200), "#FFFFFF"),
    shape(ellipsePath(100, 100, 80, 80), "#F7D046"),
    shape(ellipsePath(70, 90, 10, 10), "#1E1E1E"),
  ];

  test("a first shape covering the whole viewBox is a background and goes", () => {
    const t = shapesToTraced(face(), 200, 200, 7, 0);
    expect(t.colours).toEqual(["#F7D046", "#1E1E1E"]);
    expect(t.shapes!.length).toBe(2);
    // The longer side is 1000 units, whatever the viewBox.
    expect(t.width).toBe(1000);
    expect(ringsBounds(t.outline)).toMatchObject({ minX: 100, maxX: 900 });
  });

  test("a first shape that only fits inside the viewBox stays", () => {
    const disc = [shape(ellipsePath(100, 100, 100, 100), "#FFFFFF"), shape(ellipsePath(70, 90, 10, 10), "#1E1E1E")];
    expect(coversBox(disc[0].rings, 200, 200)).toBe(false);
    expect(shapesToTraced(disc, 200, 200, 7, 0).shapes!.length).toBe(2);
  });

  test("one colour has no colour layers, like a one-colour raster picture", () => {
    const t = shapesToTraced(face(), 200, 200, 1, 0);
    expect(t.layers).toEqual([]);
    expect(t.shapes!.length).toBe(2);
  });
});

describe("paint order", () => {
  const RED = "#E02020", BLUE = "#2050E0", WHITE = "#FFFFFF", BLACK = "#1E1E1E";
  const traced = (shapes: SvgShape[], k = 7): Traced => shapesToTraced(shapes, 100, 100, k, 0);
  const areaOf = (t: Traced, color: string) =>
    tracedPatches(t).filter((p) => t.layers[p.layer].color === color).reduce((s, p) => s + p.cs.area(), 0) / 100;

  test("of two overlapping squares, the earlier one loses the overlap", () => {
    const t = traced([shape(square(10, 10, 40), RED), shape(square(30, 30, 40), BLUE)]);
    // 10 units per traced 100: 40 × 40 = 1600 less the 20 × 20 overlap.
    expect(areaOf(t, RED)).toBeCloseTo(1600 - 400, 0);
    expect(areaOf(t, BLUE)).toBeCloseTo(1600, 0);
  });

  test("a colour drawn again on top shows: a white highlight on a black pupil on a white eye", () => {
    const t = traced([shape(ellipsePath(50, 50, 30, 30), WHITE), shape(ellipsePath(50, 50, 15, 15), BLACK), shape(ellipsePath(55, 45, 4, 4), WHITE)]);
    const white = tracedPatches(t).filter((p) => t.layers[p.layer].color === WHITE);
    expect(white.length).toBe(2);
    expect(white.some((p) => Math.abs(p.at[0] - 0.55) < 0.03 && Math.abs(p.at[1] - 0.45) < 0.03)).toBe(true);
    expect(areaOf(t, BLACK)).toBeCloseTo(Math.PI * (225 - 16), -1);
  });

  test("an even-odd shape keeps its hole; a nonzero one fills it", () => {
    const ring = `${square(10, 10, 80)}${square(30, 30, 40)}`;
    expect(areaOf(traced([shape(ring, RED, true), shape(square(0, 0, 5), BLUE)]), RED)).toBeCloseTo(6400 - 1600, 0);
    expect(areaOf(traced([shape(ring, RED, false), shape(square(0, 0, 5), BLUE)]), RED)).toBeCloseTo(6400, 0);
  });

  test("the viewBox clips what lies outside it", () => {
    expect(areaOf(traced([shape(square(80, 10, 40), RED), shape(square(0, 0, 5), BLUE)]), RED)).toBeCloseTo(20 * 40, 0);
  });
});

test("with no anchor the Switch goes at the art's deepest point, not its box centre", async () => {
  // An L: a 15 mm upright and a 15 mm foot on a 40 mm square, so the box centre (20, 20) is outside it.
  const L = shape(pointsPath("0,0 15,0 15,25 40,25 40,40 0,40"), "#F7D046");
  const design = newDesign("picture");
  design.cap.border = 0;
  design.picture = {
    image: "art",
    crop: { x: 0, y: 0, w: 1, h: 1, rotate: 0 },
    adjust: { brightness: 0, contrast: 0, saturation: 0 },
    removeBackground: false,
    bgStrength: 0,
    punchHoles: false,
    colors: 1,
    palette: [],
    width: 40,
    useCartoon: false,
  };
  const r = await build(design, { ...assets, traced: { art: shapesToTraced([L], 40, 40, 1, 0) } });
  const cap = r.assembled[0].mesh.vertices;
  let minX = Infinity, minY = Infinity;
  for (let i = 0; i < cap.length; i += 3) (minX = Math.min(minX, cap[i])), (minY = Math.min(minY, cap[i + 1]));
  // The deepest point is in the corner where the upright meets the foot, its widest circle
  // touching both outer edges and the inner corner: 15√2 / (1 + √2) ≈ 8.79 mm from each edge.
  const deep = (15 * Math.SQRT2) / (1 + Math.SQRT2);
  expect(r.switches[0]).toEqual([0, 0]);
  expect(minX).toBeCloseTo(-deep, 0);
  expect(minY).toBeCloseTo(-deep, 0);
});
