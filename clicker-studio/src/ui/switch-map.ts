// A flat map of the cap from above, with the Switches to drag. It updates in
// place after each build, so a rebuild never cuts a drag or takes the focus.
import { middle, type Mask, type Place, type Pt } from "../geometry/spots.ts";
import { t } from "../i18n/strings.ts";
import { button, field, h } from "./dom.ts";
import { rerender, state } from "./state.ts";
import { arrowKey, hasRoom, movable, moveSwitch, selectedIndex, setSwitchAxis, spotsNow, stepSwitch } from "./switch-move.ts";

const NS = "http://www.w3.org/2000/svg";
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, ...children: Element[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...children);
  return el;
}

const ringPath = (rings: Pt[][]) => rings.map((r) => `M${r.map(([x, y]) => `${x.toFixed(2)},${(-y).toFixed(2)}`).join("L")}Z`).join("");

function maskPath(m: Mask): string {
  let out = "";
  for (let j = 0; j < m.h; j++)
    for (let i = 0; i < m.w; i++) {
      if (!m.data[j * m.w + i]) continue;
      const from = i;
      while (i < m.w && m.data[j * m.w + i]) i++;
      const w = (i - from) * m.px;
      out += `M${m.x0 + from * m.px},${-(m.y0 + j * m.px)}h${w}v${-m.px}h${-w}Z`;
    }
  return out;
}

let refresh: () => void = () => {};
/** Redraws the map from the Design and the last build. */
export const refreshSwitchMap = () => refresh();

let onSelect: () => void = () => refresh();
/** Called when a Switch is selected on the map. */
export function onSwitchSelected(fn: () => void) {
  onSelect = fn;
}

/** `note` says how many Switches there are and who placed them. */
export function switchMap(note: () => string): HTMLElement {
  const text = h("p", { class: "muted" });
  const root = svg("svg", { class: "switch-map", role: "group", "aria-label": t("switch.map") });
  const ground = svg("g", {}), handles = svg("g", {});
  root.append(ground, handles);

  const box = (label: string, axis: 0 | 1) => {
    const input = h("input", { class: "num", attrs: { type: "number", step: 0.1, "aria-label": `${label} (mm)` } });
    input.addEventListener("change", () => {
      if (input.value !== "") setSwitchAxis(axis, Number(input.value));
      refresh();
    });
    return input;
  };
  const x = box("X", 0), y = box("Y", 1);
  const step = (label: string, name: string, dx: number, dy: number) => {
    const b = button(label, () => stepSwitch(dx, dy), "ghost", name);
    b.setAttribute("aria-label", name);
    return b;
  };
  const back = button(`↺ ${t("switch.back")}`, () => {
    delete state.design.cap.spots;
    rerender();
  });
  const which = h("b", {});
  const controls = h(
    "div",
    { class: "switch-move" },
    h("div", { class: "btn-row" }, which, h("label", {}, "X ", x), h("label", {}, "Y ", y), h("span", { class: "muted", text: "mm" })),
    h(
      "div",
      { class: "btn-row" },
      step("←", t("switch.left"), -0.5, 0),
      step("→", t("switch.right"), 0.5, 0),
      step("↑", t("switch.up"), 0, 0.5),
      step("↓", t("switch.down"), 0, -0.5),
      back,
    ),
  );
  const cramped = h("p", { class: "muted", text: t("switch.cramped") });
  const body = h("div", {}, field(t("switch.move"), root, t("switch.moveHint")), controls);
  const wrap = h("div", {}, text, body, cramped);

  const point = (e: PointerEvent): Pt => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(root.getScreenCTM()!.inverse());
    return [p.x, -p.y];
  };
  const handle = (i: number): SVGGElement => {
    const g = svg("g", { class: "switch-handle", tabindex: 0, role: "button" }, svg("rect", { x: -7, y: -7, width: 14, height: 14, rx: 1.5 }), svg("text", { "text-anchor": "middle", "dominant-baseline": "central" }));
    let grab: Pt | null = null;
    const select = () => {
      state.selectedSwitch = i;
      onSelect();
    };
    g.addEventListener("focus", select);
    g.addEventListener("pointerdown", (e) => {
      const place = movable();
      if (e.button !== 0 || !e.isPrimary || !place) return;
      g.setPointerCapture(e.pointerId);
      const p = point(e), at = spotsNow(place)[i];
      grab = [at[0] - p[0], at[1] - p[1]];
      select();
    });
    g.addEventListener("pointermove", (e) => {
      if (!grab || !e.isPrimary) return;
      const p = point(e);
      moveSwitch(i, [p[0] + grab[0], p[1] + grab[1]]);
    });
    for (const end of ["pointerup", "pointercancel"] as const) g.addEventListener(end, () => (grab = null));
    g.addEventListener("keydown", arrowKey);
    return g;
  };

  let drawn: Place | null = null;
  refresh = () => {
    text.textContent = note();
    const place = movable();
    const room = Boolean(place && hasRoom(place));
    body.hidden = !room;
    cramped.hidden = !place || room;
    if (!place || !room) return;
    const c = middle(place);
    if (drawn !== place) {
      drawn = place;
      const all = [...place.foot.flat(), ...place.cap.flat()];
      const xs = all.map((p) => p[0]), ys = all.map((p) => -p[1]);
      const x0 = Math.min(...xs) - 1, y0 = Math.min(...ys) - 1;
      root.setAttribute("viewBox", `${x0} ${y0} ${Math.max(...xs) + 1 - x0} ${Math.max(...ys) + 1 - y0}`);
      ground.replaceChildren(
        svg("path", { class: "map-foot", d: ringPath(place.foot), "fill-rule": "evenodd" }),
        svg("path", { class: "map-cap", d: ringPath(place.cap), "fill-rule": "evenodd" }),
        svg("path", { class: "map-ok", d: maskPath(place.ok) }),
        svg("path", { class: "map-mid", d: `M${c[0] - 1.5},${-c[1]}h3M${c[0]},${-c[1] - 1.5}v3` }),
      );
    }
    const at = spotsNow(place);
    if (handles.children.length !== at.length) handles.replaceChildren(...at.map((_, i) => handle(i)));
    const sel = selectedIndex(at.length);
    const mm = (p: Pt, k: 0 | 1) => String(Math.round((p[k] - c[k]) * 100) / 100 + 0);
    at.forEach((p, i) => {
      const g = handles.children[i];
      g.setAttribute("transform", `translate(${p[0]},${-p[1]})`);
      g.setAttribute("aria-label", `${t("switch.name")} ${i + 1}: X ${mm(p, 0)}, Y ${mm(p, 1)} mm`);
      g.classList.toggle("on", i === sel);
      g.querySelector("text")!.textContent = at.length > 1 ? String(i + 1) : "✥";
    });
    which.textContent = at.length > 1 ? `${t("switch.name")} ${sel + 1}` : "";
    for (const [input, k] of [[x, 0], [y, 1]] as const) input.value = mm(at[sel], k);
    back.disabled = !state.design.cap.spots;
  };
  refresh();
  return wrap;
}
