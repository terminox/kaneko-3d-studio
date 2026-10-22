// OpenScadRunner backed by a Web Worker. `cancel()` kills the worker mid-run
// (OpenSCAD can't be interrupted) and starts a fresh one.
import type { OpenScadRunner, RunRequest, RunResult } from "./runner.ts";
import type { WorkerReply, WorkerRun } from "./worker.ts";

export type FontEntry = { family: string; styles: { label: string; weight: number; spec: string; file: string }[] };

const BASE = import.meta.env.BASE_URL;
let wasmModule: Promise<WebAssembly.Module> | null = null;

function compileWasm(): Promise<WebAssembly.Module> {
  wasmModule ??= WebAssembly.compileStreaming(fetch(`${BASE}openscad/openscad.wasm`));
  return wasmModule;
}

export class Cancelled extends Error {
  constructor() {
    super("cancelled");
  }
}

export class BrowserRunner implements OpenScadRunner {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: RunResult) => void; reject: (e: Error) => void }>();

  constructor(private fonts: FontEntry[]) {}

  private async ensureWorker(): Promise<Worker> {
    if (this.worker) return this.worker;
    const wasm = await compileWasm();
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.postMessage({ type: "init", wasm, base: BASE });
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data.result!);
    };
    this.worker = worker;
    return worker;
  }

  /** Font files a run needs: those of every bundled family the model or its values mention. */
  private fontsFor(request: RunRequest): string[] {
    const text = Object.values(request.files)
      .filter((f): f is string => typeof f === "string")
      .join("\n") + request.args.join("\n");
    const used = this.fonts.filter((f) => text.includes(f.family));
    return (used.length ? used : this.fonts.slice(0, 1)).flatMap((f) => f.styles.map((s) => s.file));
  }

  async run(request: RunRequest): Promise<RunResult> {
    const worker = await this.ensureWorker();
    const id = this.nextId++;
    const libraries = Object.values(request.files).some((f) => typeof f === "string" && /BOSL2\//.test(f));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ type: "run", id, request, fonts: this.fontsFor(request), libraries } satisfies WorkerRun);
    });
  }

  cancel() {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new Cancelled());
    this.pending.clear();
  }
}
