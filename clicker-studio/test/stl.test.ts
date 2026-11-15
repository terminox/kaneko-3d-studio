import { beforeAll, describe, expect, test } from "bun:test";
import { unzipSync } from "fflate";
import { parseBinaryStl, writeBinaryStl } from "@mm/pipeline/mesh.ts";
import { K, loadKernel } from "../src/geometry/kernel.ts";
import { build, toMesh } from "../src/geometry/build.ts";
import { newDesign } from "../src/design/types.ts";
import { stlZip } from "../src/export/stl.ts";
import { assets } from "./helpers.ts";

beforeAll(async () => {
  await loadKernel();
});

const unzip = (data: Uint8Array) => unzipSync(data);

describe("STL zip", () => {
  test("a split Design gives exactly two STLs, one per half", async () => {
    const egg = K().Manifold.sphere(1, 64).warp((v) => {
      v[0] *= 20;
      v[1] *= 17;
      v[2] *= 25;
    });
    const d = newDesign("split");
    d.files["model-1"] = `data:model/stl;base64,${Buffer.from(writeBinaryStl([toMesh(egg)])).toString("base64")}`;
    d.model = { file: "model-1", name: "m.stl", width: 40, cut: 0.5, rotate: [0, 0, 0] };
    const r = await build(d, assets);
    const names = Object.keys(unzip(stlZip([{ folder: null, groups: r.print }]).data)).sort();
    expect(names).toEqual(["Bottom half.stl", "Top half.stl"]);
  });

  test("a Single key gives one STL per non-support part, each with its triangle count", async () => {
    const d = newDesign("cap");
    const r = await build(d, assets);
    const parts = r.print.flatMap((g) => g.parts).filter((p) => p.role !== "support");
    const { data, files } = stlZip([{ folder: null, groups: r.print }]);
    const entries = unzip(data);
    expect(files).toBe(parts.length);
    expect(Object.keys(entries)).toHaveLength(parts.length);
    expect(Object.keys(entries).some((n) => /^Base/.test(n))).toBe(true);
    for (const g of r.print)
      for (const p of g.parts) {
        if (p.role === "support") continue;
        const file = Object.entries(entries).find(([n]) => n.startsWith(`${g.name}`) && (p.name === g.name || n.includes(p.name)));
        expect(file).toBeDefined();
        expect(parseBinaryStl(file![1]).triangles.length / 3).toBe(p.mesh.triangles.length / 3);
      }
  });

  test("every piece stands on z = 0 and support volumes are skipped", () => {
    const tri = (z: number) => ({ vertices: new Float32Array([0, 0, z, 1, 0, z + 1, 0, 1, z + 2]), triangles: new Uint32Array([0, 1, 2]) });
    const { data } = stlZip([
      { folder: null, groups: [{ name: "Cap", parts: [{ name: "Cap", color: "#fff", mesh: tri(5) }, { name: "Tab support 1", color: "#fff", mesh: tri(0), role: "support" }] }] },
    ]);
    const entries = unzip(data);
    expect(Object.keys(entries)).toEqual(["Cap.stl"]);
    const m = parseBinaryStl(entries["Cap.stl"]);
    expect(Math.min(...Array.from(m.vertices).filter((_, i) => i % 3 === 2))).toBe(0);
  });

  test("a piece's colour parts drop to the bed together, so a decoration stays on its cap", () => {
    const tri = (z: number) => ({ vertices: new Float32Array([0, 0, z, 1, 0, z, 0, 1, z + 1]), triangles: new Uint32Array([0, 1, 2]) });
    const { data } = stlZip([{ folder: null, groups: [{ name: "Cap", parts: [{ name: "Cap", color: "#fff", mesh: tri(4.6) }, { name: "Letter", color: "#000", mesh: tri(13) }] }] }]);
    const entries = unzip(data);
    const lowest = (name: string) => Math.min(...Array.from(parseBinaryStl(entries[name]).vertices).filter((_, i) => i % 3 === 2));
    expect(lowest("Cap.stl")).toBe(0);
    expect(lowest("Cap - Letter.stl")).toBeCloseTo(13 - 4.6, 4);
  });

  test("an Order puts each Design in a folder and repeats get their own files", () => {
    const mesh = { vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 1]), triangles: new Uint32Array([0, 1, 2]) };
    const g = (name: string) => ({ name, parts: [{ name: "Cap", color: "#fff", mesh }] });
    const names = Object.keys(unzip(stlZip([{ folder: "A/b", groups: [g("Cap #1"), g("Cap #2")] }, { folder: "B", groups: [g("Cap")] }, { folder: "B", groups: [g("Cap")] }]).data));
    expect(names.sort()).toEqual(["A-b/Cap #1 - Cap.stl", "A-b/Cap #2 - Cap.stl", "B (2)/Cap.stl", "B/Cap.stl"]);
  });
});
