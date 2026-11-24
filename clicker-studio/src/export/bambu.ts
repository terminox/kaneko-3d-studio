// Plates -> Bambu Studio project 3MF, through the Model Maker's writer.
import { writeBambu3mf, type ProjectTemplate } from "@mm/export/bambu3mf.ts";
import type { Plate } from "../geometry/build.ts";

/** Per-object slicer settings for a plate with H-connector tabs or raised keyring loops: support only where enforced, from the bed. */
export const ENFORCED_SUPPORT: Record<string, string> = { enable_support: "1", support_type: "normal(manual)", support_on_build_plate_only: "1" };

export function platesTo3mf(title: string, plates: Plate[], template: ProjectTemplate | null) {
  return writeBambu3mf({
    title,
    template,
    plates: plates.map((p) => ({
      name: p.name,
      bedPositioned: true,
      wipeTower: p.tower,
      parts: p.groups.flatMap((g) => g.parts.map((part) => ({ name: part.name, color: part.color.toUpperCase(), mesh: part.mesh, subtype: part.role === "support" ? ("support_enforcer" as const) : undefined }))),
      // Only the support enforcers (under H-connector tabs and raised keyring loops) make support.
      settings: p.groups.some((g) => g.parts.some((part) => part.role === "support")) ? ENFORCED_SUPPORT : undefined,
    })),
  });
}
