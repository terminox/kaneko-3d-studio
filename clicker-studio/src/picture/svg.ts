// SVG art -> a traced picture made of the SVG's own filled shapes, so edges stay
// crisp and colours exact. The pure functions run in tests; `svgToTraced` walks
// the SVG in the page, where CSS and transforms resolve.
import type { Traced } from "../geometry/decoration.ts";
import { mapRings, pathToRings, ringsBounds, type Ring } from "../geometry/path.ts";
import { signedArea } from "../design/heights.ts";
import { dist2, rgbToLab, toHex } from "./process.ts";

/** An SVG transform [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f. */
export type Matrix = [number, number, number, number, number, number];

/** A filled shape as drawn: rings in viewBox units (y down, origin at the viewBox corner). */
export type SvgShape = { rings: Ring[]; fill: string; evenOdd: boolean };

/** The longer side of the traced picture, in image units, whatever the viewBox. */
const SIDE = 1000;

export function rectPath(x: number, y: number, w: number, h: number, rx: number | null, ry: number | null): string {
  if (!(w > 0 && h > 0)) return "";
  // A missing radius takes the other one's value (SVG "auto").
  const a = Math.min(Math.max(rx ?? ry ?? 0, 0), w / 2);
  const b = Math.min(Math.max(ry ?? rx ?? 0, 0), h / 2);
  if (!a || !b) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  const arc = (ex: number, ey: number) => `A${a} ${b} 0 0 1 ${ex} ${ey}`;
  return `M${x + a} ${y}H${x + w - a}${arc(x + w, y + b)}V${y + h - b}${arc(x + w - a, y + h)}H${x + a}${arc(x, y + h - b)}V${y + b}${arc(x + a, y)}Z`;
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  if (!(rx > 0 && ry > 0)) return "";
  return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
}

