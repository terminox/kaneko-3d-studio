// Print groups -> a zip of plain binary STLs, for slicers other than Bambu Studio.
import { zipSync } from "fflate";
import { writeBinaryStl } from "@mm/pipeline/mesh.ts";
import type { Mesh } from "@mm/pipeline/mesh.ts";
import type { Group } from "../geometry/build.ts";

/** One Design's printed groups. `folder` is null for a single Design, which needs none. */
export type StlSet = { folder: string | null; groups: Group[] };

const safe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim().replace(/^\.+/, "") || "part";

function minZ(meshes: Mesh[]): number {
  let min = Infinity;
  for (const m of meshes) for (let i = 2; i < m.vertices.length; i += 3) min = Math.min(min, m.vertices[i]);
  return Number.isFinite(min) ? min : 0;
}

function lowered(mesh: Mesh, dz: number): Mesh {
  if (Math.abs(dz) < 1e-6) return mesh;
  const moved = new Float32Array(mesh.vertices);
  for (let i = 2; i < moved.length; i += 3) moved[i] -= dz;
  return { vertices: moved, triangles: mesh.triangles };
}

/** One `<group> - <part>.stl` per printed part, so each colour can get its own filament. Support volumes are left out. */
export function stlZip(sets: StlSet[]): { data: Uint8Array; files: number } {
  const entries: Record<string, Uint8Array> = {};
  const taken = new Set<string>();
  const unique = (path: string) => {
    let name = path;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = path.replace(/\.stl$/, ` (${n}).stl`);
    taken.add(name.toLowerCase());
    return name;
  };
  const folders = new Set<string>();
  for (const set of sets) {
    let dir = "";
    if (set.folder !== null) {
      let name = safe(set.folder);
      for (let n = 2; folders.has(name.toLowerCase()); n++) name = `${safe(set.folder)} (${n})`;
      folders.add(name.toLowerCase());
      dir = `${name}/`;
    }
    for (const g of set.groups) {
      const printed = g.parts.filter((p) => p.role !== "support");
      // A piece stands on the bed; its colour parts drop together so they stay registered when loaded as one object.
      const dz = minZ(printed.map((p) => p.mesh));
      for (const p of printed) {
        const file = p.name === g.name ? safe(g.name) : `${safe(g.name)} - ${safe(p.name)}`;
        entries[unique(`${dir}${file}.stl`)] = writeBinaryStl([lowered(p.mesh, dz)]);
      }
    }
  }
  return { data: zipSync(entries, { level: 6 }), files: Object.keys(entries).length };
}
