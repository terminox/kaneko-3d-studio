// Loads manifold-3d (WASM) once. Works in the browser worker and under Bun.
// Every CrossSection and Manifold the kernel hands out is recorded, so a
// worker can free them all between jobs: embind objects are never garbage
// collected, and one photo-sized build makes thousands of them.
import Module from "manifold-3d";
import type { CrossSection as CS, Manifold as M } from "manifold-3d";

export type CrossSection = CS;
export type Manifold = M;
export type Kernel = Awaited<ReturnType<typeof Module>>;

let loading: Promise<Kernel> | null = null;
let kernel: Kernel | null = null;

type Handle = { delete(): void; isDeleted(): boolean };
let tracked: Handle[] = [];

/** Wraps every method and static of both classes to record what they return. */
function track(k: Kernel) {
  const isHandle = (x: unknown): x is Handle => x instanceof k.CrossSection || x instanceof k.Manifold;
  const note = <T>(r: T): T => {
    if (isHandle(r)) tracked.push(r);
    else if (Array.isArray(r)) for (const x of r) if (isHandle(x)) tracked.push(x);
    return r;
  };
  const wrap = (obj: object, skip: string[]) => {
    for (const name of Object.getOwnPropertyNames(obj)) {
      const d = Object.getOwnPropertyDescriptor(obj, name);
      if (skip.includes(name) || typeof d?.value !== "function" || !d.writable) continue;
      const f = d.value as (...a: unknown[]) => unknown;
      Object.defineProperty(obj, name, {
        ...d,
        value: function (this: unknown, ...a: unknown[]) {
          return note(f.apply(this, a));
        },
      });
    }
  };
  const done = new Set<object>();
  for (const cls of [k.CrossSection, k.Manifold] as unknown as { prototype: object }[]) {
    // Methods live along the prototype chain (embind's ClassHandle is shared).
    for (let p: object | null = cls.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
      if (done.has(p)) continue;
      done.add(p);
      wrap(p, ["constructor"]);
    }
    wrap(cls, ["prototype"]);
  }
}

/** `wasmUrl` is needed in the browser, where the bundler moves the .wasm file. */
export function loadKernel(wasmUrl?: string): Promise<Kernel> {
  loading ??= Module(wasmUrl ? { locateFile: () => wasmUrl } : undefined).then((k) => {
    k.setup();
    track(k);
    kernel = k;
    return k;
  });
  return loading;
}

/** The loaded kernel. Geometry code runs only after `loadKernel` resolved. */
export function K(): Kernel {
  if (!kernel) throw new Error("manifold kernel not loaded");
  return kernel;
}

/**
 * Frees every object the kernel made since the last release. Call it between
 * jobs, once their results are plain data (meshes as typed arrays, polygons
 * as arrays). Returns how many objects were freed.
 */
export function release(): number {
  let n = 0;
  for (const h of tracked)
    if (!h.isDeleted()) {
      h.delete();
      n++;
    }
  tracked = [];
  return n;
}

/** Objects made since the last release (for tests). */
export const trackedCount = () => tracked.length;
