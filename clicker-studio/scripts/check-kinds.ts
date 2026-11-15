// Builds one fixture Design per kind, exports each as a 3MF and slices it with
// the Bambu Studio CLI. The end-to-end check that every kind prints.
//   bun scripts/check-kinds.ts [kind ...]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { K, loadKernel } from "../src/geometry/kernel.ts";
import { build, packPlates, toMesh } from "../src/geometry/build.ts";
import { newDesign, type Design } from "../src/design/types.ts";
import { platesTo3mf } from "../src/export/bambu.ts";
import { tracePicture, type Img } from "../src/picture/process.ts";
import type { Traced } from "../src/geometry/decoration.ts";
import { tracedPatches } from "../src/geometry/patches.ts";
import { setPatchHeights } from "../src/design/heights.ts";
import { nearestFilament } from "../src/design/palette.ts";
import { pathToRings } from "../src/geometry/path.ts";
import { ellipsePath, pointsPath, rectPath, shapesToTraced, type SvgShape } from "../src/picture/svg.ts";
import { writeBinaryStl } from "../../model-maker/src/pipeline/mesh.ts";
import { loadTemplate } from "../../model-maker/scripts/templates.ts";
import { checkSlice, slice, supportMoves } from "../../model-maker/scripts/bambu-cli.ts";
import type { Plate } from "../src/geometry/build.ts";
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

