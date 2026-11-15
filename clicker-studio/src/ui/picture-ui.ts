// Picture handling on the main thread: crop/adjust dialog, AI cartoon, and
// tracing images into colour layers for the geometry worker.
import type { Design, PictureOptions } from "../design/types.ts";
import type { Traced } from "../geometry/decoration.ts";
import { nearestFilament } from "../design/palette.ts";
import { tracePicture, type Img } from "../picture/process.ts";
import { svgToTraced } from "../picture/svg.ts";
import { t } from "../i18n/strings.ts";
import { h, readDataUrl } from "./dom.ts";
import { state } from "./state.ts";

const images = new Map<string, Promise<HTMLImageElement>>();

/** Whether a stored picture is SVG art, traced from its own shapes. */
export const isSvg = (src: string | undefined) => Boolean(src?.startsWith("data:image/svg+xml"));

/** An uploaded picture as stored in `design.files`. SVG art keeps its type even when the browser didn't name it. */
export function readPicture(f: File): Promise<string> {
  const svg = f.type === "image/svg+xml" || /\.svg$/i.test(f.name);
  return readDataUrl(svg ? new Blob([f], { type: "image/svg+xml" }) : f);
}

const svgArt = async (src: string, colours: number) => svgToTraced(await (await fetch(src)).text(), colours);

export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = images.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read the image"));
      img.src = src;
    });
    images.set(src, p);
  }
  return p;
}

type Crop = PictureOptions["crop"];
type Adjust = PictureOptions["adjust"];

/** The image rotated by `deg`, on a canvas big enough to hold it. */
function rotated(img: HTMLImageElement, deg: number): HTMLCanvasElement {
  const a = (deg * Math.PI) / 180;
  const w = img.naturalWidth, hh = img.naturalHeight;
  const cw = Math.round(Math.abs(w * Math.cos(a)) + Math.abs(hh * Math.sin(a)));
  const ch = Math.round(Math.abs(w * Math.sin(a)) + Math.abs(hh * Math.cos(a)));
  const c = h("canvas", { attrs: { width: cw, height: ch } });
  const ctx = c.getContext("2d")!;
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(a);
  ctx.drawImage(img, -w / 2, -hh / 2);
  return c;
}

