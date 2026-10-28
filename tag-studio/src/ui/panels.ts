// The form: one card per group (Picture, Name, Plate, Rings, Colours, Keyring).
// Sliders call `changed()` (rebuild only); structural edits call `rerender()`.
import { FILAMENTS, PAIRS, filamentName } from "@cs/design/palette.ts";
import { tagNames, type LoopSide, type NamePosition, type TagDesign } from "../design/types.ts";
import { t, type StringKey } from "../i18n/strings.ts";
import { button, field, h, pickFile, readDataUrl, section, segmented, slider, swatches, toggle } from "./dom.ts";
import { changed, rerender, state } from "./state.ts";
import { cartoonize, cropDialog, retracePicture } from "./picture-ui.ts";

const d = () => state.design;
const swatchList = () => FILAMENTS.map((f) => ({ hex: f.hex, name: f[state.lang] }));

export type FontInfo = { name: string; label: string; script: string };
let fonts: FontInfo[] = [];

export async function loadFonts() {
  try {
    fonts = (await (await fetch("fonts/fonts.json")).json()) as FontInfo[];
  } catch {
    fonts = [{ name: "Fredoka-700", label: "Fredoka Bold", script: "latin" }];
  }
}

function add(el: HTMLElement, ...children: (Node | null | false | undefined)[]) {
  for (const c of children) if (c) el.append(c);
  return el;
}

function debounce<T>(fn: (v: T) => void, ms = 250): (v: T) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (v) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(v), ms);
  };
}

function swatchField(label: StringKey, value: string, set: (hex: string) => void): HTMLElement {
  return field(t(label), swatches(swatchList(), value, (hex) => {
    set(hex);
    rerender();
  }));
}

async function retraceAndRender(full = true) {
  state.status = t("status.tracing");
  await retracePicture();
  if (full) rerender();
  else changed();
}

/* ---------- Design name ---------- */

export function designNameCard(): HTMLElement {
  const input = h("input", { class: "text", attrs: { type: "text", value: d().name, maxlength: 60 } });
  input.addEventListener("input", () => {
    d().name = input.value;
    changed();
  });
  return h("section", { class: "card slim" }, field(t("design.name"), input));
}

/* ---------- Picture ---------- */

export function pictureCard(): HTMLElement {
  const p = d().picture;
  const has = Boolean(p.image && d().files[p.image]);
  const card = section(
    "card.picture",
    button(`📷 ${t(has ? "picture.change" : "picture.upload")}`, async () => {
      const f = await pickFile("image/*");
      if (!f) return;
      const id = `pic-${Date.now()}`;
      d().files = { [id]: await readDataUrl(f) };
      p.image = id;
      p.useCartoon = false;
      p.palette = [];
      p.crop = { x: 0, y: 0, w: 1, h: 1, rotate: 0 };
      const r = await cropDialog(d().files[id], p.crop, p.adjust);
      if (r) Object.assign(p, r);
      await retraceAndRender();
    }, "primary block big-btn"),
    h("p", { class: "muted", text: t("picture.hint") }),
  );
  if (!has) return card;

  add(card,
    h(
      "div",
      { class: "btn-row" },
      button(`✂️ ${t("picture.crop")}`, async () => {
        const r = await cropDialog(d().files[p.image], p.crop, p.adjust);
        if (!r) return;
        Object.assign(p, r);
        p.useCartoon = false;
        await retraceAndRender();
      }),
      button(`🗑 ${t("picture.remove")}`, () => {
        p.image = "";
        p.palette = [];
        d().files = {};
        state.traced = {};
        rerender();
      }),
    ),
  );

  // AI cartoon.
  const cartoon = d().files[`${p.image}:cartoon`];
  const aiBox = h("div", { class: "ai-box" });
  const aiBtn = button(`✨ ${t(cartoon ? "ai.again" : "ai.make")}`, async () => {
    aiBtn.disabled = true;
    aiBtn.textContent = `⏳ ${t("ai.working")}`;
    try {
      await cartoonize();
      p.palette = [];
      await retraceAndRender();
    } catch (e) {
      aiBtn.disabled = false;
      aiBtn.textContent = `✨ ${t("ai.make")}`;
      aiBox.append(h("p", { class: "error", text: `${t("ai.failed")}: ${e instanceof Error ? e.message : e}` }));
    }
  }, "ai");
  if (!state.cartoonEnabled) {
    aiBtn.disabled = true;
    aiBtn.title = t("ai.disabled");
  }
  aiBox.append(h("b", { text: t("ai.title") }), h("small", { text: t(state.cartoonEnabled ? "ai.hint" : "ai.disabled") }), aiBtn);
  if (cartoon) {
    aiBox.append(
      h("div", { class: "ai-compare" }, h("img", { attrs: { src: d().files[p.image], alt: "" } }), h("span", { text: "→" }), h("img", { attrs: { src: cartoon, alt: "" } })),
      toggle("ai.use", p.useCartoon, async (v) => {
        p.useCartoon = v;
        p.palette = [];
        await retraceAndRender();
      }),
    );
  }
  add(card, aiBox);

  add(card,
    toggle("picture.removeBg", p.removeBackground, async (v) => {
      p.removeBackground = v;
      await retraceAndRender();
    }, "picture.removeBgHint"),
    toggle("picture.holes", p.punchHoles, async (v) => {
      p.punchHoles = v;
      await retraceAndRender();
    }, "picture.holesHint"),
  );
  if (p.removeBackground) add(card, slider("picture.strength", p.bgStrength, 0, 100, 1, "", debounce(async (v) => {
    p.bgStrength = v;
    await retraceAndRender(false);
  })));

  add(card,
    field(
      t("picture.colours"),
      segmented(
        [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) })),
        String(p.colors),
        async (v) => {
          p.colors = Number(v);
          p.palette = [];
          await retraceAndRender();
        },
      ),
      t("picture.coloursHint"),
    ),
  );

  // Filament per traced colour (one colour: the whole picture).
  const traced = state.traced[p.image] as (typeof state.traced)[string] & { colours?: string[] };
  const from = traced?.layers.length ? traced.layers.map((l) => l.color) : (traced?.colours ?? []);
  from.forEach((c, i) => {
    add(card,
      field(
        `${t("picture.colourN")} ${i + 1}`,
        h(
          "div",
          { class: "pal-row" },
          h("span", { class: "from", style: `--c:${c}`, title: t("picture.fromImage") }),
          swatches(swatchList(), p.palette[i] ?? c, (hex) => {
            p.palette[i] = hex;
            rerender();
          }),
        ),
      ),
    );
  });
  add(card,
    slider("picture.width", p.width, 15, 100, 1, "mm", (v) => {
      p.width = v;
      changed();
    }),
  );
  return card;
}

