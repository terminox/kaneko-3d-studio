/// <reference lib="webworker" />
// Runs OpenSCAD (WebAssembly) off the main thread. Every run gets a fresh
// instance: the engine isn't built to call main() twice. The compiled
// WebAssembly.Module is shared, so a fresh instance is cheap.
import { unzipSync } from "fflate";
import type { RunRequest, RunResult } from "./runner.ts";

export type WorkerInit = { type: "init"; wasm: WebAssembly.Module; base: string };
export type WorkerRun = { type: "run"; id: number; request: RunRequest; fonts: string[]; libraries: boolean };
export type WorkerReply = { id: number; result?: RunResult; error?: string };

declare const self: DedicatedWorkerGlobalScope;

let wasm: WebAssembly.Module;
let base = "/";
let factory: ((opts: object) => Promise<any>) | null = null;
const fontCache = new Map<string, Uint8Array>();
let libraryFiles: Record<string, Uint8Array> | null = null;

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function writeTree(FS: any, path: string, data: string | Uint8Array) {
  const parts = path.split("/").filter(Boolean);
  let dir = "";
  for (const p of parts.slice(0, -1)) {
    dir += "/" + p;
    try {
      FS.mkdir(dir);
    } catch {
      // exists
    }
  }
  FS.writeFile("/" + parts.join("/"), data);
}

async function run({ request, fonts, libraries }: WorkerRun): Promise<RunResult> {
  if (!factory) {
    const mod = await import(/* @vite-ignore */ `${base}openscad/openscad.js`);
    factory = mod.default;
  }
  const log: string[] = [];
  const instance = await factory!({
    noInitialRun: true,
    print: (t: string) => log.push(t),
    printErr: (t: string) => log.push(t),
    instantiateWasm: (imports: WebAssembly.Imports, done: (i: WebAssembly.Instance) => void) => {
      WebAssembly.instantiate(wasm, imports).then(done);
      return {};
    },
  });
  const FS = instance.FS;

  // Fonts live in /fonts, which OpenSCAD's fontconfig setup scans.
  FS.mkdir("/fonts");
  for (const file of ["fonts.conf", ...fonts]) {
    let data = fontCache.get(file);
    if (!data) fontCache.set(file, (data = await fetchBytes(`${base}fonts/${file}`)));
    FS.writeFile(`/fonts/${file}`, data);
  }
  if (libraries) {
    libraryFiles ??= unzipSync(await fetchBytes(`${base}libs/BOSL2.zip`));
    for (const [name, data] of Object.entries(libraryFiles)) writeTree(FS, `/libraries/${name}`, data);
  }
  for (const [path, data] of Object.entries(request.files)) writeTree(FS, path, data);
  FS.chdir("/");

  let exitCode: number;
  try {
    exitCode = instance.callMain(request.args);
  } catch (e) {
    exitCode = typeof e === "number" ? e : 1;
    log.push(`ERROR: ${typeof e === "number" && instance.formatException ? instance.formatException(e) : String(e)}`);
  }
  const outputs: RunResult["outputs"] = {};
  for (const out of request.outputs) {
    try {
      const data: Uint8Array = FS.readFile("/" + out);
      outputs[out] = data.length ? data : undefined;
    } catch {
      outputs[out] = undefined;
    }
  }
  return { exitCode, outputs, log };
}

self.onmessage = async (e: MessageEvent<WorkerInit | WorkerRun>) => {
  const msg = e.data;
  if (msg.type === "init") {
    wasm = msg.wasm;
    base = msg.base;
    return;
  }
  try {
    const result = await run(msg);
    const transfer = Object.values(result.outputs).flatMap((d) => (d ? [d.buffer as ArrayBuffer] : []));
    self.postMessage({ id: msg.id, result } satisfies WorkerReply, transfer);
  } catch (err) {
    self.postMessage({ id: msg.id, error: String(err) } satisfies WorkerReply);
  }
};