/** Crops, adjusts and scales the picture so its longer side is `maxSide`. */
export async function renderPicture(src: string, crop: Crop, adjust: Adjust, maxSide: number): Promise<HTMLCanvasElement> {
  const img = await loadImage(src);
  const r = rotated(img, crop.rotate);
  const sx = crop.x * r.width, sy = crop.y * r.height, sw = crop.w * r.width, sh = crop.h * r.height;
  const s = Math.min(1, maxSide / Math.max(sw, sh)) || 1;
  const out = h("canvas", { attrs: { width: Math.max(1, Math.round(sw * s)), height: Math.max(1, Math.round(sh * s)) } });
  const ctx = out.getContext("2d")!;
  ctx.filter = `brightness(${1 + adjust.brightness / 100}) contrast(${1 + adjust.contrast / 100}) saturate(${1 + adjust.saturation / 100})`;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(r, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

function pixels(c: HTMLCanvasElement): Img {
  const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
  return { width: d.width, height: d.height, data: d.data };
}

const FULL: Crop = { x: 0, y: 0, w: 1, h: 1, rotate: 0 };
const NO_ADJUST: Adjust = { brightness: 0, contrast: 0, saturation: 0 };

/** Traces a Design's picture (filling its palette when empty or stale). */
async function tracePictureOf(design: Design): Promise<Record<string, Traced>> {
  const p = design.picture;
  if (!p || !p.image) return {};
  const cartoon = design.files[`${p.image}:cartoon`];
  const useCartoon = p.useCartoon && Boolean(cartoon);
  const src = useCartoon ? cartoon : design.files[p.image];
  if (!src) return {};
  const traced = isSvg(src) ? await svgArt(src, p.colors) : tracePicture(pixels(await renderPicture(src, useCartoon ? FULL : p.crop, useCartoon ? NO_ADJUST : p.adjust, 360)), p);
  // Keep the owner's colour choices when the colour count is unchanged. A new
  // split re-sorts the colours, so their heights start over; patch pins stay put.
  if (p.palette.length !== traced.colours.length || !p.palette.length) {
    p.palette = traced.colours.map(nearestFilament);
    if (p.heights) p.heights.colour = [];
  }
  return { [p.image]: traced };
}

/** Traces images used as Keycap Decorations, reusing `cache` by image id. */
async function traceKeyImagesOf(design: Design, cache: Record<string, Traced>): Promise<Record<string, Traced>> {
  const out: Record<string, Traced> = {};
  for (const k of design.keys) {
    if (k.deco.type !== "image") continue;
    const id = k.deco.image;
    const src = design.files[id];
    if (!src) continue;
    if (cache[id]) {
      out[id] = cache[id];
      continue;
    }
    const tr = isSvg(src)
      ? await svgArt(src, 3)
      : tracePicture(pixels(await renderPicture(src, FULL, NO_ADJUST, 240)), { removeBackground: true, bgStrength: 70, punchHoles: true, colors: 3 });
    tr.layers = tr.layers.map((l) => ({ ...l, color: nearestFilament(l.color) }));
    out[id] = tr;
  }
  return out;
}

/** Every traced image a Design needs. */
export async function traceDesign(design: Design, cache: Record<string, Traced> = {}): Promise<Record<string, Traced>> {
  return { ...(await traceKeyImagesOf(design, cache)), ...(await tracePictureOf(design)) };
}

// A retrace rebuilds every patch, so picks are dropped.
export async function retracePicture(): Promise<void> {
  state.traced = { ...state.traced, ...(await tracePictureOf(state.design)) };
  state.selected = [];
}

export async function retraceKeyImages(): Promise<void> {
  state.traced = { ...state.traced, ...(await traceKeyImagesOf(state.design, state.traced)) };
  state.selected = [];
}

export async function retraceAll() {
  state.traced = await traceDesign(state.design, state.traced);
  state.selected = [];
}

/** Sends the cropped picture to the AI cartoon endpoint; stores the result. */
export async function cartoonize(): Promise<void> {
  const p = state.design.picture;
  if (!p?.image) return;
  const canvas = await renderPicture(state.design.files[p.image], p.crop, p.adjust, 768);
  const res = await fetch("api/cartoon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: canvas.toDataURL("image/png") }),
  });
  const body = (await res.json()) as { image?: string; error?: string };
  if (!res.ok || !body.image) throw new Error(body.error ?? `HTTP ${res.status}`);
  state.design.files[`${p.image}:cartoon`] = body.image;
  p.useCartoon = true;
}

export async function cartoonAvailable(): Promise<boolean> {
  try {
    const res = await fetch("api/cartoon");
    return res.ok && ((await res.json()) as { enabled: boolean }).enabled;
  } catch {
    return false;
  }
}

/** Crop / rotate / adjust dialog. Resolves with the new values, or null on cancel. */
export async function cropDialog(src: string, crop: Crop, adjust: Adjust): Promise<{ crop: Crop; adjust: Adjust } | null> {
  const img = await loadImage(src);
  let c: Crop = { ...crop };
  const a: Adjust = { ...adjust };
  const SIZE = 420;
  const canvas = h("canvas", { class: "crop-canvas", attrs: { width: SIZE, height: SIZE } });
  const ctx = canvas.getContext("2d")!;
  let rot = rotated(img, c.rotate);
  // Where the rotated image sits in the canvas.
  let fit = { x: 0, y: 0, s: 1 };

  const draw = () => {
    const s = Math.min(SIZE / rot.width, SIZE / rot.height);
    fit = { s, x: (SIZE - rot.width * s) / 2, y: (SIZE - rot.height * s) / 2 };
    ctx.clearRect(0, 0, SIZE, SIZE);
    // Checkerboard shows transparency.
    for (let y = 0; y < SIZE; y += 12) for (let x = 0; x < SIZE; x += 12) {
      ctx.fillStyle = (x + y) % 24 ? "#eceaf3" : "#f8f7fc";
      ctx.fillRect(x, y, 12, 12);
    }
    ctx.filter = `brightness(${1 + a.brightness / 100}) contrast(${1 + a.contrast / 100}) saturate(${1 + a.saturation / 100})`;
    ctx.drawImage(rot, fit.x, fit.y, rot.width * s, rot.height * s);
    ctx.filter = "none";
    const rx = fit.x + c.x * rot.width * s, ry = fit.y + c.y * rot.height * s, rw = c.w * rot.width * s, rh = c.h * rot.height * s;
    ctx.fillStyle = "rgba(30,20,60,0.45)";
    ctx.beginPath();
    ctx.rect(0, 0, SIZE, SIZE);
    ctx.rect(rx, ry, rw, rh);
    ctx.fill("evenodd");
    ctx.strokeStyle = "#7c4dff";
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.fillStyle = "#7c4dff";
    for (const [hx, hy] of [[rx, ry], [rx + rw, ry], [rx, ry + rh], [rx + rw, ry + rh]]) ctx.fillRect(hx - 5, hy - 5, 10, 10);
  };

  // Drag: inside moves the crop, near a corner resizes it.
  let drag: { mode: string; x0: number; y0: number; c0: Crop } | null = null;
  const toNorm = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * SIZE, py = ((e.clientY - r.top) / r.height) * SIZE;
    return [(px - fit.x) / (rot.width * fit.s), (py - fit.y) / (rot.height * fit.s)];
  };
  canvas.addEventListener("pointerdown", (e) => {
    const [x, y] = toNorm(e);
    const near = (ax: number, ay: number) => Math.abs(x - ax) < 0.05 && Math.abs(y - ay) < 0.05;
    let mode = "";
    if (near(c.x, c.y)) mode = "tl";
    else if (near(c.x + c.w, c.y)) mode = "tr";
    else if (near(c.x, c.y + c.h)) mode = "bl";
    else if (near(c.x + c.w, c.y + c.h)) mode = "br";
    else if (x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h) mode = "move";
    if (!mode) return;
    drag = { mode, x0: x, y0: y, c0: { ...c } };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const [x, y] = toNorm(e);
    const dx = x - drag.x0, dy = y - drag.y0, o = drag.c0;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    if (drag.mode === "move") c = { ...c, x: clamp(Math.min(o.x + dx, 1 - o.w)), y: clamp(Math.min(o.y + dy, 1 - o.h)) };
    else {
      let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
      if (drag.mode.includes("l")) x0 = clamp(Math.min(o.x + dx, x1 - 0.05));
      if (drag.mode.includes("r")) x1 = clamp(Math.max(x1 + dx, x0 + 0.05));
      if (drag.mode.includes("t")) y0 = clamp(Math.min(o.y + dy, y1 - 0.05));
      if (drag.mode.includes("b")) y1 = clamp(Math.max(y1 + dy, y0 + 0.05));
      c = { ...c, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    draw();
  });
  canvas.addEventListener("pointerup", () => (drag = null));

  const setRotate = (deg: number) => {
    c = { x: 0, y: 0, w: 1, h: 1, rotate: ((deg % 360) + 360) % 360 };
    rot = rotated(img, c.rotate);
    fine.value = String(((c.rotate + 180) % 360) - 180);
    draw();
  };
  const fine = h("input", { attrs: { type: "range", min: -45, max: 45, step: 1, value: String(((c.rotate + 180) % 360) - 180) } });
  fine.addEventListener("input", () => setRotate(Number(fine.value)));
  const adj = (key: keyof Adjust, label: string) => {
    const r = h("input", { attrs: { type: "range", min: -60, max: 60, step: 1, value: String(a[key]) } });
    r.addEventListener("input", () => {
      a[key] = Number(r.value);
      draw();
    });
    return h("label", { class: "adj" }, h("span", { text: label }), r);
  };

  return new Promise((resolve) => {
    const close = (v: { crop: Crop; adjust: Adjust } | null) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    const dlg = h(
      "dialog",
      { class: "crop-dialog" },
      h("h2", { text: t("crop.title") }),
      h("p", { class: "muted", text: t("crop.hint") }),
      canvas,
      h(
        "div",
        { class: "seg" },
        h("button", { attrs: { type: "button" }, on: { click: () => setRotate(c.rotate - 90) } }, `⟲ ${t("crop.left")}`),
        h("button", { attrs: { type: "button" }, on: { click: () => setRotate(c.rotate + 90) } }, `⟳ ${t("crop.right")}`),
        h("button", { attrs: { type: "button" }, on: { click: () => ((c = { ...c, x: 0, y: 0, w: 1, h: 1 }), draw()) } }, `⛶ ${t("crop.whole")}`),
      ),
      h("label", { class: "adj" }, h("span", { text: t("crop.fine") }), fine),
      adj("brightness", t("crop.brightness")),
      adj("contrast", t("crop.contrast")),
      adj("saturation", t("crop.saturation")),
      h(
        "div",
        { class: "dialog-actions" },
        h("button", { class: "ghost", attrs: { type: "button" }, on: { click: () => close(null) } }, t("common.cancel")),
        h("button", { class: "primary", attrs: { type: "button" }, on: { click: () => close({ crop: c, adjust: a }) } }, t("crop.use")),
      ),
    );
    dlg.addEventListener("cancel", () => close(null));
    document.body.append(dlg);
    dlg.showModal();
    draw();
  });
}
