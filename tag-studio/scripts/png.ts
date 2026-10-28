// A small PNG reader for the command line, where there is no canvas: 8-bit,
// non-interlaced greyscale, RGB, palette and alpha images -> RGBA pixels.
import { inflateSync } from "node:zlib";
import type { Img } from "@cs/picture/process.ts";

export function decodePng(buf: Uint8Array): Img {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (view.getUint32(0) !== 0x89504e47) throw new Error("not a PNG file");
  let pos = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  let palette: Uint8Array | null = null, trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (pos < buf.length) {
    const len = view.getUint32(pos);
    const kind = String.fromCharCode(...buf.subarray(pos + 4, pos + 8));
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR") {
      w = view.getUint32(pos + 8);
      h = view.getUint32(pos + 12);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (kind === "PLTE") palette = data;
    else if (kind === "tRNS") trns = data;
    else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error("only 8-bit, non-interlaced PNGs are supported here");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error(`PNG colour type ${type} is not supported`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const px = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y ? px[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 255;
    }
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = px.subarray(i * channels, i * channels + channels);
    let rgba: number[];
    if (type === 0) rgba = [s[0], s[0], s[0], 255];
    else if (type === 2) rgba = [s[0], s[1], s[2], 255];
    else if (type === 4) rgba = [s[0], s[0], s[0], s[1]];
    else if (type === 6) rgba = [s[0], s[1], s[2], s[3]];
    else rgba = [palette![s[0] * 3], palette![s[0] * 3 + 1], palette![s[0] * 3 + 2], trns && s[0] < trns.length ? trns[s[0]] : 255];
    data.set(rgba, i * 4);
  }
  return { width: w, height: h, data };
}

/** Crops (fractions of the image) and box-scales so the longer side is at most `maxSide`. */
export function cropAndShrink(img: Img, crop: { x: number; y: number; w: number; h: number }, maxSide: number): Img {
  const sx = Math.round(crop.x * img.width), sy = Math.round(crop.y * img.height);
  const sw = Math.max(1, Math.round(crop.w * img.width)), sh = Math.max(1, Math.round(crop.h * img.height));
  const s = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * s)), h = Math.max(1, Math.round(sh * s));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const x0 = sx + Math.floor(x / s), x1 = Math.max(x0 + 1, sx + Math.floor((x + 1) / s));
      const y0 = sy + Math.floor(y / s), y1 = Math.max(y0 + 1, sy + Math.floor((y + 1) / s));
      const acc = [0, 0, 0, 0];
      let n = 0;
      for (let yy = y0; yy < Math.min(y1, img.height); yy++)
        for (let xx = x0; xx < Math.min(x1, img.width); xx++) {
          const i = (yy * img.width + xx) * 4;
          for (let k = 0; k < 4; k++) acc[k] += img.data[i + k];
          n++;
        }
      out.set(acc.map((v) => v / (n || 1)), (y * w + x) * 4);
    }
  return { width: w, height: h, data: out };
}
