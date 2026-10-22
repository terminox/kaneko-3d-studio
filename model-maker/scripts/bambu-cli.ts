// Slices a 3MF headless with the Bambu Studio CLI and checks result.json.
// Exit code 0 is not proof on its own (see research §3.5), so the checks look
// at what was sliced.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

export const BAMBU_CLI = "/Applications/BambuStudio.app/Contents/MacOS/BambuStudio";

export type SlicedPlate = {
  id: number;
  total_predication: number;
  filaments: { id: number; total_used_g: number }[];
  objects: { name: string }[];
};
export type SliceResult = { return_code: number; error_string: string; sliced_plates: SlicedPlate[] };

export function slice(file: string, outDir: string, extraArgs: string[] = []): { exit: number; result: SliceResult | null; log: string } {
  const abs = resolve(file);
  const out = resolve(outDir);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  // Absolute paths only: the CLI's GLFW init changes the working directory on macOS.
  const run = spawnSync(BAMBU_CLI, ["--slice", "0", "--outputdir", out, ...extraArgs, abs], { encoding: "utf8" });
  const resultPath = resolve(out, "result.json");
  const result = existsSync(resultPath) ? (JSON.parse(readFileSync(resultPath, "utf8")) as SliceResult) : null;
  return { exit: run.status ?? -1, result, log: (run.stdout ?? "") + (run.stderr ?? "") };
}

/** Problems with a slice, empty when it passed. */
export function checkSlice(result: SliceResult | null, expect: { plates: number; filamentsPerPlate?: number[] }): string[] {
  if (!result) return ["no result.json written"];
  const problems: string[] = [];
  if (result.return_code !== 0) problems.push(`return_code ${result.return_code}: ${result.error_string}`);
  if (result.sliced_plates.length !== expect.plates) problems.push(`${result.sliced_plates.length} plates sliced, expected ${expect.plates}`);
  result.sliced_plates.forEach((p, i) => {
    if (!(p.total_predication > 0)) problems.push(`plate ${p.id}: no print time`);
    if (p.filaments.some((f) => !(f.total_used_g > 0))) problems.push(`plate ${p.id}: a filament has 0 g (missing density?)`);
    const want = expect.filamentsPerPlate?.[i];
    if (want !== undefined && p.filaments.length !== want) problems.push(`plate ${p.id}: ${p.filaments.length} filaments, expected ${want}`);
  });
  return problems;
}
