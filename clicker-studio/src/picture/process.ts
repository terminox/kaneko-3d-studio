// Picture -> colour layers: background removal, hole punching, colour split
// (k-means in Lab) and tracing. Pure functions over RGBA pixels, so they run
// in tests as well as the browser.
import ImageTracer from "imagetracerjs";
import { pathToRings, type Ring } from "../geometry/path.ts";
import type { Traced } from "../geometry/decoration.ts";

export type Img = { width: number; height: number; data: Uint8ClampedArray };

export type PictureParams = {
  removeBackground: boolean;
  /** 0–100: how different from the background a colour must be to count as picture. */
  bgStrength: number;
  punchHoles: boolean;
  colors: number;
};

type Lab = [number, number, number];

function srgbToLinear(c: number) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const dist2 = (a: Lab, b: Lab) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

export const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("").toUpperCase();

/** 1 = picture, 0 = background. */
export function foregroundMask(img: Img, p: PictureParams): Uint8Array {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const mask = new Uint8Array(n).fill(1);
  if (!p.removeBackground) return mask;

  // A transparent PNG: trust its alpha.
  let clear = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 128) clear++;
  if (clear > n * 0.01) {
    for (let i = 0; i < n; i++) mask[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
    return mask;
  }

  // Otherwise the background is the colour around the border.
  const lab = new Array<Lab>(n);
  for (let i = 0; i < n; i++) lab[i] = rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  const median = (k: 0 | 1 | 2) => border.map((i) => lab[i][k]).sort((a, b) => a - b)[border.length >> 1];
  const bg: Lab = [median(0), median(1), median(2)];
  const thr = (4 + p.bgStrength * 0.32) ** 2;

  const isBg = (i: number) => dist2(lab[i], bg) < thr;
  if (p.punchHoles) {
    // Every background-coloured area goes, including ones enclosed by the picture.
    for (let i = 0; i < n; i++) if (isBg(i)) mask[i] = 0;
  } else {
    // Flood fill from the border only.
    const stack: number[] = border.filter(isBg);
    for (const i of stack) mask[i] = 0;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w, y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && mask[j] && isBg(j)) {
          mask[j] = 0;
          stack.push(j);
        }
      }
    }
  }
  return majority(mask, w, h, 2);
}

/** Majority filter on a 0/1 mask: removes specks and smooths edges. */
function majority(mask: Uint8Array, w: number, h: number, passes: number): Uint8Array {
  let cur = mask;
  for (let p = 0; p < passes; p++) {
    const out = new Uint8Array(cur.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < w && yy < h) (s += cur[yy * w + xx]), c++;
          }
        out[y * w + x] = s * 2 > c ? 1 : 0;
      }
    cur = out;
  }
  return cur;
}

/** k-means in Lab over the picture's pixels. Returns a label per pixel (-1 = background) and mean colours. */
export function splitColours(img: Img, mask: Uint8Array, k: number): { labels: Int16Array; colours: string[] } {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (mask[i]) idx.push(i);
  const labels = new Int16Array(n).fill(-1);
  if (!idx.length) return { labels, colours: [] };
  const lab = idx.map((i) => rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]));
  // Sample for speed; deterministic stride.
  const stride = Math.max(1, Math.floor(lab.length / 20000));
  const sample = lab.filter((_, i) => i % stride === 0);
  k = Math.max(1, Math.min(k, sample.length));
  // k-means++ with farthest-point seeding (deterministic).
  const centres: Lab[] = [sample[0]];
  const d = sample.map((p) => dist2(p, centres[0]));
  while (centres.length < k) {
    let best = 0;
    for (let i = 1; i < sample.length; i++) if (d[i] > d[best]) best = i;
    centres.push(sample[best]);
    for (let i = 0; i < sample.length; i++) d[i] = Math.min(d[i], dist2(sample[i], sample[best]));
  }
  const nearest = (p: Lab) => {
    let b = 0, bd = Infinity;
    for (let c = 0; c < centres.length; c++) {
      const dd = dist2(p, centres[c]);
      if (dd < bd) (bd = dd), (b = c);
    }
    return b;
  };
  for (let iter = 0; iter < 14; iter++) {
    const acc = centres.map(() => [0, 0, 0, 0]);
    for (const p of sample) {
      const a = acc[nearest(p)];
      a[0] += p[0];
      a[1] += p[1];
      a[2] += p[2];
      a[3]++;
    }
    acc.forEach((a, c) => {
      if (a[3]) centres[c] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
    });
  }
  idx.forEach((pix, j) => (labels[pix] = nearest(lab[j])));
  const smooth = modeFilter(labels, w, h, centres.length);

  // Mean RGB per label, then drop empty labels and sort biggest first.
  const sums = centres.map(() => [0, 0, 0, 0]);
  for (let i = 0; i < n; i++)
    if (smooth[i] >= 0) {
      const s = sums[smooth[i]];
      s[0] += data[i * 4];
      s[1] += data[i * 4 + 1];
      s[2] += data[i * 4 + 2];
      s[3]++;
    }
  const order = sums.map((s, c) => ({ c, n: s[3] })).filter((o) => o.n > 0).sort((a, b) => b.n - a.n);
  const remap = new Int16Array(centres.length).fill(-1);
  order.forEach((o, i) => (remap[o.c] = i));
  for (let i = 0; i < n; i++) if (smooth[i] >= 0) smooth[i] = remap[smooth[i]];
  return { labels: smooth, colours: order.map((o) => toHex(sums[o.c][0] / o.n, sums[o.c][1] / o.n, sums[o.c][2] / o.n)) };
}

