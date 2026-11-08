// Build Designs from the command line.
//   bun scripts/make.ts design.clicker.json [more.clicker.json ...] [--out out/x.3mf] [--validate]
//   bun scripts/make.ts --kind row --text MAA [--out ...]        (quick Design without a file)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { loadKernel } from "../src/geometry/kernel.ts";
import { build, packPlates, type Group } from "../src/geometry/build.ts";
import { newDesign, upgradeBase, type Design, type Kind } from "../src/design/types.ts";
import { platesTo3mf } from "../src/export/bambu.ts";
import { loadTemplate } from "../../model-maker/scripts/templates.ts";
import { checkSlice, slice } from "../../model-maker/scripts/bambu-cli.ts";
import { nodeAssets } from "./node-assets.ts";

const args = process.argv.slice(2);
const designs: Design[] = [];
let out = "";
let validate = false;
let quick: Design | null = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--out") out = args[++i];
  else if (a === "--validate") validate = true;
  else if (a === "--kind") quick = newDesign(args[++i] as Kind);
  else if (a === "--text") {
    quick ??= newDesign("row");
    const text = args[++i];
    quick.keys = [...text].map((ch) => ({ ...quick!.keys[0], deco: { type: "text", text: ch, font: "Fredoka-700" } }));
  } else if (a === "--style") (quick ??= newDesign("cap")).cap.style = args[++i] as "raised" | "inlay";
  else if (a === "--shape") (quick ??= newDesign("cap")).cap.shape = args[++i] as Design["cap"]["shape"];
  else if (a === "--texture") (quick ??= newDesign("cap")).base.texture = args[++i] as Design["base"]["texture"];
  else if (a === "--parts") (quick ??= newDesign("cap")).parts = args[++i] as Design["parts"];
  else {
    // Fill in fields added since the file was saved, as the app's `upgrade` does.
    const saved = JSON.parse(readFileSync(resolve(a), "utf8")) as Design;
    const fresh = newDesign(saved.kind ?? "cap");
    designs.push({ ...fresh, ...saved, cap: { ...fresh.cap, ...saved.cap }, base: upgradeBase(fresh.base, saved.base ?? {}), fit: { ...fresh.fit, ...saved.fit } });
  }
}
if (quick) designs.push(quick);
if (!designs.length) {
  console.error("usage: bun scripts/make.ts design.clicker.json... [--out file.3mf] [--validate] | --kind row --text MAA");
  process.exit(2);
}

await loadKernel();
const assets = nodeAssets();
const groups: Group[] = [];
for (const d of designs) {
  const t = performance.now();
  const r = await build(d, assets);
  for (const w of r.warnings) console.warn(`  ${d.name}: ${w}`);
  groups.push(...r.print.map((g) => ({ ...g, name: designs.length > 1 ? `${d.name} · ${g.name}` : g.name })));
  console.log(`${d.name} (${d.kind}): ${r.print.length} pieces in ${(performance.now() - t).toFixed(0)} ms`);
}
const plates = packPlates(groups);
const title = designs.length > 1 ? "Order" : designs[0].name;
const { data, filaments, warnings } = platesTo3mf(title, plates, loadTemplate());
for (const w of warnings) console.warn(`  ${w}`);
out ||= `out/${title.replace(/\W+/g, "-").toLowerCase()}.3mf`;
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, data);
console.log(`${out}: ${plates.length} plate(s), filaments ${filaments.join(" ")}`);

if (validate) {
  const { result } = slice(resolve(out), resolve(dirname(out), `${basename(out, ".3mf")}-slice`));
  const problems = checkSlice(result, { plates: plates.length, filamentsPerPlate: plates.map((p) => new Set(p.groups.flatMap((g) => g.parts.map((x) => x.color))).size) });
  for (const p of result?.sliced_plates ?? []) console.log(`  plate ${p.id}: ${(p.total_predication / 60).toFixed(1)} min, ${p.filaments.map((f) => `F${f.id} ${f.total_used_g.toFixed(2)} g`).join(", ")}`);
  if (problems.length) {
    console.error(`  FAILED: ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log("  slice OK");
}
