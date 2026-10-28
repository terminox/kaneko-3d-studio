// Geometry worker: builds Name Tags with manifold-3d off the main thread.
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { loadKernel } from "@cs/geometry/kernel.ts";
import type { Traced } from "@cs/geometry/decoration.ts";
import type { Part } from "@cs/geometry/build.ts";
import { platesTo3mf } from "@cs/export/bambu.ts";
import { printTemplate } from "@cs/export/template.ts";
import { buildAll, buildTag, type TagAssets } from "./geometry/tag.ts";
import type { TagDesign } from "./design/types.ts";
import type { PatchInfo } from "@cs/design/heights.ts";

export type BuildRequest = {
  type: "build";
  id: number;
  design: TagDesign;
  traced: Record<string, Traced>;
  /** The tag to show. */
  name: string;
  /** Show plate 1 of the whole batch instead of one tag. */
  plateView: boolean;
};
export type ExportRequest = { type: "export"; id: number; design: TagDesign; traced: Record<string, Traced> };
export type WorkerRequest = BuildRequest | ExportRequest;

export type BuildReply = {
  type: "build";
  id: number;
  parts: Part[];
  loop: [number, number] | null;
  plateView: boolean;
  plates: number;
  warnings: string[];
  /** The previewed tag's picture patches (none in the plate view). */
  patches: PatchInfo[];
  ms: number;
};
export type ExportReply = { type: "export"; id: number; data: Uint8Array; filaments: string[]; warnings: string[]; plates: number; tags: number };
export type ErrorReply = { type: "error"; id: number; message: string };
export type WorkerReply = BuildReply | ExportReply | ErrorReply;

const base = new URL(import.meta.env.BASE_URL, self.location.origin).href;
const kernel = loadKernel(wasmUrl);

function assets(traced: Record<string, Traced>): TagAssets {
  return {
    font: async (name) => {
      const res = await fetch(`${base}fonts/${name}.ttf`);
      if (!res.ok) throw new Error(`Font ${name} is missing (run bun run setup)`);
      return res.arrayBuffer();
    },
    traced,
  };
}

function buffers(parts: Part[]): ArrayBuffer[] {
  return parts.flatMap((p) => [p.mesh.vertices.buffer as ArrayBuffer, p.mesh.triangles.buffer as ArrayBuffer]);
}

function post(msg: WorkerReply, transfer: ArrayBuffer[] = []) {
  (self as unknown as Worker).postMessage(msg, [...new Set(transfer)]);
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
      let reply: BuildReply;
      if (req.plateView) {
        const r = await buildAll(req.design, assets(req.traced));
        const parts = r.plates[0]?.groups.flatMap((g) => g.parts) ?? [];
        reply = { type: "build", id: req.id, parts, loop: null, plateView: true, plates: r.plates.length, warnings: r.warnings, patches: [], ms: 0 };
      } else {
        const r = await buildTag(req.design, req.name, assets(req.traced));
        reply = { type: "build", id: req.id, parts: r.group.parts, loop: r.loop, plateView: false, plates: 0, warnings: r.warnings, patches: r.patches, ms: 0 };
      }
      reply.ms = performance.now() - t;
      post(reply, buffers(reply.parts));
    } catch (e) {
      post({ type: "error", id: req.id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  busy = false;
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
    const r = await buildAll(req.design, assets(req.traced));
    const out = platesTo3mf(req.design.name, r.plates, printTemplate);
    post({ type: "export", id: req.id, data: out.data, filaments: out.filaments, warnings: [...r.warnings, ...out.warnings], plates: r.plates.length, tags: r.tags });
  } catch (err) {
    post({ type: "error", id: req.id, message: err instanceof Error ? err.message : String(err) });
  }
};