/* ---------- Name ---------- */

const SCRIPT_LABEL: Record<string, StringKey> = { latin: "font.latin", thai: "font.thai", korean: "font.korean", chinese: "font.chinese" };

function fontPicker(): HTMLElement {
  const sel = h("select", { class: "select" });
  for (const script of ["latin", "thai", "korean", "chinese"]) {
    const group = h("optgroup", { attrs: { label: t(SCRIPT_LABEL[script]) } });
    for (const f of fonts.filter((x) => x.script === script)) {
      const o = h("option", { attrs: { value: f.name, selected: f.name === d().font } }, f.label);
      o.style.fontFamily = `"ts-${f.name}"`;
      group.append(o);
    }
    sel.append(group);
  }
  sel.addEventListener("change", () => {
    d().font = sel.value;
    rerender();
  });
  return field(t("font.label"), sel, t("font.hint"));
}

function previewPicker(): HTMLElement | null {
  const names = tagNames(d());
  if (names.length < 2) return null;
  const sel = h("select", { class: "select" });
  names.forEach((n, i) => sel.append(h("option", { attrs: { value: String(i), selected: i === state.preview } }, `${i + 1}. ${n}`)));
  sel.addEventListener("change", () => {
    state.preview = Number(sel.value);
    changed();
  });
  return field(`${t("names.preview")} (${names.length} ${t("names.count")})`, sel);
}

export function nameCard(): HTMLElement {
  const names = h("textarea", { class: "text names", attrs: { rows: Math.min(8, Math.max(2, d().names.length + 1)), spellcheck: false } });
  names.value = d().names.join("\n");
  names.addEventListener("input", () => {
    d().names = names.value.split("\n");
    state.preview = Math.min(state.preview, tagNames(d()).length - 1);
    changed();
  });
  // The preview picker lists the names, so refresh it once typing is done.
  names.addEventListener("change", () => rerender());
  return section(
    "card.name",
    field(t("names.label"), names, t("names.hint")),
    previewPicker(),
    fontPicker(),
    slider("name.size", d().textSize, 4, 40, 0.5, "mm", (v) => {
      d().textSize = v;
      changed();
    }),
    slider("name.weight", d().weight, 0.6, 1.6, 0.05, "", (v) => {
      d().weight = v;
      changed();
    }),
    slider("name.spacing", d().spacing, 0.7, 1.5, 0.05, "", (v) => {
      d().spacing = v;
      changed();
    }),
    d().picture.image
      ? field(
          t("name.position"),
          segmented(
            (["below", "above", "left", "right"] as NamePosition[]).map((v) => ({ value: v, label: t(`pos.${v}`) })),
            d().position,
            (v) => {
              d().position = v;
              changed();
            },
          ),
        )
      : null,
    d().picture.image
      ? slider("name.gap", d().gap, 0, 15, 0.5, "mm", (v) => {
          d().gap = v;
          changed();
        })
      : null,
  );
}

