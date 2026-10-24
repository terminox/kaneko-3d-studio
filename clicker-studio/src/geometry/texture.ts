// Base wall textures: cutters (or bumps) placed along the footprint's perimeter.
import type { Texture } from "../design/types.ts";
import { K, type CrossSection, type Manifold } from "./kernel.ts";
import { offset, polygon } from "./outline.ts";
import { slab } from "./cap.ts";

type Station = { p: [number, number]; deg: number };

/** Points every `step` mm along the outer contours, with the tangent angle. */
export function stations(foot: CrossSection, step: number): Station[] {
  const out: Station[] = [];
  for (const poly of foot.toPolygons()) {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
      area += x1 * y2 - x2 * y1;
    }
    if (area <= 0) continue; // holes
    let carry = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-9) continue;
      const deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      let s = carry;
      while (s < len) {
        const t = s / len;
        out.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], deg });
        s += step;
      }
      carry = s - len;
    }
  }
  return out;
}

/** Places a cutter built with x along the tangent and -y pointing into the wall. */
function place(m: Manifold, st: Station, z: number): Manifold {
  return m.rotate([0, 0, st.deg]).translate([st.p[0], st.p[1], z]);
}

export function applyTexture(body: Manifold, foot: CrossSection, bottom: number, top: number, kind: Texture, depth: number): Manifold {
  const { Manifold, CrossSection } = K();
  const z0 = bottom + 1.2;
  const z1 = top - 1.2;
  const h = z1 - z0;
  if (h < 2 || kind === "none") return body;
  const d = Math.max(0.3, depth);
  const cutters: Manifold[] = [];

  switch (kind) {
    case "ribs": {
      const box = Manifold.cube([1.0, 2 * d, h], true).translate([0, 0, h / 2]);
      for (const st of stations(foot, 2.6)) cutters.push(place(box, st, z0));
      break;
    }
    case "sawtooth": {
      const p = 2.4;
      const wedge = polygon([[-p / 2, 0.6], [p / 2, 0.6], [p / 2, -d]]).extrude(h);
      for (const st of stations(foot, p)) cutters.push(place(wedge, st, z0));
      break;
    }
    case "grooves": {
      const ring = foot.subtract(offset(foot, -d));
      for (let z = z0; z + 0.6 <= z1; z += 1.8) cutters.push(slab(ring, z, z + 0.6));
      break;
    }
    case "diamond":
    case "wave": {
      const tilts = kind === "diamond" ? [40, -40] : [35];
      const step = 0.9;
      const spacing = kind === "diamond" ? 4 : 3;
      const width = kind === "diamond" ? 0.8 : 1.2;
      const sts = stations(foot, step);
      const perim = sts.length * step;
      for (const tilt of tilts) {
        const k = Math.tan((tilt * Math.PI) / 180);
        const seg = Manifold.cube([step * Math.sqrt(1 + k * k) + 0.2, 2 * d, width], true).rotate([0, -tilt, 0]);
        // Each line: z = z0 + k * (s - s0). Walk the stations; a line crosses the wall band when z is in range.
        for (let s0 = -h / Math.abs(k); s0 < perim; s0 += spacing) {
          sts.forEach((st, i) => {
            const z = z0 + k * (i * step - s0) + (k < 0 ? h : 0);
            if (z > z0 + width / 2 && z < z1 - width / 2) cutters.push(place(seg, st, z));
          });
        }
      }
      break;
    }
    case "dots": {
      const bump = Manifold.sphere(0.8, 16);
      let row = 0;
      for (let z = z0 + 0.8; z <= z1 - 0.8; z += 2.6, row++) {
        const sts = stations(foot, 2.6);
        sts.forEach((st, i) => {
          if ((i + row) % 2 === 0) cutters.push(place(bump, st, z));
        });
      }
      return cutters.length ? body.add(Manifold.union(cutters)) : body;
    }
  }
  void CrossSection;
  return cutters.length ? body.subtract(Manifold.union(cutters)) : body;
}
