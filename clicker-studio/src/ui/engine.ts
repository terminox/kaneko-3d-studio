// Main-thread client for the geometry worker.
import type { Design } from "../design/types.ts";
import { clean } from "../design/clean.ts";
import type { Traced } from "../geometry/decoration.ts";
import type { BuildReply, ExportReply, WorkerReply, WorkerRequest } from "../worker.ts";

const worker = new Worker(new URL("../worker.ts", import.meta.url), { type: "module" });
let nextId = 1;
const waiting = new Map<number, { resolve: (r: WorkerReply) => void }>();
let onBuild: (r: BuildReply | { type: "error"; message: string }) => void = () => {};
let latestBuild = 0;

worker.onmessage = (e: MessageEvent<WorkerReply>) => {
  const r = e.data;
  const w = waiting.get(r.id);
  if (w) {
    waiting.delete(r.id);
    w.resolve(r);
    return;
  }
  // Builds: only the newest request's reply matters.
  if (r.id === latestBuild) onBuild(r.type === "error" ? r : (r as BuildReply));
};

export function onBuilt(fn: typeof onBuild) {
  onBuild = fn;
}

export function requestBuild(design: Design, traced: Record<string, Traced>) {
  const id = nextId++;
  latestBuild = id;
  const msg: WorkerRequest = { type: "build", id, design: clean(design), traced };
  worker.postMessage(msg);
}

export function requestExport(title: string, designs: { design: Design; qty: number }[], traced: Record<string, Traced>, byColour = false, format: "3mf" | "stl" = "3mf"): Promise<ExportReply> {
  const id = nextId++;
  const msg: WorkerRequest = { type: "export", id, title, designs: designs.map((x) => ({ design: clean(x.design), qty: x.qty })), traced, byColour, format };
  return new Promise((resolve, reject) => {
    waiting.set(id, {
      resolve: (r) => (r.type === "export" ? resolve(r) : reject(new Error(r.type === "error" ? r.message : "unexpected reply"))),
    });
    worker.postMessage(msg);
  });
}