/** Split a model: a 44 mm egg with a flat bottom, in two colours. */
function splitEgg(style: "plug" | "plain") {
  const egg = K().Manifold.sphere(1, 96).warp((v) => {
    const s = 1 - 0.15 * v[2];
    v[0] *= 20 * s;
    v[1] *= 17 * s;
    v[2] *= 25;
  });
  const d = newDesign("split");
  d.files["model-egg"] = `data:model/stl;base64,${Buffer.from(writeBinaryStl([toMesh(egg)])).toString("base64")}`;
  d.model = { file: "model-egg", name: "egg.stl", width: 44, cut: 0.1, rotate: [0, 0, 0] };
  d.split = { ...d.split!, style };
  d.keys[0].capColor = "#F7D046";
  return { design: d, traced: {} };
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
  loop45: () => {
    const d = newDesign("cap");
    d.base.loop = "angle";
    d.base.loopAngle = 45;
    d.base.loopSlide = 2;
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
    d.cap.border = 1.2; // outward: the cap and Base grow around the picture
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
    // Raised picture with layer heights: a flush face, 3 mm eyes, and the mouth on its own at 6 mm, to the edge.
    const t = tracePicture(face(), { removeBackground: true, bgStrength: 70, punchHoles: false, colors: 2 });
    const d = newDesign("picture");
    d.cap.style = "raised";
    d.cap.border = 0;
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
  "split-plug": () => splitEgg("plug"),
  "split-plain": () => splitEgg("plain"),
  wide: () => {
    // A wide cap on two Switches: a 70 × 24 bar picture.
    const w = 280, h = 96;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(Math.hypot(Math.max(0, Math.abs(x - 140) - 92), Math.max(0, Math.abs(y - 48) - 0)) < 48 ? [124, 199, 232, 255] : [255, 255, 255, 0], (y * w + x) * 4);
    const t = tracePicture({ width: w, height: h, data }, { removeBackground: true, bgStrength: 70, punchHoles: false, colors: 1 });
    const d = newDesign("picture");
    d.cap.border = 1.2;
    d.picture = {
      image: "bar",
      crop: { x: 0, y: 0, w: 1, h: 1, rotate: 0 },
      adjust: { brightness: 0, contrast: 0, saturation: 0 },
      removeBackground: true,
      bgStrength: 70,
      punchHoles: false,
      colors: 1,
      palette: ["#7CC7E8"],
      width: 70,
      useCartoon: false,
    };
    return { design: d, traced: { bar: t } };
  },
  hconn: () => {
    // H-connector, tab + socket, on a ribbed single key.
    const d = newDesign("cap");
    d.base.connectors = { ...d.base.connectors, left: "tab", right: "socket" };
    d.base.texture = "ribs";
    return { design: d, traced: {} };
  },
  "hconn-heart": () => {
    // A heart Base bulges past the joint: the socket housing and tab arm reach out to its lobes.
    const d = newDesign("cap");
    d.cap.shape = "heart";
    d.cap.size = 36.5;
    d.base.connectors = { ...d.base.connectors, left: "tab", right: "socket" };
    return { design: d, traced: {} };
  },
  "hconn-topbottom": () => {
    // Tab on top, socket on the bottom.
    const d = newDesign("cap");
    d.base.connectors = { ...d.base.connectors, top: "tab", bottom: "socket" };
    return { design: d, traced: {} };
  },
  svg: () => {
    // SVG art in paint order: a white background (dropped), a face with ears, white eyes,
    // black pupils with white highlights drawn on top, and a pink mouth. Raised: eyes, highlights
    // and mouth at 0.8 mm, pupils at 1.2 mm.
    const s = (d: string, fill: string): SvgShape => ({ rings: pathToRings(d, 0.05), fill, evenOdd: false });
    const t = shapesToTraced(
      [
        s(rectPath(0, 0, 120, 110, null, null), "#FFFFFF"),
        s(pointsPath("18,40 30,4 52,26"), "#F7D046"),
        s(pointsPath("102,40 90,4 68,26"), "#F7D046"),
        s(ellipsePath(60, 62, 46, 44), "#F7D046"),
        s(ellipsePath(42, 55, 10, 12), "#FFFFFF"),
        s(ellipsePath(78, 55, 10, 12), "#FFFFFF"),
        s(ellipsePath(44, 58, 6, 6), "#1E1E1E"),
        s(ellipsePath(80, 58, 6, 6), "#1E1E1E"),
        s(ellipsePath(46, 55, 2, 2), "#FFFFFF"),
        s(ellipsePath(82, 55, 2, 2), "#FFFFFF"),
        s(rectPath(48, 80, 24, 8, 4, null), "#F4B6C8"),
      ],
      120,
      110,
      4,
      0,
    );
    const d = newDesign("picture");
    d.cap.style = "raised";
    d.cap.border = 1.2;
    d.picture = {
      image: "art",
      crop: { x: 0, y: 0, w: 1, h: 1, rotate: 0 },
      adjust: { brightness: 0, contrast: 0, saturation: 0 },
      removeBackground: false,
      bgStrength: 0,
      punchHoles: false,
      colors: 4,
      palette: t.colours.map(nearestFilament),
      width: 40,
      useCartoon: false,
      heights: { colour: [0, 0.8, 1.2, 0.8], pins: [] },
    };
    return { design: d, traced: { art: t } };
  },
  "hconn-picture": () => {
    // Tab only on a picture Base: the connector sits on the middle of its right side.
    const t = tracePicture(face(), { removeBackground: true, bgStrength: 70, punchHoles: false, colors: 2 });
    const d = newDesign("picture");
    d.base.connectors = { ...d.base.connectors, right: "tab" };
    d.picture = {
      image: "face",
      crop: { x: 0, y: 0, w: 1, h: 1, rotate: 0 },
      adjust: { brightness: 0, contrast: 0, saturation: 0 },
      removeBackground: true,
      bgStrength: 70,
      punchHoles: false,
      colors: 2,
      palette: ["#F7D046", "#1E1E1E"],
      width: 32,
      useCartoon: false,
    };
    return { design: d, traced: { face: t } };
  },
  "hconn-row4": () => {
    // A 4-key row: the top tab and bottom socket sit between the middle keys.
    const d = newDesign("row");
    d.keys = [..."LOVE"].map((c) => ({ ...d.keys[0], deco: { type: "text", text: c, font: "Fredoka-700" } }));
    d.base.connectors = { ...d.base.connectors, top: "tab", bottom: "socket" };
    return { design: d, traced: {} };
  },
  "hconn-grid": () => {
    // A 2x2 grid: left tab and right socket on one line, between the rows.
    const d = newDesign("grid");
    d.layout = "grid";
    d.columns = 2;
    d.keys = [..."ABCD"].map((c) => ({ ...d.keys[0], deco: { type: "text", text: c, font: "Fredoka-700" } }));
    d.base.connectors = { ...d.base.connectors, left: "tab", right: "socket" };
    return { design: d, traced: {} };
  },
  "hconn-fluted": () => {
    const d = newDesign("fluted");
    d.base.join = "connector";
    d.keys = [..."LOVE"].map((c, i) => ({ ...d.keys[0], baseColor: ["#F4B6C8", "#9ED9D0", "#F7D046", "#C7B3E6"][i], deco: { type: "text", text: c, font: "Fredoka-700" } }));
    return { design: d, traced: {} };
  },
  "az-set": () => {
    const d = newDesign("cap");
    d.parts = "az-set";
    return { design: d, traced: {} };
  },
};

/**
 * Support must print exactly where H-connector tabs ask for it: some support on
 * every plate with a tab, every support move inside a tab's enforcer (plus the
 * slicer's few mm of support base), and none on other plates.
 */
function supportProblems(plates: Plate[], sliceDir: string): string[] {
  const margin = 5;
  const problems: string[] = [];
  plates.forEach((plate, i) => {
    const file = resolve(sliceDir, `plate_${i + 1}.gcode`);
    if (!existsSync(file)) return;
    const moves = supportMoves(readFileSync(file, "utf8"));
    const boxes = plate.groups.flatMap((g) => g.parts.filter((p) => p.role === "support")).map((p) => {
      const v = p.mesh.vertices;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = 0; k < v.length; k += 3) {
        x0 = Math.min(x0, v[k]); x1 = Math.max(x1, v[k]);
        y0 = Math.min(y0, v[k + 1]); y1 = Math.max(y1, v[k + 1]);
      }
      return { x0: x0 - margin, x1: x1 + margin, y0: y0 - margin, y1: y1 + margin };
    });
    if (!boxes.length && moves.length) problems.push(`plate ${i + 1}: ${moves.length} support moves but no tab`);
    if (boxes.length && !moves.length) problems.push(`plate ${i + 1}: tabs but no support printed`);
    const stray = moves.filter(([x, y]) => !boxes.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1));
    if (boxes.length && stray.length) problems.push(`plate ${i + 1}: ${stray.length} support moves away from the tabs, e.g. ${stray[0].map((n) => n.toFixed(1)).join(",")}`);
  });
  return problems;
}

