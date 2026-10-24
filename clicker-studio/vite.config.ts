import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { cartoonApi } from "./scripts/cartoon-api.ts";

export default defineConfig({
  // Relative asset paths, so the built app also works opened from any folder.
  base: "./",
  build: { target: "es2022" },
  worker: { format: "es" },
  resolve: { alias: { "@mm": fileURLToPath(new URL("../model-maker/src", import.meta.url)) } },
  // Both load their .wasm next to their own module; pre-bundling would break that.
  optimizeDeps: { exclude: ["manifold-3d", "harfbuzzjs"] },
  server: { port: 5179, fs: { allow: [".", "../model-maker"] } },
  plugins: [cartoonApi()],
});