/** A polygon's or polyline's `points`; a polyline fills as if closed. */
export function pointsPath(points: string): string {
  const n = (points.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
  if (n.length < 6) return "";
  const pairs: string[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) pairs.push(`${n[i]} ${n[i + 1]}`);
  return `M${pairs.join("L")}Z`;
}

export function applyMatrix(rs: Ring[], [a, b, c, d, e, f]: Matrix): Ring[] {
  return mapRings(rs, ([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
}

/** A computed CSS colour ("rgb(…)" or "rgba(…)") as hex plus alpha. */
export function parseCssColour(s: string): { hex: string; alpha: number } | null {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(s.trim());
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
  return { hex: toHex(Number(m[1]), Number(m[2]), Number(m[3])), alpha };
}

const labOf = (hex: string) => rgbToLab(...([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]));

/**
 * Merges fills down to `k` colours: the two closest in Lab join until `k` are
 * left, and the one covering more keeps its exact colour. Returns the colours,
 * biggest first, and each fill's index into them.
 */
export function mergeFills(fills: { color: string; area: number }[], k: number): { colours: string[]; index: number[] } {
  const groups: { color: string; area: number; members: number[] }[] = [];
  fills.forEach((f, i) => {
    const g = groups.find((x) => x.color === f.color);
    if (g) (g.area += f.area), g.members.push(i);
    else groups.push({ color: f.color, area: f.area, members: [i] });
  });
  while (groups.length > Math.max(1, k)) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        const d = dist2(labOf(groups[i].color), labOf(groups[j].color));
        if (d < bd) (bd = d), (bi = i), (bj = j);
      }
    const [keep, gone] = groups[bi].area >= groups[bj].area ? [groups[bi], groups[bj]] : [groups[bj], groups[bi]];
    keep.area += gone.area;
    keep.members.push(...gone.members);
    groups.splice(groups.indexOf(gone), 1);
  }
  groups.sort((a, b) => b.area - a.area);
  const index: number[] = new Array(fills.length);
  groups.forEach((g, gi) => g.members.forEach((m) => (index[m] = gi)));
  return { colours: groups.map((g) => g.color), index };
}

const areaOf = (rs: Ring[]) => Math.abs(rs.reduce((s, r) => s + signedArea(r), 0));

/** Whether a shape covers the whole `w` × `h` viewBox, as a background does. */
export function coversBox(rs: Ring[], w: number, h: number): boolean {
  const b = ringsBounds(rs);
  const tol = 0.01 * Math.max(w, h);
  return b.minX <= tol && b.minY <= tol && b.maxX >= w - tol && b.maxY >= h - tol && areaOf(rs) >= 0.98 * w * h;
}

/**
 * Drawn shapes -> a traced picture, `SIDE` units on its longer side. A first
 * shape covering the whole viewBox is a background and goes. Fills beyond
 * `colours` merge; one colour means the whole cap is one colour, as with a
 * raster picture.
 */
export function shapesToTraced(shapes: SvgShape[], w: number, h: number, colours: number, skipped: number): Traced & { colours: string[] } {
  const art = shapes.length && coversBox(shapes[0].rings, w, h) ? shapes.slice(1) : shapes;
  const f = SIDE / Math.max(w, h);
  const scaled = art.map((s) => mapRings(s.rings, ([x, y]) => [x * f, y * f]));
  const k = Math.max(1, Math.min(7, Math.round(colours)));
  const merged = mergeFills(art.map((s, i) => ({ color: s.fill, area: areaOf(scaled[i]) })), k);
  return {
    width: w * f,
    height: h * f,
    layers: k > 1 ? merged.colours.map((color) => ({ color, rings: [] })) : [],
    outline: scaled.flat(),
    shapes: art.map((s, i) => ({ layer: merged.index[i], rings: scaled[i], evenOdd: s.evenOdd })),
    skipped,
    colours: merged.colours,
  };
}

/* ---------- In the page ---------- */

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
/** Containers whose children aren't drawn where they stand. */
const NOT_DRAWN = new Set(["defs", "clipPath", "mask", "symbol", "pattern", "marker", "linearGradient", "radialGradient", "filter", "style", "title", "desc", "metadata"]);

const num = (s: string, fallback: number) => (Number.isFinite(parseFloat(s)) ? parseFloat(s) : fallback);
const hrefOf = (el: Element) => el.getAttribute("href") ?? el.getAttributeNS(XLINK_NS, "href") ?? "";

/** Reads SVG text into a traced picture of `colours` colours. Throws when it isn't an SVG. */
export function svgToTraced(text: string, colours: number): Traced & { colours: string[] } {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (doc.documentElement.localName !== "svg" || doc.getElementsByTagName("parsererror").length) throw new Error("Not an SVG file");
  let skipped = 0;
  // Nothing in it runs or loads: scripts, handlers and embedded content go, and
  // embedded content counts as left out, except in a <switch>, whose next child draws instead.
  for (const el of [...doc.querySelectorAll("script")]) el.remove();
  for (const el of [...doc.querySelectorAll("image, foreignObject, foreignobject")]) {
    if (el.parentElement?.localName !== "switch") skipped++;
    el.remove();
  }
  for (const el of doc.querySelectorAll("*")) for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name);

  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;left:-100000px;top:0;width:0;height:0;overflow:hidden";
  // A shadow root keeps the SVG's <style> rules and the page's apart.
  const root = host.attachShadow({ mode: "open" });
  const svg = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
  root.append(svg);
  document.body.append(host);
  try {
    const box = viewBox(svg);
    svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.w} ${box.h}`);
    svg.setAttribute("width", String(box.w));
    svg.setAttribute("height", String(box.h));
    expandUses(svg, root);
    // An untransformed child's screen matrix is the root's user space (the viewBox units).
    const probe = document.createElementNS(SVG_NS, "g");
    svg.prepend(probe);
    const toBox = probe.getScreenCTM()!.inverse();
    const tol = Math.max(box.w, box.h) / 2000;
    const shapes: SvgShape[] = [];

    const walk = (el: Element, opacity: number) => {
      if (NOT_DRAWN.has(el.localName)) return;
      const st = getComputedStyle(el);
      if (st.display === "none") return;
      const op = opacity * num(st.opacity, 1);
      if (el.localName === "text") {
        if (st.visibility === "visible" && op > 0.01) skipped++;
        return;
      }
      const d = pathData(el);
      if (d === null) {
        // A <switch> draws only its first child.
        const kids = el.localName === "switch" ? [...el.children].slice(0, 1) : [...el.children];
        for (const c of kids) walk(c, op);
        return;
      }
      if (st.visibility !== "visible") return;
      if (st.stroke !== "none" && num(st.strokeWidth, 1) > 0 && op * num(st.strokeOpacity, 1) > 0.01) skipped++;
      if (st.fill === "none" || !d) return;
      const fill = fillColour(st.fill, root);
      if (!fill) {
        skipped++;
        return;
      }
      if (op * num(st.fillOpacity, 1) * fill.alpha < 0.01) return;
      const m = toBox.multiply((el as SVGGraphicsElement).getScreenCTM()!);
      const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
      let local: Ring[];
      try {
        local = pathToRings(d, tol / scale);
      } catch {
        skipped++;
        return;
      }
      const rings = applyMatrix(local, [m.a, m.b, m.c, m.d, m.e - box.x, m.f - box.y]);
      if (rings.length) shapes.push({ rings, fill: fill.hex, evenOdd: st.fillRule === "evenodd" });
    };
    walk(svg, 1);
    return shapesToTraced(shapes, box.w, box.h, colours, skipped);
  } finally {
    host.remove();
  }
}

/** The viewBox; else the width and height; else the drawing's own bounds. */
function viewBox(svg: SVGSVGElement): { x: number; y: number; w: number; h: number } {
  const vb = svg.viewBox.baseVal;
  if (svg.hasAttribute("viewBox") && vb.width > 0 && vb.height > 0) return { x: vb.x, y: vb.y, w: vb.width, h: vb.height };
  const size = (l: SVGAnimatedLength, attr: string) =>
    svg.hasAttribute(attr) && l.baseVal.unitType !== SVGLength.SVG_LENGTHTYPE_PERCENTAGE ? l.baseVal.value : 0;
  const w = size(svg.width, "width"), h = size(svg.height, "height");
  if (w > 0 && h > 0) return { x: 0, y: 0, w, h };
  const b = svg.getBBox();
  return { x: b.x, y: b.y, w: Math.max(b.width, 1), h: Math.max(b.height, 1) };
}

/**
 * Replaces each <use> with a group holding a copy of what it points at, so the
 * copy's CSS, inheritance and transform resolve as the <use> draws it.
 */
function expandUses(svg: SVGSVGElement, root: ShadowRoot) {
  const own = new Set(["href", "xlink:href", "x", "y", "width", "height", "id", "transform"]);
  for (let pass = 0; pass < 8; pass++) {
    const uses = [...svg.querySelectorAll("use")];
    if (!uses.length) return;
    for (const use of uses) {
      const ref = hrefOf(use);
      const target = ref.startsWith("#") ? root.getElementById(ref.slice(1)) : null;
      const g = document.createElementNS(SVG_NS, "g");
      for (const a of use.attributes) if (!own.has(a.name)) g.setAttribute(a.name, a.value);
      g.setAttribute("transform", `${use.getAttribute("transform") ?? ""} translate(${use.x.baseVal.value} ${use.y.baseVal.value})`);
      if (target && !target.contains(use)) {
        let copy = target.cloneNode(true) as Element;
        copy.removeAttribute("id");
        if (copy.localName === "symbol") {
          // A symbol draws as a nested viewport sized by the <use>.
          const vp = document.createElementNS(SVG_NS, "svg");
          for (const a of copy.attributes) vp.setAttribute(a.name, a.value);
          vp.setAttribute("width", use.getAttribute("width") ?? "100%");
          vp.setAttribute("height", use.getAttribute("height") ?? "100%");
          vp.append(...copy.childNodes);
          copy = vp;
        }
        g.append(copy);
      }
      use.replaceWith(g);
    }
  }
}

/** A shape element's path data; "" for one with no area; null for anything else. */
function pathData(el: Element): string | null {
  if (el instanceof SVGPathElement) return el.getAttribute("d") ?? "";
  if (el instanceof SVGRectElement) {
    const len = (attr: "rx" | "ry") => (el.hasAttribute(attr) ? el[attr].baseVal.value : null);
    return rectPath(el.x.baseVal.value, el.y.baseVal.value, el.width.baseVal.value, el.height.baseVal.value, len("rx"), len("ry"));
  }
  if (el instanceof SVGCircleElement) return ellipsePath(el.cx.baseVal.value, el.cy.baseVal.value, el.r.baseVal.value, el.r.baseVal.value);
  if (el instanceof SVGEllipseElement) return ellipsePath(el.cx.baseVal.value, el.cy.baseVal.value, el.rx.baseVal.value, el.ry.baseVal.value);
  if (el instanceof SVGPolygonElement || el instanceof SVGPolylineElement) return pointsPath(el.getAttribute("points") ?? "");
  if (el instanceof SVGLineElement) return "";
  return null;
}

/** A computed fill as a colour. A gradient gives its first stop; a pattern only its fallback colour. */
function fillColour(fill: string, root: ShadowRoot): { hex: string; alpha: number } | null {
  const url = /^url\(["']?[^#]*#([^"')]+)["']?\)\s*(.*)$/.exec(fill);
  if (!url) return parseCssColour(fill);
  let el = root.getElementById(url[1]);
  for (let hops = 0; el && hops < 8 && /^(linear|radial)Gradient$/.test(el.localName); hops++) {
    const stop = [...el.children].find((c) => c.localName === "stop");
    if (stop) {
      const st = getComputedStyle(stop);
      const c = parseCssColour(st.stopColor);
      return c && { hex: c.hex, alpha: c.alpha * num(st.stopOpacity, 1) };
    }
    const ref = hrefOf(el);
    el = ref.startsWith("#") ? root.getElementById(ref.slice(1)) : null;
  }
  return url[2] ? parseCssColour(url[2]) : null;
}
