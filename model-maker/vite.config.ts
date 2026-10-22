import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths, so the built app also works opened from any folder.
  base: "./",
  build: { target: "es2022" },
  worker: { format: "es" },
  server: { port: 5178 },
});
