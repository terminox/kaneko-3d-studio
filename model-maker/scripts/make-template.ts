// Builds the print-profile template the 3MF writer embeds.
//
//   bun scripts/make-template.ts
//     Stock A1 0.4 / 0.20mm Standard / Generic PLA, flattened from the presets
//     inside Bambu Studio, then completed by a CLI round trip.
//   bun scripts/make-template.ts --from ../profiles/template.3mf
//     The owner's own project saved from the Bambu Studio GUI (ticket 04). This
//     is the one to use for real prints: it carries the tuned settings.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { writeBambu3mf, BAMBU_STUDIO_VERSION, type ProjectTemplate } from "../src/export/bambu3mf.ts";
import type { Mesh } from "../src/pipeline/mesh.ts";
import { checkSlice, slice } from "./bambu-cli.ts";

const ROOT = resolve(import.meta.dir, "..");
const PRESETS = "/Applications/BambuStudio.app/Contents/Resources/profiles/BBL";
const MACHINE = "Bambu Lab A1 0.4 nozzle";
const PROCESS = "0.20mm Standard @BBL A1";
const FILAMENT = "Generic PLA @BBL A1";
const META = ["name", "type", "from", "inherits", "include", "instantiation", "setting_id", "description",
  "compatible_printers", "compatible_printers_condition", "compatible_prints", "compatible_prints_condition", "renamed_from"];

type Preset = Record<string, unknown>;

function index(kind: string): Map<string, Preset> {
  const byName = new Map<string, Preset>();
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".json")) {
        const preset = JSON.parse(readFileSync(p, "utf8")) as Preset;
        if (typeof preset.name === "string") byName.set(preset.name, preset);
      }
    }
  };
  walk(join(PRESETS, kind));
  return byName;
}

// Parent chain first, then `include` templates, then the preset's own keys,
// the order the GUI's vendor loader uses.
function flatten(presets: Map<string, Preset>, name: string): Preset {
  const p = presets.get(name);
  if (!p) throw new Error(`Preset not found: ${name}`);
  let out: Preset = p.inherits ? flatten(presets, p.inherits as string) : {};
  for (const inc of (p.include as string[] | undefined) ?? []) out = { ...out, ...flatten(presets, inc) };
  return { ...out, ...p };
}

const arrayKeys = (p: Preset) => Object.keys(p).filter((k) => Array.isArray(p[k]));
const strip = (p: Preset) => Object.fromEntries(Object.entries(p).filter(([k]) => !META.includes(k)));

const cube = (s: number): Mesh => ({
  vertices: new Float32Array([0,0,0, s,0,0, s,s,0, 0,s,0, 0,0,s, s,0,s, s,s,s, 0,s,s]),
  triangles: new Uint32Array([0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7]),
});

function roundTrip(template: ProjectTemplate): ProjectTemplate {
  const work = join(ROOT, ".cache/template");
  mkdirSync(work, { recursive: true });
  const file = join(work, "probe.3mf");
  const { data } = writeBambu3mf({ title: "probe", template, plates: [{ name: "probe", parts: [{ name: "cube", color: "#FFFFFF", mesh: cube(20) }] }] });
  writeFileSync(file, data);
  const settingsOut = join(work, "settings.json");
  const { exit, result, log } = slice(file, join(work, "out"), ["--export-settings", settingsOut]);
  const problems = checkSlice(result, { plates: 1 });
  if (problems.length) throw new Error(`Probe slice failed (exit ${exit}): ${problems.join("; ")}\n${log.slice(-2000)}`);
  console.log(`probe sliced: ${result!.sliced_plates[0].total_predication.toFixed(0)} s, ${result!.sliced_plates[0].filaments[0].total_used_g} g`);
  return { ...template, project_settings: JSON.parse(readFileSync(settingsOut, "utf8")) };
}

function stock(): ProjectTemplate {
  const machine = strip(flatten(index("machine"), MACHINE));
  const process = strip(flatten(index("process"), PROCESS));
  const filament = strip(flatten(index("filament"), FILAMENT));
  const project_settings: Preset = {
    ...machine,
    ...process,
    // Per-filament options are already one-element arrays in the presets.
    ...filament,
    version: BAMBU_STUDIO_VERSION,
    name: "project_settings",
    from: "project",
    printer_settings_id: MACHINE,
    print_settings_id: PROCESS,
    filament_settings_id: [FILAMENT],
    inherits_group: ["", "", ""],
    different_settings_to_system: ["", "", ""],
    curr_bed_type: "Textured PEI Plate",
    filament_colour: ["#FFFFFF"],
  };
  return roundTrip({ source: `stock: ${MACHINE} / ${PROCESS} / ${FILAMENT}`, project_settings, filament_keys: arrayKeys(filament) });
}

function fromProject(path: string): ProjectTemplate {
  const zip = unzipSync(readFileSync(path));
  const settings = zip["Metadata/project_settings.config"];
  if (!settings) throw new Error(`${path} has no Metadata/project_settings.config: save it from the Bambu Studio GUI`);
  const project_settings = JSON.parse(strFromU8(settings)) as Preset;
  const filamentKeys = arrayKeys(strip(flatten(index("filament"), FILAMENT)));
  return { source: `project: ${path}`, project_settings, filament_keys: filamentKeys };
}

const from = process.argv.indexOf("--from");
const template = from >= 0 ? fromProject(resolve(process.argv[from + 1])) : stock();
const outName = from >= 0 ? "project-template.json" : "stock-a1-generic-pla.json";
mkdirSync(join(ROOT, "profiles"), { recursive: true });
writeFileSync(join(ROOT, "profiles", outName), JSON.stringify(template, null, 1) + "\n");
console.log(`wrote profiles/${outName} (${Object.keys(template.project_settings).length} keys)`);
if (from < 0 && existsSync(resolve(ROOT, "../profiles/template.3mf"))) {
  console.log("Note: ../profiles/template.3mf exists; run with --from to use the tuned profile.");
}
