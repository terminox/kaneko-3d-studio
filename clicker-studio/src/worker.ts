// Geometry worker: builds Designs with manifold-3d off the main thread.
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { loadKernel } from "./geometry/kernel.ts";
import { build, packPlates, type Group, type Part } from "./geometry/build.ts";
import { parseIconSvg, type Assets, type Traced } from "./geometry/decoration.ts";
import { platesTo3mf } from "./export/bambu.ts";
import type { Design } from "./design/types.ts";
import type { PatchInfo } from "./design/heights.ts";
import { printTemplate } from "./export/template.ts";

export type BuildRequest = { type: "build"; id: number; design: Design; traced: Record<string, Traced> };
export type ExportRequest = {
  type: "export";
  id: number;
  title: string;
  designs: { design: Design; qty: number }[];
  traced: Record<string, Traced>;
  /** Put one-colour pieces on plates of their own colour (fewer filament swaps). */
  byColour: boolean;
};
export type WorkerRequest = BuildRequest | ExportRequest;

export type BuildReply = {
  type: "build";
  id: number;
  assembled: Part[];
  plates: { name: string; groups: Group[] }[];
  warnings: string[];
  switches: [number, number][];
  loops: [number, number][];
  bottom: number;
  patches: PatchInfo[];
  ms: number;
};
export type ExportReply = { type: "export"; id: number; data: Uint8Array; filaments: string[]; warnings: string[]; plates: number };
export type ErrorReply = { type: "error"; id: number; message: string };
export type WorkerReply = BuildReply | ExportReply | ErrorReply;

const base = new URL(import.meta.env.BASE_URL, self.location.origin).href;
const kernel = loadKernel(wasmUrl);

function assets(traced: Record<string, Traced>): Assets {
  return {
    font: async (name) => {
      const res = await fetch(`${base}fonts/${name}.ttf`);
      if (!res.ok) throw new Error(`Font ${name} is missing (run bun run setup)`);
      return res.arrayBuffer();
    },
    icon: async (id) => {
      const res = await fetch(`${base}icons/${id}.svg`);
      if (!res.ok) throw new Error(`Icon ${id} is missing`);
      return parseIconSvg(await res.text());
    },
    traced,
  };
}

function buffers(parts: Part[]): ArrayBuffer[] {
  return parts.flatMap((p) => [p.mesh.vertices.buffer as ArrayBuffer, p.mesh.triangles.buffer as ArrayBuffer]);
}

// Builds run one at a time; a newer request replaces any that hasn't started.
let pending: BuildRequest | null = null;
let busy = false;

async function runBuilds() {
  if (busy) return;
  busy = true;
  while (pending) {
    const req = pending;
    pending = null;
    try {
      await kernel;
      const t = performance.now();
      const r = await build(req.design, assets(req.traced));
      const plates = packPlates(r.print);
      const reply: BuildReply = {
        type: "build",
        id: req.id,
        assembled: r.assembled,
        plates,
        warnings: r.warnings,
        switches: r.switches,
        loops: r.loops,
        bottom: r.bottom,
        patches: r.patches,
        ms: performance.now() - t,
      };
      // The plate copies are new buffers; the assembled ones are too.
      const transfer = [...buffers(r.assembled), ...plates.flatMap((p) => p.groups.flatMap((g) => buffers(g.parts)))];
      (self as unknown as Worker).postMessage(reply, [...new Set(transfer)]);
    } catch (e) {
      post({ type: "error", id: req.id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  busy = false;
}

function post(msg: WorkerReply) {
  (self as unknown as Worker).postMessage(msg);
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  if (req.type === "build") {
    pending = req;
    void runBuilds();
    return;
  }
  try {
    await kernel;
    const groups: Group[] = [];
    const warnings: string[] = [];
    for (const { design, qty } of req.designs) {
      const r = await build(design, assets(req.traced));
      warnings.push(...r.warnings.map((w) => `${design.name}: ${w}`));
      for (let n = 0; n < qty; n++)
        groups.push(...r.print.map((g) => ({ ...g, name: `${design.name}${qty > 1 ? ` #${n + 1}` : ""} · ${g.name}` })));
    }
    const plates = packPlates(groups, { byColour: req.byColour });
    const out = platesTo3mf(req.title, plates, printTemplate);
    post({ type: "export", id: req.id, data: out.data, filaments: out.filaments, warnings: [...warnings, ...out.warnings], plates: plates.length });
  } catch (err) {
    post({ type: "error", id: req.id, message: err instanceof Error ? err.message : String(err) });
  }
};
