// Mesh formats OpenSCAD writes (OFF with face colours, binary STL) and the
// indexed mesh the preview and the 3MF writer use.
import { DEFAULT_COLOR, rgbToHex } from "./colors.ts";

export type Mesh = { vertices: Float32Array; triangles: Uint32Array };
export type ColoredMesh = { color: string; mesh: Mesh };

/** Parses an OFF file and returns one mesh per face colour. */
export function parseColoredOff(text: string): ColoredMesh[] {
  const tokens = text
    .split("\n")
    .map((l) => l.replace(/#.*/, "").trim())
    .filter(Boolean)
    .join(" ")
    .split(/\s+/);
  let i = 0;
  if (!/^C?OFF$/.test(tokens[i])) throw new Error("Not an OFF file");
  i++;
  const nv = Number(tokens[i++]);
  const nf = Number(tokens[i++]);
  i++; // edge count

  const verts = new Float32Array(nv * 3);
  for (let v = 0; v < nv * 3; v++) verts[v] = Number(tokens[i++]);

  // A face line is "n v0 .. vn-1 [r g b [a]]"; the colour part is optional, so
  // read face by face against the line structure instead of the token stream.
  const lines = text
    .split("\n")
    .map((l) => l.replace(/#.*/, "").trim())
    .filter(Boolean);
  const header = lines[0].split(/\s+/).length > 1 ? 1 : 2;
  const faceLines = lines.slice(header + nv, header + nv + nf);

  const groups = new Map<string, number[]>();
  for (const line of faceLines) {
    const parts = line.split(/\s+/);
    const n = Number(parts[0]);
    const poly = parts.slice(1, 1 + n).map(Number);
    const rgb = parts.slice(1 + n, 4 + n);
    let color = DEFAULT_COLOR;
    if (rgb.length === 3) {
      const scale = rgb.some((c) => c.includes(".")) ? 255 : 1;
      color = rgbToHex(Number(rgb[0]) * scale, Number(rgb[1]) * scale, Number(rgb[2]) * scale);
    }
    let tris = groups.get(color);
    if (!tris) groups.set(color, (tris = []));
    for (const t of triangulate(verts, poly)) tris.push(...t);
  }

  return [...groups].map(([color, tris]) => ({ color, mesh: compact(verts, tris) }));
}

/** Parses binary STL into an indexed mesh, welding identical vertex positions. */
export function parseBinaryStl(data: Uint8Array): Mesh {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const count = view.getUint32(80, true);
  if (84 + count * 50 !== data.byteLength) throw new Error("Not a binary STL");
  const index = new Map<string, number>();
  const verts: number[] = [];
  const tris = new Uint32Array(count * 3);
  for (let t = 0; t < count; t++) {
    const base = 84 + t * 50 + 12;
    for (let k = 0; k < 3; k++) {
      const x = view.getFloat32(base + k * 12, true);
      const y = view.getFloat32(base + k * 12 + 4, true);
      const z = view.getFloat32(base + k * 12 + 8, true);
      const key = `${x},${y},${z}`;
      let id = index.get(key);
      if (id === undefined) {
        id = verts.length / 3;
        index.set(key, id);
        verts.push(x, y, z);
      }
      tris[t * 3 + k] = id;
    }
  }
  return { vertices: new Float32Array(verts), triangles: tris };
}

export function writeBinaryStl(meshes: Mesh[]): Uint8Array {
  const count = meshes.reduce((n, m) => n + m.triangles.length / 3, 0);
  const out = new Uint8Array(84 + count * 50);
  const view = new DataView(out.buffer);
  view.setUint32(80, count, true);
  let o = 84;
  for (const { vertices: v, triangles: t } of meshes) {
    for (let i = 0; i < t.length; i += 3) {
      const [a, b, c] = [t[i] * 3, t[i + 1] * 3, t[i + 2] * 3];
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
      const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const len = Math.hypot(nx, ny, nz) || 1;
      view.setFloat32(o, nx / len, true);
      view.setFloat32(o + 4, ny / len, true);
      view.setFloat32(o + 8, nz / len, true);
      o += 12;
      for (const p of [a, b, c]) {
        view.setFloat32(o, v[p], true);
        view.setFloat32(o + 4, v[p + 1], true);
        view.setFloat32(o + 8, v[p + 2], true);
        o += 12;
      }
      o += 2;
    }
  }
  return out;
}

export function mergeMeshes(meshes: Mesh[]): Mesh {
  const vertices = new Float32Array(meshes.reduce((n, m) => n + m.vertices.length, 0));
  const triangles = new Uint32Array(meshes.reduce((n, m) => n + m.triangles.length, 0));
  let vo = 0, to = 0;
  for (const m of meshes) {
    vertices.set(m.vertices, vo);
    for (let i = 0; i < m.triangles.length; i++) triangles[to + i] = m.triangles[i] + vo / 3;
    vo += m.vertices.length;
    to += m.triangles.length;
  }
  return { vertices, triangles };
}

export type Box = { min: [number, number, number]; max: [number, number, number] };

export function boundingBox(meshes: Mesh[]): Box | null {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (const { vertices: v } of meshes) {
    for (let i = 0; i < v.length; i += 3) {
      any = true;
      for (let k = 0; k < 3; k++) {
        if (v[i + k] < min[k]) min[k] = v[i + k];
        if (v[i + k] > max[k]) max[k] = v[i + k];
      }
    }
  }
  return any ? { min, max } : null;
}

/** Signed volume; positive for a closed mesh with outward-facing triangles. */
export function volume({ vertices: v, triangles: t }: Mesh): number {
  let sum = 0;
  for (let i = 0; i < t.length; i += 3) {
    const [a, b, c] = [t[i] * 3, t[i + 1] * 3, t[i + 2] * 3];
    sum +=
      v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) -
      v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) +
      v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c]);
  }
  return sum / 6;
}

