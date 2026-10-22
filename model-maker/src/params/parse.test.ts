import { describe, expect, test } from "bun:test";
import { parseParams, type Param } from "./parse.ts";

function byName(src: string): Record<string, Param> {
  const schema = parseParams(src);
  return Object.fromEntries(schema.groups.flatMap((g) => g.params).map((p) => [p.name, p]));
}

describe("parseParams", () => {
  test("groups, descriptions and labels follow the Customizer comments", () => {
    const schema = parseParams(`
/* [Text] */
// Text shown on the keychain
Name = "Kaneko";
// Approximate letter height in mm
Text_Size = 15; // [1:1:100]

/*[ Ring ]*/
Ring = true;
`);
    expect(schema.groups.map((g) => g.name)).toEqual(["Text", "Ring"]);
    const [name, size] = schema.groups[0].params;
    expect(name).toMatchObject({ name: "Name", label: "Name", type: "string", default: "Kaneko", description: "Text shown on the keychain" });
    expect(size).toMatchObject({ label: "Text Size", type: "slider", min: 1, step: 1, max: 100, default: 15 });
    expect(schema.groups[1].params[0]).toMatchObject({ type: "boolean", default: true, description: undefined });
  });

  test("parameters before any group land in an unnamed group", () => {
    expect(parseParams("a = 1;").groups).toEqual([
      { name: "", params: [expect.objectContaining({ name: "a", type: "number", default: 1 })] },
    ]);
  });

  test("description is only the comment line directly above", () => {
    const p = byName(`
// not mine

// mine
a = 1;
////////////////
b = 2;
`);
    expect(p.a.description).toBe("mine");
    expect(p.b.description).toBeUndefined();
  });

  test("dropdowns: plain, numeric and labelled", () => {
    const p = byName(`
n = 2; // [0, 1, 2, 3]
s = "foo"; // [foo, bar, baz]
ln = 10; // [10:L, 20:M, 30:XL]
ls = "S"; // [S:Small, M:Medium, L:Large]
`);
    expect(p.n).toMatchObject({ type: "dropdown", options: [0, 1, 2, 3].map((v) => ({ value: v, label: String(v) })) });
    expect(p.s).toMatchObject({ type: "dropdown", options: [{ value: "foo", label: "foo" }, { value: "bar", label: "bar" }, { value: "baz", label: "baz" }] });
    expect(p.ln).toMatchObject({ type: "dropdown", default: 10, options: [{ value: 10, label: "L" }, { value: 20, label: "M" }, { value: 30, label: "XL" }] });
    expect(p.ls).toMatchObject({ type: "dropdown", default: "S", options: [{ value: "S", label: "Small" }, { value: "M", label: "Medium" }, { value: "L", label: "Large" }] });
  });

  test("sliders: [min:max], [min:step:max], [max] and decimals", () => {
    const p = byName(`
a = 34; // [10:100]
b = 2; //[0:5:100]
c = 2; //[0:0.1:100]
d = 5; // [20]
`);
    expect(p.a).toMatchObject({ type: "slider", min: 10, max: 100, step: 1 });
    expect(p.b).toMatchObject({ type: "slider", min: 0, max: 100, step: 5 });
    expect(p.c).toMatchObject({ type: "slider", min: 0, max: 100, step: 0.1 });
    expect(p.d).toMatchObject({ type: "slider", min: 0, max: 20, step: 1 });
  });

  test("spinbox step comes from the default's decimals", () => {
    const p = byName("i = 5;\nf = 5.0;\ng = 0.25;\nneg = -3;");
    expect(p.i).toMatchObject({ type: "number", step: 1 });
    expect(p.f).toMatchObject({ type: "number", step: 0.1 });
    expect(p.g).toMatchObject({ type: "number", step: 0.01 });
    expect(p.neg).toMatchObject({ type: "number", default: -3 });
  });

  test("vectors, with and without a range", () => {
    const p = byName(`
v = [12, 34, 46, 24];
rgb = [128, 23, 231]; //[0:1:255]
w = [ 12, 34 ]; //[:0.1:]
`);
    expect(p.v).toMatchObject({ type: "vector", default: [12, 34, 46, 24], step: 1 });
    expect(p.rgb).toMatchObject({ type: "vector", min: 0, step: 1, max: 255 });
    expect(p.w).toMatchObject({ type: "vector", default: [12, 34], step: 0.1, min: undefined, max: undefined });
  });

  test("MakerWorld extensions: color, font and file uploads", () => {
    const p = byName(`
Base_Color = "#FFFFFF"; // color
c2 = "#ff0000"; //Color
Font = "Nunito:style=Bold"; // font
png = "default.png";
svg = "default.svg";
stl = "default.stl";
`);
    expect(p.Base_Color).toMatchObject({ type: "color", default: "#FFFFFF" });
    expect(p.c2).toMatchObject({ type: "color" });
    expect(p.Font).toMatchObject({ type: "font", default: "Nunito:style=Bold" });
    expect(p.png).toMatchObject({ type: "file", accept: "png" });
    expect(p.svg).toMatchObject({ type: "file", accept: "svg" });
    expect(p.stl).toMatchObject({ type: "file", accept: "stl" });
  });

  test("string max length comment", () => {
    expect(byName('t = "hi"; // 8').t).toMatchObject({ type: "string", maxLength: 8 });
  });

  test("Hidden group is dropped, other groups keep going after it", () => {
    const schema = parseParams(`
/* [A] */
a = 1;
/* [Hidden] */
h = 2;
/* [B] */
b = 3;
`);
    expect(schema.groups.map((g) => g.name)).toEqual(["A", "B"]);
  });

  test("stops at the first module or function; skips non-literal assignments", () => {
    const p = byName(`
a = 1;
b = a * 2;
c = "x"; // a comment with // inside
function f(x) = x;
d = 4;
`);
    expect(Object.keys(p)).toEqual(["a", "c"]);
  });

  test("string values may contain // and escaped quotes", () => {
    const p = byName(String.raw`url = "http://a.b/c"; // [http://a.b/c, x]
q = "say \"hi\"";`);
    expect(p.url).toMatchObject({ type: "dropdown", default: "http://a.b/c" });
    expect(p.q).toMatchObject({ type: "string", default: 'say "hi"' });
  });

  test("ignores block comments that are not group markers and include/use lines", () => {
    const p = byName(`
include <BOSL2/std.scad>;
/* just a note */
/*
  multi line
*/
a = 1;
`);
    expect(Object.keys(p)).toEqual(["a"]);
  });

  test("a later assignment to the same name overrides the earlier one", () => {
    const p = byName("a = 1;\na = 2; // [0:10]");
    expect(p.a).toMatchObject({ default: 2, type: "slider" });
    expect(parseParams("a = 1;\na = 2;").groups[0].params).toHaveLength(1);
  });
});
