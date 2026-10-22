// Rendering a parametric model: the coloured preview, and the export split
// into one closed, non-overlapping solid per colour.
import { toDefines } from "../params/defines.ts";
import type { ParamValues } from "../params/parse.ts";
import { isNoise, type OpenScadRunner, type RunFiles } from "../openscad/runner.ts";
import { DEFAULT_COLOR, normalizeColor } from "./colors.ts";
import { mergeMeshes, parseBinaryStl, parseColoredOff, volume, type ColoredMesh, type Mesh } from "./mesh.ts";

export type Target = { kind: "model" } | { kind: "plate"; plate: number } | { kind: "assembly" };

export type Job = {
  source: string;
  values: ParamValues;
  /** Extra files next to the model, e.g. uploads and default.svg. */
  files?: RunFiles;
  target: Target;
};

export type RenderResult = { meshes: ColoredMesh[]; log: string[]; error?: string };

const MODEL = "model.scad";
const ENGINE = ["--backend=manifold"];
// textmetrics() lets models measure text, e.g. to put a keyring next to a name.
const FEATURES = ["--enable=textmetrics"];
// The clip steps can leave zero-volume slivers along shared faces; anything
// smaller than this (mm³) is not a printable part.
const MIN_PART_VOLUME = 0.05;

/** The `mw_plate_N()` modules a script defines (MakerWorld's multi-plate convention). */
export function findPlates(source: string): { plates: number[]; assembly: boolean } {
  const plates = [...source.matchAll(/^\s*module\s+mw_plate_(\d+)\s*\(/gm)].map((m) => Number(m[1]));
  return {
    plates: [...new Set(plates)].sort((a, b) => a - b),
    assembly: /^\s*module\s+mw_assembly_view\s*\(/m.test(source),
  };
}

function call(target: Target): string {
  if (target.kind === "plate") return `\nmw_plate_${target.plate}();\n`;
  if (target.kind === "assembly") return `\nmw_assembly_view();\n`;
  return "\n";
}

// Shadows the built-in color() so one run keeps only one colour's geometry.
// Appended after the user's code, so their line numbers stay the same. As in
// OpenSCAD, the outermost color() wins, so anything inside a matched color()
// is kept whatever its own colour.
const SPLIT_PRELUDE = `
$mm_pass = "@@all@@";
$mm_in = false;
module color(c, alpha = 1.0) {
  if ($mm_in || $mm_pass == "@@all@@") children();
  else if ($mm_pass == "@@discover@@") { echo(str("@@MMC@@", c)); let($mm_in = true) children(); }
  else if (str(c) == $mm_pass) let($mm_in = true) children();
}
`;

function errorFrom(exitCode: number, log: string[]): string | undefined {
  const err = log.find((l) => /^(ERROR|Execution aborted|Parser error)/i.test(l.trim()));
  if (err) return err.trim();
  return exitCode === 0 ? undefined : `OpenSCAD exited with code ${exitCode}`;
}

/** One render with the colours as OpenSCAD shows them. */
export async function renderPreview(runner: OpenScadRunner, job: Job): Promise<RenderResult> {
  const result = await runner.run({
    files: { ...job.files, [MODEL]: job.source + call(job.target) },
    args: [MODEL, ...ENGINE, ...FEATURES, ...toDefines(job.values), "-o", "out.off"],
    outputs: ["out.off"],
  });
  const log = result.log.filter((l) => !isNoise(l));
  const off = result.outputs["out.off"];
  const error = errorFrom(result.exitCode, log);
  if (!off) return { meshes: [], log, error };
  return { meshes: parseColoredOff(new TextDecoder().decode(off)), log, error };
}

export type Part = { color: string; mesh: Mesh };
export type SplitResult = { parts: Part[]; log: string[]; error?: string };

/**
 * Splits a target into one solid per colour, ready for a part-per-filament 3MF.
 *
 * Each colour is rendered on its own with color() shadowed, then clipped to the
 * full model and to what earlier colours already took:
 *   part(c) = (pass(c) − pass(none) − earlier parts) ∩ full
 * Clipping to `full` restores cuts made by geometry of other colours (which
 * the colour's own pass drops). Uncoloured geometry becomes a final part.
 */
export async function splitColors(runner: OpenScadRunner, job: Job): Promise<SplitResult> {
  const source = job.source + call(job.target) + SPLIT_PRELUDE;
  const defines = toDefines(job.values);
  const log: string[] = [];
  const files: RunFiles = { ...job.files, [MODEL]: source };

  const pass = async (key: string, out: string) => {
    const r = await runner.run({
      files,
      args: [MODEL, ...ENGINE, ...FEATURES, ...defines, "-D", `$mm_pass=${JSON.stringify(key)}`, "--export-format", "binstl", "-o", out],
      outputs: [out],
    });
    log.push(...r.log.filter((l) => !isNoise(l)));
    return { data: r.outputs[out], error: errorFrom(r.exitCode, r.log) };
  };

  // 1. Which colours does the model use? An echo-only run is fast.
  const discover = await runner.run({
    files,
    args: [MODEL, ...FEATURES, ...defines, "-D", `$mm_pass="@@discover@@"`, "-o", "colors.echo"],
    outputs: ["colors.echo"],
  });
  const echo = new TextDecoder().decode(discover.outputs["colors.echo"] ?? new Uint8Array());
  const keys = [...new Set([...echo.matchAll(/^ECHO: "@@MMC@@(.*)"$/gm)].map((m) => m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\")))];

  // 2. The full model, and the geometry outside any color() call.
  const full = await pass("@@all@@", "full.stl");
  if (!full.data) return { parts: [], log, error: full.error ?? "The model is empty" };
  files["full.stl"] = full.data;
  const none = await pass("@@none@@", "none.stl");
  if (none.data) files["none.stl"] = none.data;

  // 3. Each colour, clipped, in the order the model first uses them.
  const done: string[] = [];
  const parts: Part[] = [];
  for (const [i, key] of keys.entries()) {
    const raw = await pass(key, `pass${i}.stl`);
    if (!raw.data) continue;
    files[`pass${i}.stl`] = raw.data;
    const subtract = [none.data ? "none.stl" : null, ...done].filter(Boolean).map((f) => `import("${f}");`);
    const clipped = await combine(`intersection() { difference() { import("pass${i}.stl"); ${subtract.join(" ")} } import("full.stl"); }`, `part${i}.stl`);
    if (!clipped) continue;
    const mesh = parseBinaryStl(clipped);
    if (volume(mesh) < MIN_PART_VOLUME) continue;
    files[`part${i}.stl`] = clipped;
    done.push(`part${i}.stl`);
    parts.push({ color: normalizeColor(key) ?? DEFAULT_COLOR, mesh });
  }

  // 4. Whatever is left belongs to no colour.
  const rest = done.length
    ? await combine(`difference() { import("full.stl"); ${done.map((f) => `import("${f}");`).join(" ")} }`, "rest.stl")
    : full.data;
  const restMesh = rest && parseBinaryStl(rest);
  if (restMesh && volume(restMesh) >= MIN_PART_VOLUME) parts.push({ color: DEFAULT_COLOR, mesh: restMesh });

  return { parts: mergeSameColor(parts), log };

  async function combine(scad: string, out: string): Promise<Uint8Array | undefined> {
    const r = await runner.run({
      files: { ...files, "combine.scad": scad },
      args: ["combine.scad", ...ENGINE, "--export-format", "binstl", "-o", out],
      outputs: [out],
    });
    log.push(...r.log.filter((l) => !isNoise(l) && !/^(Total rendering time|Top level object|\s*(Status|Genus|Vertices|Facets):)/.test(l.trim())));
    return r.outputs[out];
  }
}

// Two spellings of one colour ("red", "#FF0000") print as one part.
function mergeSameColor(parts: Part[]): Part[] {
  const by = new Map<string, Mesh[]>();
  for (const p of parts) by.set(p.color, [...(by.get(p.color) ?? []), p.mesh]);
  return [...by].map(([color, meshes]) => ({ color, mesh: meshes.length === 1 ? meshes[0] : mergeMeshes(meshes) }));
}
