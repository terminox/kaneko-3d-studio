// 3D model -> Top Cap: an uploaded STL/OBJ is rotated, scaled, cut flat and set
// on a standard cap pedestal, so the Switch fit is the same as every other cap.
import type { Design } from "../design/types.ts";
import { parseBinaryStl, type Mesh } from "@mm/pipeline/mesh.ts";
import { K, keep, recall, type CrossSection, type Manifold, type Memo } from "./kernel.ts";
import { circle, offset, roundConvex } from "./outline.ts";

/** data:...;base64,xxx -> bytes. */
function dataUrlBytes(url: string): Uint8Array {
  const b64 = url.slice(url.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Welds identical positions so the mesh can be made manifold. */
function weld(positions: number[]): Mesh {
  const index = new Map<string, number>();
  const verts: number[] = [];
  const tris = new Uint32Array(positions.length / 3);
  for (let i = 0; i < positions.length; i += 3) {
    const key = `${positions[i]},${positions[i + 1]},${positions[i + 2]}`;
    let id = index.get(key);
    if (id === undefined) {
      id = verts.length / 3;
      index.set(key, id);
      verts.push(positions[i], positions[i + 1], positions[i + 2]);
    }
    tris[i / 3] = id;
  }
  return { vertices: new Float32Array(verts), triangles: tris };
}

export function parseModel(bytes: Uint8Array, name: string): Mesh {
  if (/\.obj$/i.test(name)) {
    const text = new TextDecoder().decode(bytes);
    const v: number[][] = [];
    const pos: number[] = [];
    for (const line of text.split(/\r?\n/)) {
      const p = line.trim().split(/\s+/);
      if (p[0] === "v") v.push([Number(p[1]), Number(p[2]), Number(p[3])]);
      else if (p[0] === "f") {
        const idx = p.slice(1).map((s) => {
          const n = parseInt(s.split("/")[0], 10);
          return n < 0 ? v.length + n : n - 1;
        });
        // Fan-triangulate polygons.
        for (let i = 1; i + 1 < idx.length; i++) for (const k of [idx[0], idx[i], idx[i + 1]]) pos.push(...v[k]);
      }
    }
    return weld(pos);
  }
  try {
    return parseBinaryStl(bytes);
  } catch {
    const text = new TextDecoder().decode(bytes);
    const pos = [...text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].flatMap((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
    if (!pos.length) throw new Error("Not an STL file");
    return weld(pos);
  }
}

/** Identifies the uploaded file and how it is turned, cut and sized: everything `loadModel` reads. */
export function modelKey(design: Design): string {
  const m = design.model;
  return m ? `${m.file}:${design.files[m.file]?.length}|${m.rotate}|${m.cut}|${m.width}` : "";
}

/**
 * The uploaded model as a solid: turned, its bottom cut flat at `cut`, scaled
 * to `width` across its footprint, centred, standing on z = 0. Null (with a
 * warning) when there is no model or it is not watertight.
 */
export function loadModel(design: Design, warnings: string[], memo?: Memo): Manifold | null {
  const m = design.model;
  const data = m && design.files[m.file];
  if (!m || !data) {
    warnings.push("warn.noModel");
    return null;
  }
  const { Manifold, Mesh: KMesh } = K();
  // Parsing a big STL is the slow part of a build, and a slider drag rebuilds many times.
  const file = `${m.file}:${data.length}`;
  const mesh = recall<Mesh>(memo, "mesh", file) ?? keep(memo, "mesh", file, parseModel(dataUrlBytes(data), m.name));
  const kmesh = new KMesh({ numProp: 3, vertProperties: mesh.vertices, triVerts: mesh.triangles });
  kmesh.merge();
  let solid: Manifold;
  try {
    solid = Manifold.ofMesh(kmesh);
  } catch {
    warnings.push("warn.modelBroken");
    return null;
  }
  solid = solid.rotate(m.rotate);
  // Cut the bottom off, then scale so the footprint is `width` wide.
  let b = solid.boundingBox();
  const cutZ = b.min[2] + (b.max[2] - b.min[2]) * m.cut;
  if (m.cut > 0) solid = solid.trimByPlane([0, 0, 1], cutZ);
  b = solid.boundingBox();
  const s = m.width / Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], 1e-6);
  solid = solid.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]]).scale(s);
  if (solid.isEmpty()) {
    warnings.push("warn.modelBroken");
    return null;
  }
  return solid;
}

export type ModelSpec = { outline: CrossSection; model: Manifold };

/** The model, ready to sit on top of its cap pedestal, and the pedestal's outline. */
export function modelSpec(design: Design, warnings: string[], memo?: Memo): ModelSpec | null {
  const model = loadModel(design, warnings, memo);
  if (!model) return null;
  // The pedestal follows the model's footprint where it touches down, widened to hold the Switch.
  const foot = model.slice(0.05);
  const outline = roundConvex(offset(K().CrossSection.union([foot, circle(11)]), 0.6), 1.2);
  return { outline, model };
}
