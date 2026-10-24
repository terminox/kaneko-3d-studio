// Loads manifold-3d (WASM) once. Works in the browser worker and under Bun.
import Module from "manifold-3d";
import type { CrossSection as CS, Manifold as M } from "manifold-3d";

export type CrossSection = CS;
export type Manifold = M;
export type Kernel = Awaited<ReturnType<typeof Module>>;

let loading: Promise<Kernel> | null = null;
let kernel: Kernel | null = null;

/** `wasmUrl` is needed in the browser, where the bundler moves the .wasm file. */
export function loadKernel(wasmUrl?: string): Promise<Kernel> {
  loading ??= Module(wasmUrl ? { locateFile: () => wasmUrl } : undefined).then((k) => {
    k.setup();
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
