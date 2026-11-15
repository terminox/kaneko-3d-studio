import { isUserFont } from "../text/font-source.ts";
import type { Design } from "./types.ts";

/** Strips derived data so the worker gets a plain copy: only models and imported fonts travel, images are already traced. */
export function clean(d: Design): Design {
  return JSON.parse(JSON.stringify({ ...d, files: Object.fromEntries(Object.entries(d.files).filter(([k]) => k.startsWith("model-") || isUserFont(k))) }));
}
