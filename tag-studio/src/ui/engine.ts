// Main-thread client for the geometry worker.
import type { Traced } from "@cs/geometry/decoration.ts";
import type { TagDesign } from "../design/types.ts";
import type { BuildReply, ExportReply, WorkerReply, WorkerRequest } from "../worker.ts";

const worker = new Worker(new URL("../worker.ts", import.meta.url), { type: "module" });
let nextId = 1;
const waiting = new Map<number, (r: WorkerReply) => void>();
let onBuild: (r: BuildReply | { type: "error"; message: string }) => void = () => {};
let latestBuild = 0;

worker.onmessage = (e: MessageEvent<WorkerReply>) => {
  const r = e.data;
  const w = waiting.get(r.id);
  if (w) {
    waiting.delete(r.id);
    w(r);
    return;
  }
  // Builds: only the newest request's reply matters.
  if (r.id === latestBuild) onBuild(r.type === "error" ? r : (r as BuildReply));
};

export function onBuilt(fn: typeof onBuild) {
  onBuild = fn;
}

/** A plain copy without the embedded images: the worker only needs traced layers. */
function clean(d: TagDesign): TagDesign {
  return JSON.parse(JSON.stringify({ ...d, files: {} }));
}

export function requestBuild(design: TagDesign, traced: Record<string, Traced>, name: string, plateView: boolean) {
  const id = nextId++;
  latestBuild = id;
  const msg: WorkerRequest = { type: "build", id, design: clean(design), traced, name, plateView };
  worker.postMessage(msg);
}

export function requestExport(design: TagDesign, traced: Record<string, Traced>): Promise<ExportReply> {
  const id = nextId++;
  const msg: WorkerRequest = { type: "export", id, design: clean(design), traced };
  return new Promise((resolve, reject) => {
    waiting.set(id, (r) => (r.type === "export" ? resolve(r) : reject(new Error(r.type === "error" ? r.message : "unexpected reply"))));
    worker.postMessage(msg);
  });
}
