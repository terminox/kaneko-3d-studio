// Tiny DOM helpers and the shared form controls.
import { t, type StringKey } from "../i18n/strings.ts";

type Props = {
  class?: string;
  title?: string;
  on?: Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>>;
  attrs?: Record<string, string | boolean | number>;
  style?: string;
  text?: string;
  html?: string;
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: (Node | string | null | false | undefined)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.title) el.title = props.title;
  if (props.style) el.setAttribute("style", props.style);
  if (props.text !== undefined) el.textContent = props.text;
  if (props.html !== undefined) el.innerHTML = props.html;
  for (const [k, v] of Object.entries(props.attrs ?? {})) {
    if (v === false) continue;
    el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const [ev, fn] of Object.entries(props.on ?? {})) el.addEventListener(ev, fn as EventListener);
  for (const c of children) if (c !== null && c !== false && c !== undefined) el.append(c);
  return el;
}

export function section(title: StringKey, ...children: (Node | null | false | undefined)[]): HTMLElement {
  return h("section", { class: "card" }, h("h3", { text: t(title) }), ...children);
}

/** A labelled block: `label` is already translated. */
export function field(label: string, control: Node, hint?: string): HTMLElement {
  return h("div", { class: "field" }, h("div", { class: "field-label" }, h("span", { text: label }), hint ? h("small", { text: hint }) : null), control);
}

/** A slider with a typed number box. `onInput` fires live; the panel is not re-rendered. */
export function slider(label: StringKey, value: number, min: number, max: number, step: number, unit: string, onInput: (v: number) => void): HTMLElement {
  const num = h("input", { class: "num", attrs: { type: "number", min, max, step, value: String(value) } });
  const range = h("input", { attrs: { type: "range", min, max, step, value: String(value) } });
  const set = (v: number, from: HTMLInputElement) => {
    if (!Number.isFinite(v)) return;
    if (from !== range) range.value = String(v);
    if (from !== num) num.value = String(v);
    onInput(v);
  };
  range.addEventListener("input", () => set(Number(range.value), range));
  num.addEventListener("change", () => set(Math.min(max, Math.max(min, Number(num.value))), num));
  return h("div", { class: "slider" }, h("div", { class: "slider-head" }, h("span", { text: t(label) }), h("span", { class: "unit" }, num, unit)), range);
}

/** A row of buttons, one selected. */
export function segmented<T extends string>(options: { value: T; label: string; icon?: string }[], value: T, onPick: (v: T) => void, cls = ""): HTMLElement {
  const wrap = h("div", { class: `seg ${cls}` });
  for (const o of options) {
    const b = h("button", { class: o.value === value ? "on" : "", attrs: { type: "button", "aria-pressed": o.value === value } }, o.icon ? h("span", { class: "ico", text: o.icon }) : null, o.label);
    b.addEventListener("click", () => {
      for (const x of wrap.children) x.classList.remove("on");
      b.classList.add("on");
      onPick(o.value);
    });
    wrap.append(b);
  }
  return wrap;
}

export function toggle(label: StringKey, value: boolean, onChange: (v: boolean) => void, hint?: StringKey): HTMLElement {
  const input = h("input", { attrs: { type: "checkbox", checked: value } });
  input.addEventListener("change", () => onChange(input.checked));
  return h("label", { class: "toggle" }, input, h("span", { class: "track" }), h("span", { class: "toggle-text" }, h("b", { text: t(label) }), hint ? h("small", { text: t(hint) }) : null));
}

export function button(label: string, onClick: () => void, cls = "ghost", title?: string): HTMLButtonElement {
  return h("button", { class: cls, title, attrs: { type: "button" }, on: { click: onClick } }, label);
}

/** Swatches for filament colours. */
export function swatches(colors: { hex: string; name: string }[], value: string, onPick: (hex: string) => void): HTMLElement {
  const wrap = h("div", { class: "swatches" });
  for (const c of colors) {
    const b = h("button", {
      class: c.hex.toUpperCase() === value.toUpperCase() ? "sw on" : "sw",
      title: c.name,
      style: `--c:${c.hex}`,
      attrs: { type: "button", "aria-label": c.name },
    });
    b.addEventListener("click", () => {
      for (const x of wrap.children) x.classList.remove("on");
      b.classList.add("on");
      onPick(c.hex);
    });
    wrap.append(b);
  }
  return wrap;
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = h("input", { attrs: { type: "file", accept } });
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.click();
  });
}

export function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = h("a", { attrs: { href: url, download: name } });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