/** 3×3 mode filter on labels (background stays background). */
function modeFilter(labels: Int16Array, w: number, h: number, k: number): Int16Array {
  const out = new Int16Array(labels);
  const count = new Int32Array(k);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (labels[i] < 0) continue;
      count.fill(0);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && labels[yy * w + xx] >= 0) count[labels[yy * w + xx]]++;
        }
      let best = labels[i];
      for (let c = 0; c < k; c++) if (count[c] > count[best]) best = c;
      out[i] = best;
    }
  return out;
}

/** Traces each label into rings (image px, y down). Label -1 is background. */
export function traceLabels(w: number, h: number, labels: Int16Array, k: number): Ring[][] {
  // Paint each label in a distinct palette colour and let imagetracer split them exactly.
  const pal = Array.from({ length: k + 1 }, (_, i) => ({ r: (i * 37) % 256, g: (i * 91) % 256, b: (i * 151 + 11) % 256, a: 255 }));
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const c = pal[labels[i] + 1];
    data[i * 4] = c.r;
    data[i * 4 + 1] = c.g;
    data[i * 4 + 2] = c.b;
    data[i * 4 + 3] = 255;
  }
  const options = { pal, colorquantcycles: 1, numberofcolors: pal.length, ltres: 0.5, qtres: 0.5, pathomit: 6, roundcoords: 2, rightangleenhance: false, blurradius: 0, layering: 0 };
  const td = ImageTracer.imagedataToTracedata({ width: w, height: h, data }, options);
  const out: Ring[][] = [];
  for (let l = 1; l < td.layers.length; l++) {
    const rings: Ring[] = [];
    td.layers[l].forEach((path: { isholepath: boolean }, p: number) => {
      if (path.isholepath) return;
      const svg = ImageTracer.svgpathstring(td, l, p, ImageTracer.checkoptions(options));
      const d = svg.match(/ d="([^"]+)"/)?.[1];
      if (d) rings.push(...pathToRings(d, 0.2));
    });
    out.push(rings);
  }
  return out;
}

/** The picture pixel deepest inside the shape: where the Switch goes. */
export function deepestPoint(mask: Uint8Array, w: number, h: number): { at: [number, number]; depth: number } {
  // Two-pass chamfer distance transform.
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? INF : 0;
  const get = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], get(x - 1, y) + 1, get(x, y - 1) + 1, get(x - 1, y - 1) + 1.414, get(x + 1, y - 1) + 1.414);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], get(x + 1, y) + 1, get(x, y + 1) + 1, get(x + 1, y + 1) + 1.414, get(x - 1, y + 1) + 1.414);
    }
  // Prefer the deepest point nearest the centroid when several tie.
  let cx = 0, cy = 0, cn = 0;
  for (let i = 0; i < w * h; i++) if (mask[i]) (cx += i % w), (cy += (i / w) | 0), cn++;
  cx /= cn || 1;
  cy /= cn || 1;
  let best = 0, score = -Infinity;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const s = d[i] - 0.02 * Math.hypot((i % w) - cx, ((i / w) | 0) - cy);
    if (s > score) (score = s), (best = i);
  }
  return { at: [best % w, (best / w) | 0], depth: d[best] };
}

/** The whole pipeline: pixels -> traced layers, outline and Switch anchor. */
export function tracePicture(img: Img, p: PictureParams): Traced & { anchor: [number, number]; depth: number; colours: string[] } {
  const mask = foregroundMask(img, p);
  const k = Math.max(1, Math.min(7, Math.round(p.colors)));
  const { labels, colours } = splitColours(img, mask, k);
  const fg = new Int16Array(mask.length);
  for (let i = 0; i < mask.length; i++) fg[i] = mask[i] ? 0 : -1;
  const outline = traceLabels(img.width, img.height, fg, 1)[0] ?? [];
  // One colour means the whole cap is one colour: no inlaid layers.
  const layerRings = k > 1 ? traceLabels(img.width, img.height, labels, colours.length) : [];
  const { at, depth } = deepestPoint(mask, img.width, img.height);
  return {
    width: img.width,
    height: img.height,
    outline,
    layers: layerRings.map((rings, i) => ({ color: colours[i], rings })),
    anchor: at,
    depth,
    colours,
  };
}
