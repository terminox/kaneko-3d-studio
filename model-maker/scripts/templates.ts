import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProjectTemplate } from "../src/export/bambu3mf.ts";

/** The owner's tuned template when it exists, else the stock one. */
export function loadTemplate(): ProjectTemplate {
  for (const name of ["project-template.json", "stock-a1-generic-pla.json"]) {
    const path = resolve(import.meta.dir, "../profiles", name);
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as ProjectTemplate;
  }
  throw new Error("No print profile template: run `bun run template`");
}
