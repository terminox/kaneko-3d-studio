// Render a model from the command line.
//   bun scripts/make.ts models/name-keychain.scad -D Name=Kaneko -D Font="Kanit:style=Bold" [--out out/x.3mf] [--stl] [--validate]
// Files next to the .scad (e.g. default.svg) are available to it; --file param=path supplies an upload.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { createNodeRunner } from "../src/openscad/node-runner.ts";
import { parseParams, type Param, type ParamValues } from "../src/params/parse.ts";
import { export3mf, exportStl } from "../src/export/project.ts";
import { loadTemplate } from "./templates.ts";
import { checkSlice, slice } from "./bambu-cli.ts";
import { strFromU8, unzipSync } from "fflate";

const args = process.argv.slice(2);
const scadPath = resolve(args[0] ?? "");
if (!args[0] || extname(scadPath) !== ".scad") {
  console.error("usage: bun scripts/make.ts model.scad [-D name=value]... [--file param=path]... [--out file] [--stl] [--validate]");
  process.exit(2);
}
const source = readFileSync(scadPath, "utf8");
const params = new Map(parseParams(source).groups.flatMap((g) => g.params).map((p) => [p.name, p] as [string, Param]));

const values: ParamValues = {};
const files: Record<string, Uint8Array> = {};
for (const f of readdirSync(dirname(scadPath))) {
  if (/^default\.(png|svg|stl)$/i.test(f)) files[f] = readFileSync(join(dirname(scadPath), f));
}
let out = "";
let stl = false;
let validate = false;
for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (a === "-D") {
    const [name, ...rest] = args[++i].split("=");
    values[name] = coerce(params.get(name), rest.join("="));
  } else if (a === "--file") {
    const [name, path] = args[++i].split("=");
    const ext = extname(path).slice(1).toLowerCase();
    files[`uploads/${name}.${ext}`] = readFileSync(resolve(path));
    values[name] = `uploads/${name}.${ext}`;
  } else if (a === "--out") out = args[++i];
  else if (a === "--stl") stl = true;
  else if (a === "--validate") validate = true;
  else throw new Error(`Unknown argument ${a}`);
}

function coerce(param: Param | undefined, raw: string): ParamValues[string] {
  if (!param) throw new Error(`Unknown parameter: ${raw}`);
  const d = param.default;
  if (typeof d === "number") return Number(raw);
  if (typeof d === "boolean") return raw === "true";
  if (Array.isArray(d)) return raw.replace(/[\[\]]/g, "").split(",").map(Number);
  return raw;
}

const runner = createNodeRunner();
const title = basename(scadPath, ".scad");
out ||= join("out", `${title}.${stl ? "stl" : "3mf"}`);
mkdirSync(dirname(resolve(out)), { recursive: true });
const t0 = performance.now();
if (stl) {
  writeFileSync(out, await exportStl(runner, { source, values, files }));
} else {
  const r = await export3mf(runner, { source, values, files, title, template: loadTemplate() }, (m) => console.log(m));
  writeFileSync(out, r.data);
  console.log(`filaments: ${r.filaments.join(", ")}`);
  for (const w of r.warnings) console.log(`warning: ${w}`);
}
console.log(`wrote ${out} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

if (validate && !stl) {
  const zip = unzipSync(readFileSync(out));
  const settings = strFromU8(zip["Metadata/model_settings.config"]);
  const plates = (settings.match(/<plate>/g) ?? []).length;
  const { result } = slice(out, join(dirname(resolve(out)), `${title}-slice`));
  const problems = checkSlice(result, { plates });
  for (const p of result?.sliced_plates ?? []) {
    console.log(`plate ${p.id}: ${(p.total_predication / 60).toFixed(1)} min, ${p.filaments.map((f) => `F${f.id} ${f.total_used_g.toFixed(2)} g`).join(", ")}`);
  }
  if (problems.length) {
    console.error(`SLICE FAILED: ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log("slice OK");
}
