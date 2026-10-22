import { expect, test } from "bun:test";
import { scadLiteral, toDefines } from "./defines.ts";

test("scadLiteral writes each value type as OpenSCAD source", () => {
  expect(scadLiteral(15)).toBe("15");
  expect(scadLiteral(-0.25)).toBe("-0.25");
  expect(scadLiteral(1e-7)).toBe("0.0000001");
  expect(scadLiteral(true)).toBe("true");
  expect(scadLiteral([1, 2.5])).toBe("[1, 2.5]");
  expect(scadLiteral('say "hi"\\n\nสวัสดี')).toBe('"say \\"hi\\"\\\\n\\nสวัสดี"');
});

test("scadLiteral refuses values OpenSCAD can't take", () => {
  expect(() => scadLiteral(Number.NaN)).toThrow();
  expect(() => scadLiteral(Infinity)).toThrow();
});

test("toDefines emits one -D pair per value", () => {
  expect(toDefines({ Name: "Kaneko", Size: 12, Ring: false })).toEqual([
    "-D", 'Name="Kaneko"', "-D", "Size=12", "-D", "Ring=false",
  ]);
});

test("toDefines rejects names that would inject code", () => {
  expect(() => toDefines({ "a=1;b": 2 })).toThrow();
});