// Keeps only the vertices the triangles use and re-indexes them.
function compact(verts: Float32Array, tris: number[]): Mesh {
  const remap = new Map<number, number>();
  const out: number[] = [];
  const triangles = new Uint32Array(tris.length);
  tris.forEach((v, i) => {
    let id = remap.get(v);
    if (id === undefined) {
      id = out.length / 3;
      remap.set(v, id);
      out.push(verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2]);
    }
    triangles[i] = id;
  });
  return { vertices: new Float32Array(out), triangles };
}

// Ear-clips a planar polygon (OFF faces can be non-convex) after projecting it
// onto the plane its normal is most aligned with.
function triangulate(v: Float32Array, poly: number[]): [number, number, number][] {
  if (poly.length === 3) return [[poly[0], poly[1], poly[2]]];
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] * 3, b = poly[(i + 1) % poly.length] * 3;
    nx += (v[a + 1] - v[b + 1]) * (v[a + 2] + v[b + 2]);
    ny += (v[a + 2] - v[b + 2]) * (v[a] + v[b]);
    nz += (v[a] - v[b]) * (v[a + 1] + v[b + 1]);
  }
  const [ax, ay, sign] =
    Math.abs(nz) >= Math.abs(nx) && Math.abs(nz) >= Math.abs(ny) ? [0, 1, Math.sign(nz)]
    : Math.abs(nx) >= Math.abs(ny) ? [1, 2, Math.sign(nx)]
    : [2, 0, Math.sign(ny)];
  const pt = (i: number) => [v[i * 3 + ax], v[i * 3 + ay]];
  const cross = (o: number[], p: number[], q: number[]) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);

  const ring = [...poly];
  const out: [number, number, number][] = [];
  let guard = ring.length * ring.length;
  while (ring.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < ring.length; i++) {
      const [p, c, n] = [ring[(i + ring.length - 1) % ring.length], ring[i], ring[(i + 1) % ring.length]];
      const [P, C, N] = [pt(p), pt(c), pt(n)];
      if (cross(P, C, N) * (sign || 1) <= 0) continue;
      const inside = ring.some((q) => {
        if (q === p || q === c || q === n) return false;
        const Q = pt(q);
        const s = sign || 1;
        return cross(P, C, Q) * s > 0 && cross(C, N, Q) * s > 0 && cross(N, P, Q) * s > 0;
      });
      if (inside) continue;
      out.push([p, c, n]);
      ring.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  // Degenerate leftovers: fall back to a fan so no face goes missing.
  for (let i = 1; i < ring.length - 1; i++) out.push([ring[0], ring[i], ring[i + 1]]);
  return out;
}
