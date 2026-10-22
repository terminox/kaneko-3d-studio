// Checks our parser against OpenSCAD's own Customizer parser (`-o x.param`)
// on every bundled model. Our extra types (color, font, file) are plain
// strings to OpenSCAD.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createNodeRunner } from "../openscad/node-runner.ts";
import { parseParams } from "./parse.ts";

type OscParam = { name: string; group: string; caption?: string; initial: unknown; min?: number; max?: number; step?: number; options?: { name: string; value: string | number }[] };

const MODELS = resolve(import.meta.dir, "../../models");
const runner = createNodeRunner();

describe("parser agrees with OpenSCAD's Customizer", () => {
  for (const dir of readdirSync(MODELS)) {
    test(dir, async () => {
      const source = readFileSync(join(MODELS, dir, `${dir}.scad`), "utf8");
      const r = await runner.run({ files: { "m.scad": source }, args: ["m.scad", "--enable=textmetrics", "-o", "m.param"], outputs: ["m.param"] });
      const theirs = (JSON.parse(new TextDecoder().decode(r.outputs["m.param"]!)) as { parameters: OscParam[] }).parameters.filter(
        (p) => p.group !== "Hidden",
      );
      const ours = parseParams(source).groups.flatMap((g) => g.params.map((p) => ({ ...p, group: g.name })));

      expect(ours.map((p) => [p.group, p.name])).toEqual(theirs.map((p) => [p.group, p.name]));
      for (const [i, o] of ours.entries()) {
        const t = theirs[i];
        expect([o.name, o.description ?? ""]).toEqual([t.name, t.caption ?? ""]);
        expect([o.name, o.default]).toEqual([t.name, t.initial as typeof o.default]);
        if (o.type === "slider") expect([o.min, o.step, o.max]).toEqual([t.min!, t.step!, t.max!]);
        if (o.type === "dropdown") expect(o.options.map((x) => [x.value, x.label])).toEqual(t.options!.map((x) => [x.value, x.name]));
      }
    });
  }
});
