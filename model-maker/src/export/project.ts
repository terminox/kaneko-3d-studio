// Model + values -> Bambu project 3MF (or STL), shared by the app and the CLI.
import type { OpenScadRunner } from "../openscad/runner.ts";
import { writeBinaryStl } from "../pipeline/mesh.ts";
import { findPlates, splitColors, type Job } from "../pipeline/render.ts";
import { writeBambu3mf, type PlateInput, type ProjectTemplate } from "./bambu3mf.ts";

export type ExportJob = Omit<Job, "target"> & { title: string; template: ProjectTemplate | null };
export type ExportResult = { data: Uint8Array; filaments: string[]; warnings: string[]; log: string[] };

/** One plate per `mw_plate_N()`, or a single plate for the whole model. */
export async function export3mf(runner: OpenScadRunner, job: ExportJob, onProgress?: (msg: string) => void): Promise<ExportResult> {
  const { plates } = findPlates(job.source);
  const targets = plates.length
    ? plates.map((plate) => ({ name: `Plate ${plate}`, target: { kind: "plate", plate } as const }))
    : [{ name: job.title, target: { kind: "model" } as const }];

  const log: string[] = [];
  const inputs: PlateInput[] = [];
  for (const { name, target } of targets) {
    onProgress?.(`Splitting colours: ${name}`);
    const split = await splitColors(runner, { ...job, target });
    log.push(...split.log);
    if (split.error && !split.parts.length && plates.length === 0) throw new Error(split.error);
    inputs.push({ name, parts: split.parts.map((p, i) => ({ name: `${name} · colour ${i + 1} ${p.color}`, color: p.color, mesh: p.mesh })) });
  }
  const result = writeBambu3mf({ title: job.title, plates: inputs, template: job.template });
  return { ...result, log };
}

/** STL of the whole model, all colours merged. MakerWorld disables STL for multi-plate scripts; so do we. */
export async function exportStl(runner: OpenScadRunner, job: Omit<Job, "target">): Promise<Uint8Array> {
  if (findPlates(job.source).plates.length) throw new Error("This model uses plates (mw_plate_N): export a 3MF instead");
  const split = await splitColors(runner, { ...job, target: { kind: "model" } });
  if (!split.parts.length) throw new Error(split.error ?? "The model is empty");
  return writeBinaryStl(split.parts.map((p) => p.mesh));
}
