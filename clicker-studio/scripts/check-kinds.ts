// Builds one fixture Design per kind, exports each as a 3MF and slices it with
// the Bambu Studio CLI. The end-to-end check that every kind prints.
//   bun scripts/check-kinds.ts [kind ...]
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { K, loadKernel } from "../src/geometry/kernel.ts";
import { build, packPlates, toMesh } from "../src/geometry/build.ts";
import { newDesign, type Design } from "../src/design/types.ts";
import { platesTo3mf } from "../src/export/bambu.ts";
import { tracePicture, type Img } from "../src/picture/process.ts";
import type { Traced } from "../src/geometry/decoration.ts";
import { tracedPatches } from "../src/geometry/patches.ts";
import { setPatchHeights } from "../src/design/heights.ts";
import { writeBinaryStl } from "../../model-maker/src/pipeline/mesh.ts";
import { loadTemplate } from "../../model-maker/scripts/templates.ts";
import { checkSlice, slice } from "../../model-maker/scripts/bambu-cli.ts";
import { nodeAssets } from "./node-assets.ts";

await loadKernel();

function face(): Img {
  const w = 220, h = 200;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - 110, y - 110);
      let c = [255, 255, 255, 0];
      const ear = (ex: number) => y < 70 && y > 10 && Math.abs(x - ex) < (y - 10) * 0.6;
      if (r < 80 || ear(55) || ear(165)) c = [247, 208, 70, 255];
      if (Math.hypot(x - 80, y - 100) < 11 || Math.hypot(x - 140, y - 100) < 11) c = [30, 30, 30, 255];
      if (y > 135 && y < 145 && Math.abs(x - 110) < 30) c = [30, 30, 30, 255];
      data.set(c, (y * w + x) * 4);
    }
  return { width: w, height: h, data };
}

/** `expect`: warnings the fixture is meant to raise. */
const fixtures: Record<string, () => { design: Design; traced: Record<string, Traced>; expect?: string[] }> = {
  cap: () => {
    const d = newDesign("cap");
    d.cap.shape = "cat";
    d.cap.size = 26;
    d.keys[0].deco = { type: "emoji", emoji: "😺" };
    d.keys[0].outline = 1;
    return { design: d, traced: {} };
  },
  row: () => {
    const d = newDesign("row");
    d.keys = [..."มิยู"].map((c) => ({ ...d.keys[0], deco: { type: "text", text: c, font: "Kanit-700" } }));
    d.base.texture = "ribs";
    return { design: d, traced: {} };
  },
  grid: () => {
    const d = newDesign("grid");
    d.layout = "wasd";
    d.keys = [..."WASD"].map((c, i) => ({ ...d.keys[0], capColor: ["#F7D046", "#FFFFFF", "#7CC7E8", "#F4B6C8"][i], deco: { type: "text", text: c, font: "Fredoka-700" } }));
    d.base.texture = "diamond";
    return { design: d, traced: {} };
  },
  picture: () => {
    const t = tracePicture(face(), { removeBackground: true, bgStrength: 70, punchHoles: false, colors: 2 });
    const d = newDesign("picture");
    d.cap.style = "inlay";
    d.picture = {
      image: "face",
      crop: { x: 0, y: 0, w: 1, h: 1, rotate: 0 },
      adjust: { brightness: 0, contrast: 0, saturation: 0 },
      removeBackground: true,
      bgStrength: 70,
      punchHoles: false,
      colors: 2,
      palette: ["#F7D046", "#1E1E1E"],
      width: 42,
      useCartoon: false,
    };
    return { design: d, traced: { face: t } };
  },
  layered: () => {
    // Raised picture with layer heights: a flush face, 3 mm eyes, and the mouth on its own at 6 mm.
    const t = tracePicture(face(), { removeBackground: true, bgStrength: 70, punchHoles: false, colors: 2 });
    const d = newDesign("picture");
    d.cap.style = "raised";
    d.picture = {
      image: "face",
      crop: { x: 0, y: 0, w: 1, h: 1, rotate: 0 },
      adjust: { brightness: 0, contrast: 0, saturation: 0 },
      removeBackground: true,
      bgStrength: 70,
      punchHoles: false,
      colors: 2,
      palette: ["#F7D046", "#1E1E1E"],
      width: 42,
      useCartoon: false,
      heights: { colour: [0, 3], pins: [] },
    };
    const mouth = tracedPatches(t).filter((p) => p.layer === 1).sort((a, b) => b.at[1] - a.at[1])[0];
    setPatchHeights(d.picture.heights!, [mouth], 6);
    return { design: d, traced: { face: t }, expect: ["warn.tall"] };
  },
  fluted: () => {
    const d = newDesign("fluted");
    d.keys = [..."LOVE"].map((c, i) => ({ ...d.keys[0], baseColor: ["#F4B6C8", "#9ED9D0", "#F7D046", "#C7B3E6"][i], deco: { type: "text", text: c, font: "Fredoka-700" } }));
    return { design: d, traced: {} };
  },
  model: () => {
    const m = K().Manifold.sphere(10, 64).add(K().Manifold.sphere(4, 32).translate([7, 0, 7])).add(K().Manifold.sphere(4, 32).translate([-7, 0, 7]));
    const d = newDesign("model");
    d.files.m = `data:model/stl;base64,${Buffer.from(writeBinaryStl([toMesh(m)])).toString("base64")}`;
    d.model = { file: "m", name: "bear.stl", width: 32, cut: 0.25, rotate: [0, 0, 0] };
    d.keys[0].capColor = "#8A5A3C";
    return { design: d, traced: {} };
  },
  "az-set": () => {
    const d = newDesign("cap");
    d.parts = "az-set";
    return { design: d, traced: {} };
  },
};

const only = process.argv.slice(2);
mkdirSync("out/kinds", { recursive: true });
let failed = 0;
for (const [name, make] of Object.entries(fixtures)) {
  if (only.length && !only.includes(name)) continue;
  const { design, traced, expect = [] } = make();
  const r = await build(design, { ...nodeAssets(), traced });
  const plates = packPlates(r.print, { byColour: name === "fluted" });
  const { data } = platesTo3mf(name, plates, loadTemplate());
  const file = resolve(`out/kinds/${name}.3mf`);
  writeFileSync(file, data);
  const { result } = slice(file, resolve(`out/kinds/${name}-slice`));
  const problems = [
    ...r.warnings.filter((w) => !expect.includes(w)).map((w) => `warning ${w}`),
    ...expect.filter((w) => !r.warnings.includes(w)).map((w) => `missing warning ${w}`),
    ...checkSlice(result, { plates: plates.length, filamentsPerPlate: plates.map((p) => new Set(p.groups.flatMap((g) => g.parts.map((x) => x.color.toUpperCase()))).size) }),
  ];
  const p = result?.sliced_plates?.[0];
  console.log(`${name.padEnd(8)} ${problems.length ? "FAIL" : "ok  "} ${p ? `${(p.total_predication / 60).toFixed(0)} min, ${p.filaments.map((f) => `${f.total_used_g.toFixed(1)} g`).join(" + ")}` : ""} ${problems.join("; ")}`);
  if (problems.length) failed++;
}
process.exit(failed ? 1 : 0);
