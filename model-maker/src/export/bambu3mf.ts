// Writes a Bambu Studio project 3MF: one object per plate, one part per colour,
// each part on its own project filament. Layout and rules follow
// docs/research/bambu-3mf-and-cli.md (branch research/bambu-3mf-and-cli).
import { strToU8, zipSync } from "fflate";
import { boundingBox, type Mesh } from "../pipeline/mesh.ts";

/** Must equal the installed Bambu Studio version: a newer stamp is refused (-24). */
export const BAMBU_STUDIO_VERSION = "02.08.02.61";

/** A1: 256 mm bed; plates sit 1.2 bed widths apart in one world frame. */
const BED = 256;
const PLATE_STRIDE = BED * 1.2;

export type ProjectTemplate = {
  /** Where the settings came from, for the record. */
  source: string;
  project_settings: Record<string, unknown>;
  /** Option keys that hold one value per filament. */
  filament_keys: string[];
};

export type PartInput = { name: string; color: string; mesh: Mesh };
export type PlateInput = {
  name: string;
  parts: PartInput[];
  /** Parts are already in bed coordinates (0..256 mm); keep them there instead of centring. */
  bedPositioned?: boolean;
  /** Where this plate's prime tower goes (bed coordinates, its lower-left corner). */
  wipeTower?: [number, number];
};

export type Bambu3mfInput = {
  title: string;
  plates: PlateInput[];
  template: ProjectTemplate | null;
  bedType?: string;
};

export type Bambu3mfResult = { data: Uint8Array; filaments: string[]; warnings: string[] };

