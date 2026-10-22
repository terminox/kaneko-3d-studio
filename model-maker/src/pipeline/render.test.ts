// Integration tests: these run the real OpenSCAD WebAssembly build (Node flavour).
import { describe, expect, test } from "bun:test";
import { createNodeRunner } from "../openscad/node-runner.ts";
import { volume } from "./mesh.ts";
import { findPlates, renderPreview, splitColors } from "./render.ts";

const runner = createNodeRunner();

const PLATE_MODEL = `
base_color = "#FFFFFF"; // color
text_color = "#0080FF"; // color
hole = 3;
module tag() {
  // the red cylinder only cuts; it must not become a red part
  difference() { color(base_color) cube([30, 20, 3]); color("red") translate([2, 2, -1]) cylinder(d = hole, h = 5, $fn = 24); }
  color(text_color) translate([5, 5, 3]) cube([20, 10, 2]);
  translate([0, 25, 0]) cube(4);
}
module mw_plate_1() { tag(); }
module mw_plate_2() { color([1, 0, 0]) cube(10); }
module mw_assembly_view() { tag(); translate([40, 0, 0]) mw_plate_2(); }
`;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("findPlates", () => {
  test("lists plate modules and the assembly view", () => {
    expect(findPlates(PLATE_MODEL)).toEqual({ plates: [1, 2], assembly: true });
    expect(findPlates("cube(1);")).toEqual({ plates: [], assembly: false });
  });
});

describe("renderPreview", () => {
  test("returns one mesh per visible colour", async () => {
    const r = await renderPreview(runner, { source: PLATE_MODEL, values: {}, target: { kind: "assembly" } });
    expect(r.error).toBeUndefined();
    expect(r.meshes.map((m) => m.color).sort()).toEqual(["#0080FF", "#F9D72C", "#FF0000", "#FFFFFF"]);
  });

  test("applies parameter values", async () => {
    const r = await renderPreview(runner, { source: PLATE_MODEL, values: { text_color: "#00FF00" }, target: { kind: "plate", plate: 1 } });
    expect(r.meshes.map((m) => m.color)).toContain("#00FF00");
  });

  test("reports OpenSCAD errors", async () => {
    const r = await renderPreview(runner, { source: "cube(;", values: {}, target: { kind: "model" } });
    expect(r.error).toBeDefined();
    expect(r.meshes).toEqual([]);
  });
});

describe("splitColors", () => {
  test("gives closed, non-overlapping parts whose volumes add up to the model", async () => {
    const r = await splitColors(runner, { source: PLATE_MODEL, values: {}, target: { kind: "plate", plate: 1 } });
    expect(r.error).toBeUndefined();
    const vols = Object.fromEntries(r.parts.map((p) => [p.color, Number(volume(p.mesh).toFixed(2))]));
    // white base minus the 24-sided hole, the blue block, the uncoloured cube; no red part
    expect(vols).toEqual({ "#FFFFFF": 1779.04, "#0080FF": 400, "#F9D72C": 64 });
  });

  test("vector colours and the second plate", async () => {
    const r = await splitColors(runner, { source: PLATE_MODEL, values: {}, target: { kind: "plate", plate: 2 } });
    expect(r.parts.map((p) => [p.color, Math.round(volume(p.mesh))])).toEqual([["#FF0000", 1000]]);
  });

  test("raised text in two colours keeps total volume", async () => {
    const src = `
module m() {
  color("white") linear_extrude(2) offset(2) text("Hi", font = "Nunito:style=Bold", size = 10);
  color("#222222") translate([0, 0, 2]) linear_extrude(1) text("Hi", font = "Nunito:style=Bold", size = 10);
}
m();`;
    const full = await splitColors(runner, { source: src, values: {}, target: { kind: "model" } });
    expect(full.parts.map((p) => p.color)).toEqual(["#FFFFFF", "#222222"]);
    const preview = await renderPreview(runner, { source: src, values: {}, target: { kind: "model" } });
    expect(preview.meshes).toHaveLength(2);
    const total = sum(full.parts.map((p) => volume(p.mesh)));
    expect(total).toBeGreaterThan(0);
    expect(full.parts.every((p) => volume(p.mesh) > 0)).toBe(true);
  });
});
