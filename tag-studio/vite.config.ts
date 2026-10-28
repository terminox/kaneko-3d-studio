import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { cartoonApi } from "../clicker-studio/scripts/cartoon-api.ts";

export default defineConfig({
  // Relative asset paths, so the built app also works opened from any folder.
  base: "./",
  build: { target: "es2022" },
  worker: { format: "es" },
  resolve: {
    alias: {
      "@mm": fileURLToPath(new URL("../model-maker/src", import.meta.url)),
      "@cs": fileURLToPath(new URL("../clicker-studio/src", import.meta.url)),
    },
    // Clicker Studio's modules import these too; load one copy, from here.
    dedupe: ["manifold-3d", "harfbuzzjs", "imagetracerjs", "three", "fflate"],
  },
  // Both load their .wasm next to their own module; pre-bundling would break that.
  optimizeDeps: { exclude: ["manifold-3d", "harfbuzzjs"] },
  server: { port: 5180, fs: { allow: [".", "../model-maker", "../clicker-studio"] } },
  // The AI cartoon endpoint reads OPENROUTER_API_KEY from tag-studio/.env.
  plugins: [cartoonApi()],
});
