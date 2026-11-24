// Geometry worker: builds Designs with manifold-3d off the main thread.
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { loadKernel, release, type Memo } from "./geometry/kernel.ts";
import { build, packPlates, type Group, type Keyring, type Part } from "./geometry/build.ts";
import { parseIconSvg, type Assets, type Traced } from "./geometry/decoration.ts";
import { fontSource } from "./text/font-source.ts";
import { platesTo3mf } from "./export/bambu.ts";
import type { Design } from "./design/types.ts";
import type { PatchInfo } from "./design/heights.ts";
import type { Place } from "./geometry/spots.ts";
import type { SplitInfo } from "./geometry/split.ts";
import { printTemplate } from "./export/template.ts";
import { stlZip, type StlSet } from "./export/stl.ts";

export type BuildRequest = { type: "build"; id: number; design: Design; traced: Record<string, Traced> };
export type ExportRequest = {
  type: "export";
  id: number;
  title: string;
  designs: { design: Design; qty: number }[];
  traced: Record<string, Traced>;
  /** Put one-colour pieces on plates of their own colour (fewer filament swaps). */
  byColour: boolean;
  /** 3mf: packed Bambu Studio plates. stl: a zip of loose STLs, each piece in its own print frame. */
  format: "3mf" | "stl";
};
export type WorkerRequest = BuildRequest | ExportRequest;

export type BuildReply = {
  type: "build";
  id: number;
  assembled: Part[];
  plates: { name: string; groups: Group[] }[];
  warnings: string[];
  switches: [number, number][];
  switchesPerCap: number;
  keyring: Keyring | null;
  bottom: number;
  patches: PatchInfo[];
  place: Place | null;
  split: SplitInfo | null;
  ms: number;
};
export type ExportReply = { type: "export"; id: number; data: Uint8Array; filaments: string[]; warnings: string[]; plates: number; files: number };
export type ErrorReply = { type: "error"; id: number; message: string };
export type WorkerReply = BuildReply | ExportReply | ErrorReply;

const base = new URL(import.meta.env.BASE_URL, self.location.origin).href;
const kernel = loadKernel(wasmUrl);
/** Parsed models and what was worked out from them, kept across jobs (plain data, so `release` can't free it). */
const memo: Memo = new Map();

async function bundledFont(name: string): Promise<ArrayBuffer> {
  const res = await fetch(`${base}fonts/${name}.ttf`);
  if (!res.ok) throw new Error(`Font ${name} is missing (run bun run setup)`);
  return res.arrayBuffer();
}

function assets(traced: Record<string, Traced>, files: Record<string, string>): Assets {
  return {
    font: fontSource(files, bundledFont),
    icon: async (id) => {
      const res = await fetch(`${base}icons/${id}.svg`);
      if (!res.ok) throw new Error(`Icon ${id} is missing`);
      return parseIconSvg(await res.text());
    },
    traced,
    memo,
  };
}

function buffers(parts: Part[]): ArrayBuffer[] {
  return parts.flatMap((p) => [p.mesh.vertices.buffer as ArrayBuffer, p.mesh.triangles.buffer as ArrayBuffer]);
}

// Jobs run one at a time, so freeing the kernel's objects after each one
// can't touch another job's work. A newer build replaces one still waiting.
let pending: BuildRequest | null = null;
let queue: Promise<void> = Promise.resolve();
function enqueue(job: () => Promise<void>) {
  queue = queue.then(job, job);
}

async function runBuild() {
  const req = pending;
  pending = null;
  if (!req) return;
  try {
    await kernel;
    const t = performance.now();
    const r = await build(req.design, assets(req.traced, req.design.files));
    const plates = packPlates(r.print);
    const reply: BuildReply = {
      type: "build",
      id: req.id,
      assembled: r.assembled,
      plates,
      warnings: r.warnings,
      switches: r.switches,
      switchesPerCap: r.switchesPerCap,
      keyring: r.keyring,
      bottom: r.bottom,
      patches: r.patches,
      place: r.place ?? null,
      split: r.split ?? null,
      ms: performance.now() - t,
    };
    // The plate copies are new buffers; the assembled ones are too.
    const transfer = [...buffers(r.assembled), ...plates.flatMap((p) => p.groups.flatMap((g) => buffers(g.parts)))];
    (self as unknown as Worker).postMessage(reply, [...new Set(transfer)]);
  } catch (e) {
    console.error(e instanceof Error ? e.stack : e);
    post({ type: "error", id: req.id, message: e instanceof Error ? e.message : String(e) });
  } finally {
    release();
  }
}

async function runExport(req: ExportRequest) {
  try {
    await kernel;
    const groups: Group[] = [];
    const sets: StlSet[] = [];
    const warnings: string[] = [];
    for (const { design, qty } of req.designs) {
      const r = await build(design, assets(req.traced, design.files));
      warnings.push(...r.warnings.map((w) => `${design.name}: ${w}`));
      // Repeats of a Design are separate files, so a slicer can place each one.
      sets.push({
        folder: req.designs.length > 1 ? design.name : null,
        groups: Array.from({ length: qty }, (_, n) => r.print.map((g) => ({ ...g, name: qty > 1 ? `${g.name} #${n + 1}` : g.name }))).flat(),
      });
      for (let n = 0; n < qty; n++)
        groups.push(...r.print.map((g) => ({ ...g, name: `${design.name}${qty > 1 ? ` #${n + 1}` : ""} · ${g.name}` })));
    }
    if (req.format === "stl") {
      const out = stlZip(sets);
      post({ type: "export", id: req.id, data: out.data, filaments: [], warnings, plates: 0, files: out.files });
      return;
    }
    const plates = packPlates(groups, { byColour: req.byColour });
    const out = platesTo3mf(req.title, plates, printTemplate);
    post({ type: "export", id: req.id, data: out.data, filaments: out.filaments, warnings: [...warnings, ...out.warnings], plates: plates.length, files: 0 });
  } catch (err) {
    console.error(err instanceof Error ? err.stack : err);
    post({ type: "error", id: req.id, message: err instanceof Error ? err.message : String(err) });
  } finally {
    release();
  }
}

function post(msg: WorkerReply) {
  (self as unknown as Worker).postMessage(msg);
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  if (req.type === "build") {
    pending = req;
    enqueue(runBuild);
  } else enqueue(() => runExport(req));
};
