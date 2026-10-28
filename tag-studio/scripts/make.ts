// Build Name Tags from the command line.
//   bun scripts/make.ts --picture cat.png --names "Miyu,Kaneko" [--colors 3] [--font Kanit-700] [--out out/x.3mf] [--validate]
//   bun scripts/make.ts design.tag.json [--out ...] [--validate]     (a Design saved from the app)
// Pictures must be PNG here; the CLI applies the crop but not rotation or the light adjustments.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { loadKernel } from "@cs/geometry/kernel.ts";
import { nearestFilament } from "@cs/design/palette.ts";
import { tracePicture } from "@cs/picture/process.ts";
import { platesTo3mf } from "@cs/export/bambu.ts";
import { loadTemplate } from "../../model-maker/scripts/templates.ts";
import { checkSlice, slice } from "../../model-maker/scripts/bambu-cli.ts";
import { newTagDesign, upgradeTag, type TagDesign } from "../src/design/types.ts";
import { buildAll } from "../src/geometry/tag.ts";
import { nodeFont } from "./node-assets.ts";
import { cropAndShrink, decodePng } from "./png.ts";

const args = process.argv.slice(2);
let design: TagDesign = newTagDesign();
let picture = "";
let out = "";
let validate = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--out") out = args[++i];
  else if (a === "--validate") validate = true;
  else if (a === "--picture") picture = args[++i];
  else if (a === "--names") design.names = args[++i].split(",");
  else if (a === "--colors") design.picture.colors = Number(args[++i]);
  else if (a === "--font") design.font = args[++i];
  else if (a === "--rings") design.rings.count = Number(args[++i]) as 0 | 1 | 2;
  else if (a.endsWith(".json")) design = upgradeTag(JSON.parse(readFileSync(resolve(a), "utf8")));
  else {
    console.error(`unknown argument ${a}\nusage: bun scripts/make.ts [design.tag.json] [--picture x.png] [--names "A,B"] [--colors 3] [--font Kanit-700] [--rings 1] [--out file.3mf] [--validate]`);
    process.exit(2);
  }
}

await loadKernel();
const traced: Parameters<typeof buildAll>[1]["traced"] = {};
const p = design.picture;
let bytes: Uint8Array | null = null;
if (picture) {
  bytes = readFileSync(resolve(picture));
  p.image = "picture";
  p.palette = [];
} else if (p.image) {
  const src = design.files[p.useCartoon && design.files[`${p.image}:cartoon`] ? `${p.image}:cartoon` : p.image] ?? "";
  if (!src.startsWith("data:image/png;base64,")) throw new Error("the CLI can only read PNG pictures");
  bytes = Buffer.from(src.slice(src.indexOf(",") + 1), "base64");
}
if (bytes) {
  const full = { x: 0, y: 0, w: 1, h: 1 };
  const img = cropAndShrink(decodePng(bytes), p.useCartoon ? full : p.crop, 360);
  const tr = tracePicture(img, p);
  if (p.palette.length !== tr.colours.length) p.palette = tr.colours.map(nearestFilament);
  traced[p.image] = tr;
  console.log(`picture: ${img.width} × ${img.height} px, colours ${p.palette.join(" ")}`);
}

const t = performance.now();
const { plates, warnings, tags } = await buildAll(design, { font: nodeFont, traced });
for (const w of warnings) console.warn(`  ${w}`);
const res = platesTo3mf(design.name, plates, loadTemplate());
for (const w of res.warnings) console.warn(`  ${w}`);
out ||= `out/${design.name.replace(/\W+/g, "-").toLowerCase()}.3mf`;
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, res.data);
console.log(`${out}: ${tags} tag(s) on ${plates.length} plate(s) in ${(performance.now() - t).toFixed(0)} ms, filaments ${res.filaments.join(" ")}`);

if (validate) {
  const { result } = slice(resolve(out), resolve(dirname(out), `${basename(out, ".3mf")}-slice`));
  const problems = checkSlice(result, { plates: plates.length, filamentsPerPlate: plates.map((pl) => new Set(pl.groups.flatMap((g) => g.parts.map((x) => x.color))).size) });
  for (const pl of result?.sliced_plates ?? []) console.log(`  plate ${pl.id}: ${(pl.total_predication / 60).toFixed(1)} min, ${pl.filaments.map((f) => `F${f.id} ${f.total_used_g.toFixed(2)} g`).join(", ")}`);
  if (problems.length) {
    console.error(`  FAILED: ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log("  slice OK");
}