export function writeBambu3mf({ title, plates, template, bedType = "Textured PEI Plate" }: Bambu3mfInput): Bambu3mfResult {
  const warnings: string[] = [];
  const used = plates.filter((p) => p.parts.some((part) => part.mesh.triangles.length > 0));
  if (used.length === 0) throw new Error("Nothing to export: every plate is empty");
  if (used.length !== plates.length) warnings.push(`${plates.length - used.length} empty plate(s) left out`);

  // Project filaments: one per distinct colour, in first-use order.
  const filaments: string[] = [];
  for (const plate of used) for (const part of plate.parts) if (!filaments.includes(part.color)) filaments.push(part.color);
  if (filaments.length > 4) warnings.push(`${filaments.length} colours: the AMS Lite holds 4, so some need manual swaps`);

  const cols = Math.ceil(Math.sqrt(used.length));
  let nextId = 1;
  const resources: string[] = [];
  const build: string[] = [];
  const objectsConfig: string[] = [];
  const platesConfig: string[] = [];

  used.forEach((plate, k) => {
    const parts = plate.parts.filter((p) => p.mesh.triangles.length > 0);
    const box = boundingBox(parts.map((p) => p.mesh))!;
    const size = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
    if (size[0] > BED || size[1] > BED) throw new Error(`Plate ${k + 1} is ${size[0].toFixed(1)} × ${size[1].toFixed(1)} mm, larger than the ${BED} mm bed`);
    // Centre each plate's object on its plate with the lowest point on the bed,
    // unless the caller placed the parts on the bed itself.
    const shift: [number, number, number] = plate.bedPositioned
      ? [-BED / 2, -BED / 2, -box.min[2]]
      : [-(box.min[0] + box.max[0]) / 2, -(box.min[1] + box.max[1]) / 2, -box.min[2]];
    if (plate.bedPositioned && (box.min[0] < 0 || box.min[1] < 0 || box.max[0] > BED || box.max[1] > BED))
      throw new Error(`Plate ${k + 1} has parts outside the ${BED} mm bed`);

    const partIds: number[] = [];
    for (const part of parts) {
      const id = nextId++;
      partIds.push(id);
      resources.push(`  <object id="${id}" type="model">\n${meshXml(part.mesh, shift)}  </object>`);
    }
    const objectId = nextId++;
    resources.push(
      `  <object id="${objectId}" type="model"><components>\n` +
        partIds.map((id) => `   <component objectid="${id}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`).join("\n") +
        `\n  </components></object>`,
    );
    const ox = (k % cols) * PLATE_STRIDE + BED / 2;
    const oy = -Math.floor(k / cols) * PLATE_STRIDE + BED / 2;
    build.push(`  <item objectid="${objectId}" transform="1 0 0 0 1 0 0 0 1 ${num(ox)} ${num(oy)} 0" printable="1"/>`);

    const objectName = used.length > 1 ? `${title} · ${plate.name}` : title;
    objectsConfig.push(
      `  <object id="${objectId}">\n` +
        `    <metadata key="name" value="${xml(objectName)}"/>\n` +
        `    <metadata key="extruder" value="${filaments.indexOf(parts[0].color) + 1}"/>\n` +
        parts
          .map(
            (part, i) =>
              `    <part id="${partIds[i]}" subtype="normal_part">\n` +
              `      <metadata key="name" value="${xml(part.name)}"/>\n` +
              `      <metadata key="extruder" value="${filaments.indexOf(part.color) + 1}"/>\n` +
              `    </part>\n`,
          )
          .join("") +
        `  </object>`,
    );
    platesConfig.push(
      `  <plate>\n` +
        `    <metadata key="plater_id" value="${k + 1}"/>\n` +
        `    <metadata key="plater_name" value="${xml(plate.name)}"/>\n` +
        `    <metadata key="locked" value="false"/>\n` +
        `    <metadata key="bed_type" value="${xml(bedType)}"/>\n` +
        `    <model_instance>\n` +
        `      <metadata key="object_id" value="${objectId}"/>\n` +
        `      <metadata key="instance_id" value="0"/>\n` +
        `      <metadata key="identify_id" value="${100 + k}"/>\n` +
        `    </model_instance>\n` +
        `  </plate>`,
    );
  });

  const model =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">\n` +
    ` <metadata name="Application">BambuStudio-${BAMBU_STUDIO_VERSION}</metadata>\n` +
    ` <metadata name="BambuStudio:3mfVersion">1</metadata>\n` +
    ` <metadata name="Title">${xml(title)}</metadata>\n` +
    ` <resources>\n${resources.join("\n")}\n </resources>\n` +
    ` <build>\n${build.join("\n")}\n </build>\n` +
    `</model>\n`;

  const modelSettings = `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n${objectsConfig.join("\n")}\n${platesConfig.join("\n")}\n</config>\n`;

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n` +
        ` <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n` +
        ` <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n</Types>\n`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
        ` <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n`,
    ),
    "3D/3dmodel.model": strToU8(model),
    "Metadata/model_settings.config": strToU8(modelSettings),
  };
  if (template) {
    const settings = projectSettings(template, filaments, used.length, used.map((p) => p.wipeTower));
    files["Metadata/project_settings.config"] = strToU8(JSON.stringify(settings, null, 4) + "\n");
  } else {
    warnings.push("No print profile template: Bambu Studio will apply its current presets");
  }

  return { data: zipSync(files, { level: 6 }), filaments, warnings };
}

/**
 * The template's settings with the filament list sized and coloured for this
 * file. Per-filament arrays grow by repeating their last entry; only
 * `filament_colour` changes value, as the research recommends.
 */
export function projectSettings(
  template: ProjectTemplate,
  colors: string[],
  plateCount: number,
  towers: ([number, number] | undefined)[] = [],
): Record<string, unknown> {
  const s = structuredClone(template.project_settings) as Record<string, unknown>;
  const have = (s.filament_settings_id as string[] | undefined)?.length ?? 1;
  const n = Math.max(have, colors.length);
  const resize = (arr: unknown[], len: number) =>
    arr.length >= len ? arr.slice(0, len) : [...arr, ...Array(len - arr.length).fill(arr[arr.length - 1])];

  for (const [key, value] of Object.entries(s)) {
    if (!Array.isArray(value) || value.length !== have) continue;
    if (template.filament_keys.includes(key) || key.startsWith("filament_")) s[key] = resize(value, n);
  }
  // Process, filaments 1..n, printer.
  for (const key of ["inherits_group", "different_settings_to_system"]) {
    const v = s[key] as string[] | undefined;
    if (v && v.length === have + 2) s[key] = [v[0], ...resize(v.slice(1, -1), n), v[v.length - 1]];
  }
  const colours = resize((s.filament_colour as string[] | undefined) ?? ["#FFFFFF"], n) as string[];
  colors.forEach((c, i) => (colours[i] = c));
  s.filament_colour = colours;
  s.filament_map = Array(n).fill("1");

  const matrix = (s.flush_volumes_matrix as string[] | undefined) ?? [];
  if (matrix.length !== n * n) {
    const off = matrix.find((_, i) => Math.floor(i / have) !== i % have) ?? "280";
    s.flush_volumes_matrix = Array.from({ length: n * n }, (_, i) => (Math.floor(i / n) === i % n ? "0" : off));
  }
  const vector = (s.flush_volumes_vector as string[] | undefined) ?? [];
  if (vector.length !== 2 * n) s.flush_volumes_vector = resize(vector.length ? vector : ["140"], 2 * n);
  ["wipe_tower_x", "wipe_tower_y"].forEach((key, axis) => {
    const v = s[key] as string[] | undefined;
    if (!v?.length) return;
    const out = resize(v, plateCount) as string[];
    towers.forEach((t, k) => {
      if (t && k < plateCount) out[k] = String(Math.round(t[axis] * 100) / 100);
    });
    s[key] = out;
  });
  s.version = BAMBU_STUDIO_VERSION;
  return s;
}

function meshXml({ vertices: v, triangles: t }: Mesh, [dx, dy, dz]: [number, number, number]): string {
  const out: string[] = ["   <mesh>\n    <vertices>\n"];
  for (let i = 0; i < v.length; i += 3) {
    out.push(`     <vertex x="${num(v[i] + dx)}" y="${num(v[i + 1] + dy)}" z="${num(v[i + 2] + dz)}"/>\n`);
  }
  out.push("    </vertices>\n    <triangles>\n");
  for (let i = 0; i < t.length; i += 3) out.push(`     <triangle v1="${t[i]}" v2="${t[i + 1]}" v3="${t[i + 2]}"/>\n`);
  out.push("    </triangles>\n   </mesh>\n");
  return out.join("");
}

const num = (x: number) => String(Number(x.toFixed(5)));
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
