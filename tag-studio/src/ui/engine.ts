// Main-thread client for the geometry worker.
import type { Traced } from "@cs/geometry/decoration.ts";
import type { TagDesign } from "../design/types.ts";
import type { BuildReply, ExportReply, WorkerReply, WorkerRequest } from "../worker.ts";

/** Set while a job runs. Still there on load means the last page died mid-job. */
const MARK = "tag-studio:v1:building";
let nextId = 1;
const waiting = new Map<number, (r: WorkerReply) => void>();
let onBuild: (r: BuildReply | { type: "error"; message: string }) => void = () => {};
let latestBuild = 0;
let building = false;
let worker = spawn();

function spawn(): Worker {
  const w = new Worker(new URL("../worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<WorkerReply>) => {
    const r = e.data;
    const wait = waiting.get(r.id);
    if (wait) {
      waiting.delete(r.id);
      if (!waiting.size && !building) mark(false);
      wait(r);
      return;
    }
    // Builds: only the newest request's reply matters.
    if (r.id === latestBuild) {
      building = false;
      if (!waiting.size) mark(false);
      onBuild(r.type === "error" ? r : (r as BuildReply));
    }
  };
  // A crash inside the WASM kernel kills the worker without a reply. Say so,
  // and start a fresh worker so the next edit builds instead of hanging.
  w.onerror = (e) => {
    const message = e.message || "the geometry worker crashed";
    w.terminate();
    worker = spawn();
    for (const wait of waiting.values()) wait({ type: "error", id: 0, message });
    waiting.clear();
    building = false;
    mark(false);
    onBuild({ type: "error", message });
  };
  return w;
}

function mark(on: boolean) {
  try {
    if (on) localStorage.setItem(MARK, String(Date.now()));
    else localStorage.removeItem(MARK);
  } catch {
    // Without storage there is no crash guard, which is fine.
  }
}

/** True when the last page died while a job ran: the saved Design is what killed it. */
export function crashedLastTime(): boolean {
  try {
    return localStorage.getItem(MARK) !== null;
  } catch {
    return false;
  }
}

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
  building = true;
  const msg: WorkerRequest = { type: "build", id, design: clean(design), traced, name, plateView };
  mark(true);
  worker.postMessage(msg);
}

export function requestExport(design: TagDesign, traced: Record<string, Traced>): Promise<ExportReply> {
  const id = nextId++;
  const msg: WorkerRequest = { type: "export", id, design: clean(design), traced };
  return new Promise((resolve, reject) => {
    waiting.set(id, (r) => (r.type === "export" ? resolve(r) : reject(new Error(r.type === "error" ? r.message : "unexpected reply"))));
    mark(true);
    worker.postMessage(msg);
  });
}
