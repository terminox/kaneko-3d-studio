// Builds the parameter form from a schema, MakerWorld style: one collapsible
// section per Customizer group, a control per parameter type.
import type { Param, ParamSchema, ParamValue, ParamValues } from "../params/parse.ts";
import type { FontEntry } from "../openscad/browser-runner.ts";

export type Upload = { name: string; path: string; data: Uint8Array };

export type PanelEvents = {
  change: (values: ParamValues) => void;
  upload: (param: string, upload: Upload | null) => void;
};

export function renderPanel(
  host: HTMLElement,
  schema: ParamSchema,
  values: ParamValues,
  fonts: FontEntry[],
  uploads: Record<string, Upload>,
  on: PanelEvents,
) {
  host.replaceChildren();
  if (!schema.groups.length) {
    host.append(el("p", { class: "empty" }, "This model has no parameters."));
    return;
  }
  const set = (name: string, value: ParamValue) => {
    values[name] = value;
    on.change(values);
  };

  for (const group of schema.groups) {
    const details = el("details", { class: "group", open: "" });
    details.append(el("summary", {}, group.name || "Parameters"));
    for (const p of group.params) details.append(field(p, values[p.name] ?? p.default, set, fonts, uploads[p.name], on.upload));
    host.append(details);
  }
}

function field(
  p: Param,
  value: ParamValue,
  set: (name: string, v: ParamValue) => void,
  fonts: FontEntry[],
  upload: Upload | undefined,
  onUpload: PanelEvents["upload"],
): HTMLElement {
  const wrap = el("div", { class: `field field-${p.type}` });
  const id = `p-${p.name}`;
  const head = el("label", { for: id, class: "field-label" }, p.label);
  wrap.append(head);
  if (p.description) wrap.append(el("div", { class: "field-help" }, p.description));

  switch (p.type) {
    case "boolean": {
      const box = el("input", { id, type: "checkbox" }) as HTMLInputElement;
      box.checked = value as boolean;
      box.onchange = () => set(p.name, box.checked);
      head.prepend(box);
      wrap.classList.add("inline");
      break;
    }
    case "slider": {
      const row = el("div", { class: "row" });
      const range = el("input", { type: "range", min: p.min, max: p.max, step: p.step, value: String(value) }) as HTMLInputElement;
      const num = el("input", { id, type: "number", min: p.min, max: p.max, step: p.step, value: String(value) }) as HTMLInputElement;
      range.oninput = () => {
        num.value = range.value;
        set(p.name, Number(range.value));
      };
      num.onchange = () => {
        if (num.value === "" || Number.isNaN(Number(num.value))) return;
        range.value = num.value;
        set(p.name, Number(num.value));
      };
      row.append(range, num);
      wrap.append(row);
      break;
    }
    case "number": {
      const num = el("input", { id, type: "number", step: p.step, value: String(value) }) as HTMLInputElement;
      num.onchange = () => num.value !== "" && set(p.name, Number(num.value));
      wrap.append(num);
      break;
    }
    case "vector": {
      const row = el("div", { class: "row vector" });
      const current = [...(value as number[])];
      current.forEach((v, i) => {
        const num = el("input", { type: "number", step: p.step, value: String(v), ...(p.min !== undefined && { min: p.min }), ...(p.max !== undefined && { max: p.max }) }) as HTMLInputElement;
        if (i === 0) num.id = id;
        num.onchange = () => {
          current[i] = Number(num.value);
          set(p.name, [...current]);
        };
        row.append(num);
      });
      wrap.append(row);
      break;
    }
    case "dropdown": {
      const select = el("select", { id }) as HTMLSelectElement;
      for (const o of p.options) select.append(option(String(o.value), o.label, o.value === value));
      select.onchange = () => set(p.name, typeof p.default === "number" ? Number(select.value) : select.value);
      wrap.append(select);
      break;
    }
    case "string": {
      const input = el("input", { id, type: "text", value: String(value), ...(p.maxLength && { maxlength: p.maxLength }) }) as HTMLInputElement;
      input.oninput = () => set(p.name, input.value);
      wrap.append(input);
      break;
    }
    case "color": {
      const row = el("div", { class: "row" });
      const pick = el("input", { id, type: "color", value: toPickerHex(String(value)) }) as HTMLInputElement;
      const hex = el("input", { type: "text", value: String(value), class: "hex", spellcheck: "false" }) as HTMLInputElement;
      pick.oninput = () => {
        hex.value = pick.value.toUpperCase();
        set(p.name, hex.value);
      };
      hex.onchange = () => {
        if (!/^#[0-9a-f]{6}$/i.test(hex.value)) return;
        pick.value = hex.value;
        set(p.name, hex.value.toUpperCase());
      };
      row.append(pick, hex);
      wrap.append(row);
      break;
    }
    case "font": {
      const select = el("select", { id }) as HTMLSelectElement;
      const known = fonts.some((f) => f.styles.some((s) => s.spec === value));
      if (!known) select.append(option(String(value), `${value} (not installed: falls back to another font)`, true));
      for (const f of fonts) {
        const group = el("optgroup", { label: f.family }) as HTMLOptGroupElement;
        for (const s of f.styles) group.append(option(s.spec, `${f.family} ${s.label}`, s.spec === value));
        select.append(group);
      }
      select.onchange = () => set(p.name, select.value);
      wrap.append(select);
      if (!known) wrap.append(el("div", { class: "field-warn" }, "This font isn't bundled. Pick one from the list."));
      break;
    }
    case "file": {
      const row = el("div", { class: "row" });
      const input = el("input", { id, type: "file", accept: `.${p.accept}`, hidden: "" }) as HTMLInputElement;
      const choose = el("button", { type: "button" }, `Choose .${p.accept}…`) as HTMLButtonElement;
      const name = el("span", { class: "file-name" });
      const clear = el("button", { type: "button", class: "ghost small" }, "Use built-in") as HTMLButtonElement;
      const show = (u: Upload | undefined) => {
        name.textContent = u ? u.name : `${p.default} (built-in)`;
        clear.hidden = !u;
      };
      show(upload);
      choose.onclick = () => input.click();
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const u = { name: file.name, path: `uploads/${p.name}.${p.accept}`, data: new Uint8Array(await file.arrayBuffer()) };
        onUpload(p.name, u);
        show(u);
        set(p.name, u.path);
      };
      clear.onclick = () => {
        onUpload(p.name, null);
        input.value = "";
        show(undefined);
        set(p.name, p.default);
      };
      row.append(input, choose, name, clear);
      wrap.append(row);
      break;
    }
  }
  return wrap;
}

function toPickerHex(v: string): string {
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "#000000";
}

function option(value: string, label: string, selected: boolean): HTMLOptionElement {
  const o = el("option", { value }, label) as HTMLOptionElement;
  o.selected = selected;
  return o;
}

export function el(tag: string, attrs: Record<string, string | number> = {}, text?: string): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}