/* ---------- Plate ---------- */

export function plateCard(): HTMLElement {
  const pl = d().plate;
  return section(
    "card.plate",
    slider("plate.thickness", pl.thickness, 1, 8, 0.2, "mm", (v) => {
      pl.thickness = v;
      changed();
    }),
    slider("plate.relief", pl.relief, 0.4, 5, 0.2, "mm", (v) => {
      pl.relief = v;
      changed();
    }),
    slider("plate.border", pl.border, 1, 8, 0.25, "mm", (v) => {
      pl.border = v;
      changed();
    }),
    toggle("plate.fillHoles", pl.fillHoles, (v) => {
      pl.fillHoles = v;
      changed();
    }, "plate.fillHolesHint"),
  );
}

/* ---------- Rings ---------- */

export function ringsCard(): HTMLElement {
  const r = d().rings;
  const card = section(
    "card.rings",
    field(
      t("rings.count"),
      segmented(
        [
          { value: "0", label: t("rings.none") },
          { value: "1", label: "1" },
          { value: "2", label: "2" },
        ],
        String(r.count),
        (v) => {
          r.count = Number(v) as TagDesign["rings"]["count"];
          rerender();
        },
      ),
      t("rings.hint"),
    ),
  );
  if (!r.count) return card;
  return add(card,
    slider("rings.width", r.width, 0.8, 5, 0.1, "mm", (v) => {
      r.width = v;
      changed();
    }),
    swatchField("rings.inner", r.colors[0], (hex) => (r.colors[0] = hex)),
    r.count === 2 ? swatchField("rings.outer", r.colors[1], (hex) => (r.colors[1] = hex)) : null,
  );
}

/* ---------- Colours ---------- */

/** The filament colours a Design uses, plate first. */
export function designColours(x: TagDesign): string[] {
  const out = [x.colours.plate];
  if (tagNames(x).some(Boolean)) out.push(x.colours.name);
  if (x.picture.image) out.push(...x.picture.palette.slice(0, Math.max(1, x.picture.colors)));
  out.push(...x.rings.colors.slice(0, x.rings.count));
  return [...new Set(out.map((c) => c.toUpperCase()))];
}

export function colourCard(): HTMLElement {
  const pairs = h("div", { class: "pairs" });
  PAIRS.forEach(([a, b]) => {
    const btn = h("button", { class: "pair", title: `${filamentName(b, state.lang)} · ${filamentName(a, state.lang)}`, style: `--a:${b};--b:${a}`, attrs: { type: "button" } });
    btn.addEventListener("click", () => {
      d().colours.plate = b;
      d().colours.name = a;
      rerender();
    });
    pairs.append(btn);
  });
  const used = designColours(d());
  return section(
    "card.colours",
    field(t("colour.pairs"), pairs, t("colour.pairsHint")),
    swatchField("colour.plate", d().colours.plate, (hex) => (d().colours.plate = hex)),
    swatchField("colour.name", d().colours.name, (hex) => (d().colours.name = hex)),
    h(
      "div",
      { class: used.length > 4 ? "used warn" : "used" },
      h("span", { text: `${t("colour.used")} ${used.length}` }),
      ...used.map((c) => h("span", { class: "dot", style: `--c:${c}`, title: filamentName(c, state.lang) })),
      used.length > 4 ? h("small", { text: t("colour.over4") }) : null,
    ),
  );
}

/* ---------- Keyring ---------- */

export function loopCard(): HTMLElement {
  const l = d().loop;
  const card = section(
    "card.loop",
    field(
      t("loop.side"),
      segmented(
        (["top", "left", "right", "none"] as LoopSide[]).map((v) => ({ value: v, label: t(`loop.${v}`) })),
        l.side,
        (v) => {
          l.side = v;
          rerender();
        },
      ),
    ),
  );
  if (l.side === "none") return card;
  return add(card,
    slider("loop.offset", l.offset, -40, 40, 0.5, "mm", (v) => {
      l.offset = v;
      changed();
    }),
    slider("loop.hole", l.hole, 2, 10, 0.5, "mm", (v) => {
      l.hole = v;
      changed();
    }),
    slider("loop.wall", l.wall, 1.5, 6, 0.5, "mm", (v) => {
      l.wall = v;
      changed();
    }),
  );
}
