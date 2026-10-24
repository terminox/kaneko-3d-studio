// Plates -> Bambu Studio project 3MF, through the Model Maker's writer.
import { writeBambu3mf, type ProjectTemplate } from "@mm/export/bambu3mf.ts";
import type { Plate } from "../geometry/build.ts";

export function platesTo3mf(title: string, plates: Plate[], template: ProjectTemplate | null) {
  return writeBambu3mf({
    title,
    template,
    plates: plates.map((p) => ({
      name: p.name,
      bedPositioned: true,
      wipeTower: p.tower,
      parts: p.groups.flatMap((g) => g.parts.map((part) => ({ name: part.name, color: part.color.toUpperCase(), mesh: part.mesh }))),
    })),
  });
}
