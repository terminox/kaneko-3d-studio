// The print profile embedded in exported 3MFs: the owner's tuned template when it
// exists in the Model Maker's profiles, else the stock A1 / Generic PLA one.
import type { ProjectTemplate } from "@mm/export/bambu3mf.ts";
import stock from "../../../model-maker/profiles/stock-a1-generic-pla.json";

const tuned = import.meta.glob<ProjectTemplate>("../../../model-maker/profiles/project-template.json", { eager: true, import: "default" });

export const printTemplate: ProjectTemplate = Object.values(tuned)[0] ?? (stock as ProjectTemplate);