const only = process.argv.slice(2);
mkdirSync("out/kinds", { recursive: true });
let failed = 0;
for (const [name, make] of Object.entries(fixtures)) {
  if (only.length && !only.includes(name)) continue;
  const { design, traced, expect = [] } = make();
  const r = await build(design, { ...nodeAssets(), traced });
  const switches = r.switchesPerCap > 1 ? `${r.switchesPerCap} switches, ` : "";
  const plates = packPlates(r.print, { byColour: name.includes("fluted") });
  const { data } = platesTo3mf(name, plates, loadTemplate());
  const file = resolve(`out/kinds/${name}.3mf`);
  writeFileSync(file, data);
  const { result } = slice(file, resolve(`out/kinds/${name}-slice`));
  const problems = [
    ...r.warnings.filter((w) => !expect.includes(w)).map((w) => `warning ${w}`),
    ...expect.filter((w) => !r.warnings.includes(w)).map((w) => `missing warning ${w}`),
    ...checkSlice(result, { plates: plates.length, filamentsPerPlate: plates.map((p) => new Set(p.groups.flatMap((g) => g.parts.map((x) => x.color.toUpperCase()))).size) }),
    ...supportProblems(plates, resolve(`out/kinds/${name}-slice`)),
  ];
  const p = result?.sliced_plates?.[0];
  console.log(`${name.padEnd(8)} ${problems.length ? "FAIL" : "ok  "} ${switches}${p ? `${(p.total_predication / 60).toFixed(0)} min, ${p.filaments.map((f) => `${f.total_used_g.toFixed(1)} g`).join(" + ")}` : ""} ${problems.join("; ")}`);
  if (problems.length) failed++;
}
process.exit(failed ? 1 : 0);
