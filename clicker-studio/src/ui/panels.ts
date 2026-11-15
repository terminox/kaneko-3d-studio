// The side panels. Each control edits state.design, then calls changed()
// (geometry only) or rerender() (panels change shape too).
import { newSplit, type CapShape, type Decoration, type End, type Design, type Key, type Kind, type LayerHeights, type Layout, type Loop, type ModelOptions, type PartsMode, type SplitOptions, type Texture } from "../design/types.ts";
import { DEFAULT_FIT, type Fit } from "../geometry/switch.ts";
import type { SplitInfo } from "../geometry/split.ts";
import { layoutKeyCount } from "../geometry/layout.ts";
import { SYMBOLS } from "../geometry/symbols.ts";
import { FILAMENTS, PAIRS, filamentName } from "../design/palette.ts";
import { CURRENCY, price, priceLines, designColours } from "../design/price.ts";
import { orderTotal } from "../design/order.ts";
import { t, type StringKey } from "../i18n/strings.ts";
import { button, field, h, pickFile, readDataUrl, section, segmented, slider, swatches, toggle } from "./dom.ts";
import { changed, rerender, selectedPatches, selectionChanged, state, switchKind } from "./state.ts";
import { cartoonize, cropDialog, loadImage, retracePicture, retraceKeyImages } from "./picture-ui.ts";
import { MAX_HEIGHT, TALL, colourHeight, emptyHeights, flatten, makeItPop, remapHeights, resetPatches, setColourHeight, setPatchHeights } from "../design/heights.ts";
import { orderActions } from "./order-ui.ts";
import { SIDES, pinSide } from "../design/connectors.ts";

const adv = () => state.mode === "advanced";

function add(el: HTMLElement, ...children: (Node | null | false | undefined)[]) {
  for (const c of children) if (c) el.append(c);
}
const d = () => state.design;
const swatchList = () => FILAMENTS.map((f) => ({ hex: f.hex, name: f[state.lang] }));

export type FontInfo = { name: string; label: string; script: string };
let fonts: FontInfo[] = [];
let icons: string[] | null = null;

export async function loadCatalogs() {
  try {
    fonts = (await (await fetch("fonts/fonts.json")).json()) as FontInfo[];
  } catch {
    fonts = [{ name: "Fredoka-700", label: "Fredoka Bold", script: "latin" }];
  }
}

async function iconNames(): Promise<string[]> {
  if (!icons) {
    try {
      icons = (await (await fetch("icons/icons.json")).json()) as string[];
    } catch {
      icons = [];
    }
  }
  return icons;
}

/* ---------- Kind ---------- */

const KINDS: { kind: Kind; icon: string; label: StringKey }[] = [
  { kind: "cap", icon: "🔘", label: "kind.cap" },
  { kind: "row", icon: "🔤", label: "kind.row" },
  { kind: "grid", icon: "▦", label: "kind.grid" },
  { kind: "picture", icon: "🖼", label: "kind.picture" },
  { kind: "fluted", icon: "🧁", label: "kind.fluted" },
  { kind: "model", icon: "🗿", label: "kind.model" },
  { kind: "split", icon: "🥚", label: "kind.split" },
];

export function kindCard(): HTMLElement {
  const grid = h("div", { class: "kinds" });
  for (const k of KINDS) {
    const b = h("button", { class: d().kind === k.kind ? "kind on" : "kind", attrs: { type: "button" } }, h("span", { class: "kind-ico", text: k.icon }), h("span", { text: t(k.label) }));
    b.addEventListener("click", async () => {
      if (d().kind === k.kind) return;
      switchKind(k.kind);
      rerender();
    });
    grid.append(b);
  }
  const keycapKind = ["cap", "row", "grid"].includes(d().kind);
  const parts: { value: PartsMode; label: string }[] = [
    { value: "cap+base", label: t("parts.both") },
    { value: "caps", label: t("parts.caps") },
    ...(keycapKind ? [{ value: "az-set" as PartsMode, label: t("parts.az") }] : []),
    { value: "base", label: t("parts.base") },
  ];
  return section(
    "card.kind",
    grid,
    h("p", { class: "muted", text: t(`kind.${d().kind}.hint` as StringKey) }),
    d().kind !== "split" && (adv() || d().parts !== "cap+base")
      ? field(
          t("parts.label"),
          segmented(parts, d().parts, (v) => {
            d().parts = v;
            rerender();
          }),
        )
      : null,
  );
}

/* ---------- Content per kind ---------- */

export function contentCard(): HTMLElement | null {
  switch (d().kind) {
    case "cap":
      return section("card.top", keyEditor(0));
    case "row":
    case "fluted":
      return section("card.letters", lettersInput(), keyChips(), keyEditor(state.selectedKey));
    case "grid":
      return section("card.layout", layoutPicker(), keyChips(), keyEditor(state.selectedKey));
    case "picture":
      return pictureCard();
    case "model":
      return modelCard();
    case "split":
      return splitCard();
  }
}

function fontOf(k: Key) {
  return k.deco.type === "text" ? k.deco.font : "Fredoka-700";
}

function lettersInput(): HTMLElement {
  const text = d().keys.map((k) => (k.deco.type === "text" ? k.deco.text : k.deco.type === "emoji" ? k.deco.emoji : "•")).join("");
  const input = h("input", { class: "text big", attrs: { type: "text", value: text, maxlength: 40, spellcheck: false } });
  input.addEventListener("input", () => {
    // One key per character (grapheme), up to 10; keeps each position's style.
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const chars = [...seg.segment(input.value.replace(/\s+/g, ""))].map((s) => s.segment).slice(0, 10);
    const keys = d().keys;
    const proto = keys[keys.length - 1] ?? keys[0];
    d().keys = (chars.length ? chars : ["A"]).map((ch, i) => {
      const k = keys[i] ?? { ...proto };
      const emoji = /\p{Extended_Pictographic}/u.test(ch);
      return { ...k, deco: emoji ? { type: "emoji", emoji: ch } : { type: "text", text: ch, font: fontOf(k) } } as Key;
    });
    state.selectedKey = Math.min(state.selectedKey, d().keys.length - 1);
    changed();
    refreshChips();
  });
  input.addEventListener("change", () => rerender());
  return field(t("letters.label"), input, t("letters.hint"));
}

let chipHost: HTMLElement | null = null;
function keyChips(): HTMLElement {
  chipHost = h("div", { class: "chips" });
  refreshChips();
  return field(t("keys.pick"), chipHost);
}

function refreshChips() {
  if (!chipHost) return;
  chipHost.replaceChildren();
  d().keys.forEach((k, i) => {
    const glyph: Record<string, string> = { star: "★", sparkle: "✦", heart: "♥", flower: "✿", up: "⬆", down: "⬇", left: "⬅", right: "➡" };
    const label: Node | string =
      k.deco.type === "text"
        ? k.deco.text
        : k.deco.type === "emoji"
          ? k.deco.emoji
          : k.deco.type === "icon"
            ? k.deco.icon.startsWith("symbol:")
              ? glyph[k.deco.icon.slice(7)] ?? "★"
              : h("img", { class: "chip-icon", attrs: { src: `icons/${k.deco.icon}.svg`, alt: k.deco.icon } })
            : k.deco.type === "image"
              ? "🖼"
              : "·";
    const b = h("button", { class: i === state.selectedKey ? "chip on" : "chip", style: `--cap:${k.capColor};--deco:${k.decoColor}`, attrs: { type: "button" } }, label);
    b.addEventListener("click", () => {
      state.selectedKey = i;
      rerender();
    });
    chipHost!.append(b);
  });
}

const LAYOUTS: { value: Layout; label: StringKey; icon: string }[] = [
  { value: "row", label: "layout.row", icon: "▬" },
  { value: "column", label: "layout.column", icon: "▮" },
  { value: "grid", label: "layout.grid", icon: "▦" },
  { value: "wasd", label: "layout.wasd", icon: "⌨" },
  { value: "arrows", label: "layout.arrows", icon: "✥" },
  { value: "t", label: "layout.t", icon: "┳" },
  { value: "custom", label: "layout.custom", icon: "✎" },
];

function layoutPicker(): HTMLElement {
  const wrap = h("div");
  wrap.append(
    segmented(
      LAYOUTS.map((l) => ({ value: l.value, label: t(l.label), icon: l.icon })),
      d().layout,
      (v) => {
        d().layout = v;
        const fixed = layoutKeyCount(v);
        if (fixed) setKeyCount(fixed);
        if (v === "wasd") setLabels(["W", "A", "S", "D"]);
        if (v === "arrows") setIcons(["symbol:up", "symbol:left", "symbol:down", "symbol:right"]);
        rerender();
      },
      "wrap",
    ),
  );
  if (!layoutKeyCount(d().layout)) {
    wrap.append(
      slider("layout.count", d().keys.length, 1, 24, 1, "", (v) => {
        setKeyCount(v);
        changed();
        refreshChips();
      }),
    );
  }
  if (d().layout === "grid" || d().layout === "t") {
    wrap.append(
      slider("layout.columns", d().columns, 1, 6, 1, "", (v) => {
        d().columns = v;
        changed();
      }),
    );
  }
  if (d().layout === "custom") {
    const input = h("input", { class: "text", attrs: { type: "text", value: d().cells.map((c) => c.join(",")).join(" ; "), placeholder: "0,0 ; 1,0 ; 0,1" } });
    input.addEventListener("change", () => {
      d().cells = input.value
        .split(";")
        .map((p) => p.split(",").map(Number) as [number, number])
        .filter((c) => c.length === 2 && c.every(Number.isFinite));
      changed();
    });
    wrap.append(field(t("layout.cells"), input, t("layout.cellsHint")));
  }
  return wrap;
}

function setKeyCount(n: number) {
  const keys = d().keys;
  const last = keys[keys.length - 1];
  d().keys = Array.from({ length: n }, (_, i) => keys[i] ?? { ...last });
  state.selectedKey = Math.min(state.selectedKey, n - 1);
}

function setLabels(labels: string[]) {
  d().keys = d().keys.map((k, i) => ({ ...k, deco: { type: "text", text: labels[i] ?? "", font: fontOf(k) } }));
}

function setIcons(ids: string[]) {
  d().keys = d().keys.map((k, i) => ({ ...k, deco: { type: "icon", icon: ids[i] } }));
}

/* ---------- One key's Decoration and colours ---------- */

const DECO_TYPES: { value: Decoration["type"]; label: StringKey; icon: string }[] = [
  { value: "text", label: "deco.text", icon: "Aa" },
  { value: "emoji", label: "deco.emoji", icon: "😀" },
  { value: "icon", label: "deco.icon", icon: "✨" },
  { value: "image", label: "deco.image", icon: "🖼" },
  { value: "none", label: "deco.none", icon: "∅" },
];

function keyEditor(i: number): HTMLElement {
  const key = d().keys[i] ?? d().keys[0];
  const wrap = h("div", { class: "key-editor" });
  const deco = key.deco;
  const decoType = deco.type;
  wrap.append(
    segmented(
      DECO_TYPES.map((x) => ({ value: x.value, label: t(x.label), icon: x.icon })),
      decoType,
      (v) => {
        key.deco = defaultDeco(v, key);
        rerender();
      },
      "wrap small",
    ),
  );

  if (deco.type === "text") {
    if (d().kind === "cap") {
      const input = h("textarea", { class: "text", attrs: { rows: 2, spellcheck: false } });
      input.value = deco.text;
      input.addEventListener("input", () => {
        deco.text = input.value;
        changed();
      });
      wrap.append(field(t("deco.textLabel"), input, t("deco.textHint")));
    } else {
      const input = h("input", { class: "text", attrs: { type: "text", value: deco.text, maxlength: 4 } });
      input.addEventListener("input", () => {
        deco.text = input.value;
        changed();
        refreshChips();
      });
      wrap.append(field(t("deco.keyText"), input));
    }
    wrap.append(fontPicker(deco.font, (f) => {
      deco.font = f;
      changed();
    }));
  } else if (deco.type === "emoji") {
    const input = h("input", { class: "text big", attrs: { type: "text", value: deco.emoji } });
    input.addEventListener("input", () => {
      deco.emoji = input.value.trim();
      changed();
      refreshChips();
    });
    const quick = h("div", { class: "emoji-quick" });
    for (const e of ["😀", "🥰", "😺", "🐶", "🐻", "🐰", "🌸", "🍓", "⭐", "❤️", "🎮", "⚡"]) {
      quick.append(button(e, () => {
        deco.emoji = e;
        input.value = e;
        changed();
        refreshChips();
      }, "ghost emoji"));
    }
    wrap.append(field(t("deco.emojiLabel"), input, t("deco.emojiHint")), quick);
  } else if (deco.type === "icon") {
    wrap.append(iconPicker(deco.icon, (id) => {
      deco.icon = id;
      changed();
      refreshChips();
    }));
  } else if (deco.type === "image") {
    wrap.append(
      button(`📷 ${t(deco.image ? "deco.imageChange" : "deco.imageUpload")}`, async () => {
        const f = await pickFile("image/*");
        if (!f) return;
        const id = `img-${Date.now()}`;
        d().files[id] = await readDataUrl(f);
        deco.image = id;
        delete deco.heights;
        await retraceKeyImages();
        rerender();
      }, "primary block"),
      h("p", { class: "muted", text: t("deco.imageHint") }),
    );
  }

  if (deco.type !== "none") {
    wrap.append(
      slider("deco.scale", Math.round(key.decoScale * 100), 20, 100, 1, "%", (v) => {
        key.decoScale = v / 100;
        changed();
      }),
    );
  }

  // Colours of this key.
  wrap.append(
    field(t("colour.cap"), swatches(swatchList(), key.capColor, (hex) => {
      key.capColor = hex;
      changed();
      refreshChips();
    })),
  );
  if (deco.type !== "none" && deco.type !== "image") {
    wrap.append(
      field(t("colour.deco"), swatches(swatchList(), key.decoColor, (hex) => {
        key.decoColor = hex;
        changed();
        refreshChips();
      })),
    );
  }
  if (deco.type === "image") {
    const traced = state.traced[deco.image];
    if (traced?.layers.length)
      wrap.append(heightsBlock(i, () => (deco.heights ??= emptyHeights()), deco.heights, traced.layers.map((l) => l.color)));
  }
  if (d().kind === "fluted") {
    wrap.append(
      field(t("colour.keyBase"), swatches(swatchList(), key.baseColor ?? d().baseColor, (hex) => {
        key.baseColor = hex;
        changed();
      })),
    );
  }

  if (deco.type !== "none") {
    wrap.append(
      field(
        t("outline.label"),
        segmented(
          [
            { value: "0", label: t("outline.none") },
            { value: "1", label: t("outline.one") },
            { value: "2", label: t("outline.two") },
          ],
          String(key.outline),
          (v) => {
            key.outline = Number(v) as 0 | 1 | 2;
            rerender();
          },
        ),
        t("outline.hint"),
      ),
    );
    for (let r = 0; r < key.outline; r++) {
      wrap.append(
        field(t(r === 0 ? "outline.inner" : "outline.outer"), swatches(swatchList(), key.outlineColors[r], (hex) => {
          key.outlineColors[r] = hex;
          changed();
        })),
      );
    }
  }

  if (d().keys.length > 1) {
    wrap.append(
      h(
        "div",
        { class: "btn-row" },
        button(t("keys.applyAll"), () => {
          d().keys = d().keys.map((k) => ({ ...key, deco: k.deco.type === key.deco.type ? { ...k.deco, ...(key.deco.type === "text" && k.deco.type === "text" ? { font: key.deco.font } : {}) } as Decoration : k.deco }));
          rerender();
        }),
        button(`🎲 ${t("keys.random")}`, () => {
          const pairs = [...PAIRS].sort(() => Math.random() - 0.5);
          d().keys = d().keys.map((k, n) => ({ ...k, capColor: pairs[n % pairs.length][1], decoColor: pairs[n % pairs.length][0], baseColor: pairs[(n + 3) % pairs.length][0] }));
          rerender();
        }),
      ),
    );
  }
  return wrap;
}

function defaultDeco(type: Decoration["type"], key: Key): Decoration {
  switch (type) {
    case "text":
      return { type: "text", text: "A", font: fontOf(key) };
    case "emoji":
      return { type: "emoji", emoji: "😀" };
    case "icon":
      return { type: "icon", icon: "symbol:heart" };
    case "image":
      return { type: "image", image: "" };
    case "none":
      return { type: "none" };
  }
}

const SCRIPT_LABEL: Record<string, StringKey> = {
  latin: "font.latin",
  thai: "font.thai",
  korean: "font.korean",
  chinese: "font.chinese",
  emoji: "font.emoji",
};

function fontPicker(value: string, onPick: (name: string) => void): HTMLElement {
  const sel = h("select", { class: "select" });
  for (const script of ["latin", "thai", "korean", "chinese"]) {
    const group = h("optgroup", { attrs: { label: t(SCRIPT_LABEL[script]) } });
    for (const f of fonts.filter((x) => x.script === script)) {
      const o = h("option", { attrs: { value: f.name, selected: f.name === value } }, f.label);
      o.style.fontFamily = `"cs-${f.name}"`;
      group.append(o);
    }
    sel.append(group);
  }
  sel.addEventListener("change", () => onPick(sel.value));
  return field(t("font.label"), sel, t("font.hint"));
}

function iconPicker(value: string, onPick: (id: string) => void): HTMLElement {
  const wrap = h("div", { class: "icon-picker" });
  const symbols = h("div", { class: "emoji-quick" });
  const glyph: Record<string, string> = { star: "★", sparkle: "✦", heart: "♥", flower: "✿", up: "⬆", down: "⬇", left: "⬅", right: "➡" };
  for (const s of SYMBOLS) {
    const id = `symbol:${s}`;
    symbols.append(button(glyph[s], () => {
      for (const b of wrap.querySelectorAll("button.on")) b.classList.remove("on");
      onPick(id);
    }, id === value ? "ghost emoji on" : "ghost emoji", s));
  }
  const search = h("input", { class: "text", attrs: { type: "search", placeholder: t("icon.search") } });
  const results = h("div", { class: "icon-grid" });
  const show = async () => {
    const q = search.value.trim().toLowerCase();
    const names = (await iconNames()).filter((n) => !q || n.includes(q)).slice(0, 60);
    results.replaceChildren(
      ...names.map((n) => {
        const b = h("button", { class: `icon-btn${value === n ? " on" : ""}`, title: n, attrs: { type: "button" } }, h("img", { attrs: { src: `icons/${n}.svg`, alt: n, loading: "lazy" } }));
        b.addEventListener("click", () => {
          for (const x of results.children) x.classList.remove("on");
          b.classList.add("on");
          value = n;
          onPick(n);
        });
        return b;
      }),
    );
  };
  search.addEventListener("input", () => void show());
  void show();
  wrap.append(field(t("icon.symbols"), symbols), field(t("icon.library"), h("div", {}, search, results), t("icon.hint")));
  return wrap;
}

/* ---------- Picture ---------- */

function pictureCard(): HTMLElement {
  const p = d().picture!;
  const has = Boolean(p.image && d().files[p.image]);
  const card = section(
    "card.picture",
    button(`📷 ${t(has ? "picture.change" : "picture.upload")}`, async () => {
      const f = await pickFile("image/*");
      if (!f) return;
      const id = `pic-${Date.now()}`;
      d().files = Object.fromEntries(Object.entries(d().files).filter(([k]) => !k.startsWith("pic-")));
      d().files[id] = await readDataUrl(f);
      p.image = id;
      p.useCartoon = false;
      p.palette = [];
      delete p.heights;
      const r = await cropDialog(d().files[id], { x: 0, y: 0, w: 1, h: 1, rotate: 0 }, p.adjust);
      if (r) Object.assign(p, r);
      await retraceAndRender();
    }, "primary block big-btn"),
    h("p", { class: "muted", text: t("picture.hint") }),
  );
  if (!has) return card;

  add(card, 
    button(`✂️ ${t("picture.crop")}`, async () => {
      const r = await cropDialog(d().files[p.image], p.crop, p.adjust);
      if (!r) return;
      // Pins and paints move with the picture under the new crop.
      if (p.heights) {
        const img = await loadImage(d().files[p.image]);
        remapHeights(p.heights, p.crop, r.crop, img.naturalWidth, img.naturalHeight);
      }
      Object.assign(p, r);
      p.useCartoon = false;
      await retraceAndRender();
    }),
  );

  // AI cartoon.
  const cartoon = d().files[`${p.image}:cartoon`];
  const aiBox = h("div", { class: "ai-box" });
  const aiBtn = button(`✨ ${t(cartoon ? "ai.again" : "ai.make")}`, async () => {
    aiBtn.disabled = true;
    aiBtn.textContent = `⏳ ${t("ai.working")}`;
    try {
      await cartoonize();
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
        [1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) })),
        String(p.colors),
        async (v) => {
          p.colors = Number(v);
          p.palette = [];
          await retraceAndRender();
        },
      ),
      t("picture.coloursHint"),
    ),
    h(
      "div",
      { class: "btn-row" },
      button(`⚡ ${t("picture.quick")}`, async () => {
        p.colors = 2;
        p.palette = [];
        await retraceAndRender();
      }),
      button(`🖨 ${t("picture.four")}`, async () => {
        p.colors = 3; // + the cap colour = 4 filaments
        p.palette = [];
        await retraceAndRender();
      }),
      button(`🖨 ${t("picture.seven")}`, async () => {
        p.colors = 6;
        p.palette = [];
        await retraceAndRender();
      }),
    ),
  );

  // Filament per traced colour.
  const traced = state.traced[p.image];
  if (traced && p.colors > 1) {
    traced.layers.map((l) => l.color).forEach((c, i) => {
      add(card, 
        field(
          `${t("picture.colourN")} ${i + 1}`,
          h(
            "div",
            { class: "pal-row" },
            h("span", { class: "from", style: `--c:${c}`, title: t("picture.fromImage") }),
            swatches(swatchList(), p.palette[i] ?? c, (hex) => {
              p.palette[i] = hex;
              changed();
            }),
          ),
        ),
      );
    });
  }
  add(card, styleField());
  if (traced?.layers.length) add(card, heightsBlock(-1, () => (p.heights ??= emptyHeights()), p.heights, traced.layers.map((l, i) => p.palette[i] ?? l.color)));
  else if (d().cap.style === "raised") add(card, h("p", { class: "muted", text: t("heights.needColours") }));
  // The border is added around the picture, so the cap is the picture plus the border on each side.
  const capNote = h("p", { class: "muted" });
  const showCapWidth = () => (capNote.textContent = t("picture.capWidth").replace("{w}", String(Math.round((p.width + 2 * d().cap.border) * 10) / 10)));
  showCapWidth();
  add(card, 
    slider("picture.width", p.width, 24, 80, 1, "mm", (v) => {
      p.width = v;
      showCapWidth();
      changed();
    }),
    slider("picture.border", d().cap.border, 0, 3, 0.1, "mm", (v) => {
      d().cap.border = v;
      showCapWidth();
      changed();
    }),
    capNote,
    field(
      t("base.shape"),
      segmented(
        [
          { value: "follow", label: t("base.follow"), icon: "✂" },
          { value: "circle", label: t("base.circle"), icon: "●" },
          { value: "hexagon", label: t("base.hexagon"), icon: "⬢" },
        ],
        d().base.shape,
        (v) => {
          d().base.shape = v as Design["base"]["shape"];
          changed();
        },
      ),
    ),
  );
  return card;
}

/* ---------- Switches under a shared cap ---------- */

/** How many Switches the shared cap sits on, and (Advanced) a way to force the count. */
export function switchesCard(): HTMLElement | null {
  const k = d().kind;
  if (k !== "cap" && k !== "picture" && k !== "model" && k !== "split") return null;
  const n = state.build?.switchesPerCap ?? d().placedSwitches ?? 1;
  const note = h("p", { class: "muted", text: n === 1 ? t("switch.one") : t("switch.many").replace("{n}", String(n)) });
  if (!adv()) return h("section", { class: "card slim" }, note);
  const options = [{ value: "0", label: t("switch.auto") }, ...[1, 2, 3, 4].map((v) => ({ value: String(v), label: String(v) }))];
  return section(
    "card.switches",
    field(
      t("switch.count"),
      segmented(options, String(d().cap.switches), (v) => {
        d().cap.switches = Number(v) as Design["cap"]["switches"];
        changed();
      }),
      t("switch.hint"),
    ),
    note,
  );
}

/* ---------- Layer heights ---------- */

function styleField(): HTMLElement {
  return field(
    t("cap.style"),
    segmented(
      [
        { value: "raised", label: t("cap.raised") },
        { value: "inlay", label: t("cap.inlay") },
      ],
      d().cap.style,
      (v) => {
        d().cap.style = v as "raised" | "inlay";
        rerender();
      },
    ),
    t("cap.styleHint"),
  );
}

/** A dot in a colour, then a label. */
function dotLabel(text: string, color?: string): HTMLElement {
  return h("span", { class: "dot-label" }, color ? h("span", { class: "dot", style: `--c:${color}` }) : null, text);
}

/**
 * Heights for one picture's patches: one slider per traced colour, the picked
 * patches' own height, and Make it pop / Flatten. `owner` is -1 for the
 * picture, else the key index; `get` creates the heights on first edit.
 */
function heightsBlock(owner: number, get: () => LayerHeights, hs: LayerHeights | undefined, colours: string[]): HTMLElement {
  const wrap = h("div", { class: "heights" }, h("div", { class: "field-label" }, h("span", { text: t("heights.title") }), h("small", { text: t("heights.hint") })));
  if (d().cap.style !== "raised") {
    wrap.append(
      h("p", { class: "muted", text: t("heights.needRaised") }),
      button(`⬆ ${t("heights.useRaised")}`, () => {
        d().cap.style = "raised";
        rerender();
      }, "primary block"),
    );
    return wrap;
  }
  const def = Math.max(0.4, d().cap.decoHeight);
  // Buttons read the latest build when clicked; the panel may be older.
  const live = () => (state.build?.patches ?? []).filter((p) => p.owner === owner);
  const mine = () => selectedPatches().filter((p) => p.owner === owner);
  const patches = live();
  colours.forEach((c, i) => {
    wrap.append(
      slider(dotLabel(`${t("picture.colourN")} ${i + 1}`, c), colourHeight(hs, i, def), 0, MAX_HEIGHT, 0.2, "mm", (v) => {
        setColourHeight(get(), i, v);
        changed();
      }, TALL),
    );
    const own = patches.filter((p) => p.layer === i && p.own);
    if (own.length)
      wrap.append(
        h("div", { class: "own" }, h("span", { text: `${own.length} ${t("heights.own")}` }), button(`↺ ${t("heights.reset")}`, () => {
          resetPatches(get(), live().filter((p) => p.layer === i && p.own));
          rerender();
        }, "ghost small")),
      );
  });
  const sel = mine();
  if (sel.length) {
    wrap.append(
      h(
        "div",
        { class: "sel-box" },
        slider(dotLabel(`${t("heights.selected")}: ${sel.length}`, sel[0].color), sel[0].h, 0, MAX_HEIGHT, 0.2, "mm", (v) => {
          setPatchHeights(get(), mine(), v);
          changed();
        }, TALL),
        h(
          "div",
          { class: "btn-row" },
          button(`↺ ${t("heights.resetSel")}`, () => {
            resetPatches(get(), mine());
            rerender();
          }, "ghost small"),
          button(`✕ ${t("heights.deselect")}`, () => {
            state.selected = [];
            selectionChanged();
          }, "ghost small"),
        ),
      ),
    );
  } else wrap.append(h("p", { class: "muted", text: t("heights.pickHint") }));
  const pop = button(`✨ ${t("heights.pop")}`, () => {
    makeItPop(get(), live(), def);
    rerender();
  });
  pop.disabled = !patches.length;
  wrap.append(
    h(
      "div",
      { class: "btn-row" },
      pop,
      button(`▭ ${t("heights.flatten")}`, () => {
        flatten(get());
        rerender();
      }),
    ),
  );
  return wrap;
}

async function retraceAndRender(full = true) {
  state.status = t("status.tracing");
  await retracePicture();
  if (full) rerender();
  else changed();
}

function debounce<T>(fn: (v: T) => void, ms = 250): (v: T) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (v) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(v), ms);
  };
}

/* ---------- 3D model ---------- */

/** Uploads an STL/OBJ in place of the current one (ids keep the `model-` prefix the worker is sent), then `onNew` sets it up. */
function modelUpload(icon: string, onNew: (file: string, name: string) => void): HTMLElement {
  return button(`${icon} ${t(d().model ? "model.change" : "model.upload")}`, async () => {
    const f = await pickFile(".stl,.obj");
    if (!f) return;
    const id = `model-${Date.now()}`;
    d().files = Object.fromEntries(Object.entries(d().files).filter(([k]) => !k.startsWith("model-")));
    d().files[id] = await readDataUrl(f);
    onNew(id, f.name);
    rerender();
  }, "primary block big-btn");
}

function rotateField(m: ModelOptions): HTMLElement {
  return field(
    t("model.rotate"),
    h(
      "div",
      { class: "btn-row" },
      ...(["x", "y", "z"] as const).map((ax, i) =>
        button(`↻ ${ax.toUpperCase()} 90°`, () => {
          m.rotate[i] = (m.rotate[i] + 90) % 360;
          changed();
        }),
      ),
    ),
  );
}

function modelCard(): HTMLElement {
  const m = d().model;
  const card = section(
    "card.model",
    modelUpload("🗿", (file, name) => (d().model = { file, name, width: 36, cut: 0, rotate: [0, 0, 0] })),
    h("p", { class: "muted", text: t("model.hint") }),
  );
  if (!m) return card;
  add(card, 
    h("p", { text: `📄 ${m.name}` }),
    slider("model.width", m.width, 20, 80, 1, "mm", (v) => {
      m.width = v;
      changed();
    }),
    slider("model.cut", Math.round(m.cut * 100), 0, 80, 1, "%", (v) => {
      m.cut = v / 100;
      changed();
    }),
    rotateField(m),
    swatchField("colour.cap", d().keys[0].capColor, (hex) => (d().keys[0].capColor = hex)),
  );
  return card;
}

/* ---------- Split a model ---------- */

function splitCard(): HTMLElement {
  const m = d().model;
  const sp = (d().split ??= newSplit());
  const card = section(
    "card.split",
    modelUpload("🥚", (file, name) => {
      d().model = { file, name, width: 50, cut: 0, rotate: [0, 0, 0] };
      d().split = { ...newSplit(), style: sp.style };
      state.fitOnBuild = true;
    }),
    h("p", { class: "muted", text: t("split.hint") }),
  );
  if (!m) return card;
  const info = state.build?.split;
  add(card,
    h("p", { text: `📄 ${m.name}` }),
    rotateField(m),
    field(
      t("split.style"),
      segmented([{ value: "plug", label: t("split.plug") }, { value: "plain", label: t("split.plain") }], sp.style, (v) => {
        sp.style = v as SplitOptions["style"];
        changed();
      }),
      t("split.styleHint"),
    ),
    info ? seamField(sp, info) : null,
    slider("split.flat", Math.round(m.cut * 100), 0, 80, 1, "%", (v) => {
      m.cut = v / 100;
      changed();
    }),
    slider("split.size", m.width, 25, 150, 1, "mm", (v) => {
      m.width = v;
      changed();
    }),
    info ? fitNote(m, sp, info) : null,
    adv() ? nudgeField(sp) : null,
    adv()
      ? slider("split.wall", sp.wall, 1.2, 3, 0.1, "mm", (v) => {
          sp.wall = v;
          changed();
        })
      : null,
  );
  return card;
}

/** Seam height over the model's bottom, in mm (stored as a share of the height, so it follows the size). */
function seamField(sp: SplitOptions, info: SplitInfo): HTMLElement {
  const z = Math.round((info.seamZ - info.modelZ0) * 2) / 2;
  return h(
    "div",
    {},
    slider("split.seam", z, 1, Math.max(2, Math.floor(info.height) - 1), 0.5, "mm", (v) => {
      sp.at = v / info.height;
      changed();
    }),
    info.auto
      ? h("p", { class: "muted", text: t("split.auto") })
      : button(`🎯 ${t("split.best")}`, () => {
          sp.at = null;
          rerender();
        }),
  );
}

/** The smallest size that fits a switch, and a way to get there when the model has no room. */
function fitNote(m: ModelOptions, sp: SplitOptions, info: SplitInfo): HTMLElement {
  const text = info.minWidth === null ? t("split.fitsNone") : t("split.fits").replace("{n}", String(info.minWidth));
  const short = info.minWidth !== null && (info.minWidth > m.width || state.build?.warnings.includes("warn.splitNoRoom"));
  return h(
    "div",
    { class: "btn-row" },
    h("span", { class: "muted", text }),
    short
      ? button(`📏 ${t("split.makeFit")}`, () => {
          m.width = Math.min(150, Math.max(m.width, info.minWidth!));
          sp.at = null;
          rerender();
        })
      : null,
  );
}

function nudgeField(sp: SplitOptions): HTMLElement {
  const step = (dx: number, dy: number) => () => {
    sp.nudge = [Math.round((sp.nudge[0] + dx) * 2) / 2, Math.round((sp.nudge[1] + dy) * 2) / 2];
    rerender();
  };
  return field(
    t("split.nudge"),
    h(
      "div",
      { class: "btn-row" },
      button("←", step(-0.5, 0)),
      button("→", step(0.5, 0)),
      button("↑", step(0, 0.5)),
      button("↓", step(0, -0.5)),
      button(t("split.reset"), () => {
        sp.nudge = [0, 0];
        rerender();
      }),
    ),
    t("split.nudgeHint").replace("{x}", String(sp.nudge[0])).replace("{y}", String(sp.nudge[1])),
  );
}

function swatchField(label: StringKey, value: string, set: (hex: string) => void): HTMLElement {
  return field(t(label), swatches(swatchList(), value, (hex) => {
    set(hex);
    changed();
  }));
}

/* ---------- Colours ---------- */

export function colourCard(): HTMLElement {
  const pairs = h("div", { class: "pairs" });
  PAIRS.forEach(([a, b]) => {
    const btn = h("button", { class: "pair", title: `${filamentName(a, state.lang)} · ${filamentName(b, state.lang)}`, style: `--a:${a};--b:${b}`, attrs: { type: "button" } });
    btn.addEventListener("click", () => {
      d().baseColor = a;
      for (const k of d().keys) {
        k.capColor = b;
        k.decoColor = a;
        k.baseColor = a;
      }
      rerender();
    });
    pairs.append(btn);
  });
  const all = (fn: (k: Key, hex: string) => void) => (hex: string) => {
    for (const k of d().keys) fn(k, hex);
    rerender();
  };
  const multi = d().keys.length > 1;
  return section(
    "card.colours",
    field(t("colour.pairs"), pairs, t("colour.pairsHint")),
    d().kind !== "picture" && multi ? field(t("colour.allCaps"), swatches(swatchList(), d().keys[0].capColor, all((k, hex) => (k.capColor = hex)))) : null,
    d().kind === "picture" ? swatchField("colour.border", d().keys[0].capColor, (hex) => (d().keys[0].capColor = hex)) : null,
    d().kind === "split" ? swatchField("colour.topHalf", d().keys[0].capColor, (hex) => (d().keys[0].capColor = hex)) : null,
    d().kind !== "fluted" ? swatchField(d().kind === "split" ? "colour.bottomHalf" : "colour.base", d().baseColor, (hex) => (d().baseColor = hex)) : null,
    coloursSummary(),
  );
}

function coloursSummary(): HTMLElement {
  const used = designColours(d());
  return h(
    "div",
    { class: used.length > 4 ? "used warn" : "used" },
    h("span", { text: `${t("colour.used")} ${used.length}` }),
    ...used.map((c) => h("span", { class: "dot", style: `--c:${c}`, title: filamentName(c, state.lang) })),
    used.length > 4 ? h("small", { text: t("colour.over4") }) : null,
  );
}

/* ---------- Cap ---------- */

const SHAPES: { value: CapShape; icon: string; label: StringKey }[] = [
  { value: "square", icon: "▢", label: "shape.square" },
  { value: "capsule", icon: "⬭", label: "shape.capsule" },
  { value: "circle", icon: "●", label: "shape.circle" },
  { value: "heart", icon: "♥", label: "shape.heart" },
  { value: "cloud", icon: "☁", label: "shape.cloud" },
  { value: "bear", icon: "🐻", label: "shape.bear" },
  { value: "cat", icon: "🐱", label: "shape.cat" },
  { value: "flower", icon: "✿", label: "shape.flower" },
  { value: "hexagon", icon: "⬢", label: "shape.hexagon" },
  { value: "octagon", icon: "⯃", label: "shape.octagon" },
  { value: "keycap", icon: "⌨", label: "shape.keycap" },
];

export function capCard(): HTMLElement | null {
  if (d().kind === "split") return null;
  const c = d().cap;
  const showShape = !["picture", "model"].includes(d().kind);
  if (!showShape && !adv()) return null;
  const card = section("card.cap");
  if (showShape) {
    add(card, 
      field(
        t("shape.label"),
        segmented(
          SHAPES.map((s) => ({ value: s.value, label: t(s.label), icon: s.icon })),
          c.shape,
          (v) => {
            c.shape = v;
            changed();
          },
          "wrap shapes",
        ),
      ),
      slider("cap.size", c.size, 18, 40, 0.5, "mm", (v) => {
        c.size = v;
        changed();
      }),
    );
  }
  const isModel = d().kind === "model";
  // Pictures pick their style in the Picture card.
  if (!isModel && d().kind !== "picture") add(card, 
    field(
      t("cap.style"),
      segmented(
        [
          { value: "raised", label: t("cap.raised") },
          { value: "inlay", label: t("cap.inlay") },
        ],
        c.style,
        (v) => {
          c.style = v as "raised" | "inlay";
          changed();
        },
      ),
      t("cap.styleHint"),
    ),
  );
  if (adv()) {
    add(card, 
      slider("cap.height", c.height, 8.6, 16, 0.1, "mm", (v) => {
        c.height = v;
        changed();
      }),
      showShape
        ? slider("cap.corner", c.corner, 0, 8, 0.1, "mm", (v) => {
            c.corner = v;
            changed();
          })
        : null,
      slider("cap.topRound", c.topRound, 0, 3, 0.1, "mm", (v) => {
        c.topRound = v;
        changed();
      }),
      slider("cap.wall", c.wall, 0.8, 3, 0.1, "mm", (v) => {
        c.wall = v;
        changed();
      }),
      isModel
        ? null
        : slider("cap.decoHeight", c.decoHeight, 0.4, 2, 0.1, "mm", (v) => {
            c.decoHeight = v;
            changed();
          }),
      // Pictures and models have no outline rings (a picture's border is in the Picture card).
      showShape
        ? slider("cap.outlineWidth", c.outlineWidth, 0.6, 3, 0.1, "mm", (v) => {
            c.outlineWidth = v;
            changed();
          })
        : null,
    );
  }
  return card;
}

/* ---------- Base ---------- */

const TEXTURES: { value: Texture; icon: string; label: StringKey }[] = [
  { value: "none", icon: "▭", label: "texture.none" },
  { value: "ribs", icon: "▥", label: "texture.ribs" },
  { value: "sawtooth", icon: "⩘", label: "texture.sawtooth" },
  { value: "grooves", icon: "☰", label: "texture.grooves" },
  { value: "diamond", icon: "◇", label: "texture.diamond" },
  { value: "wave", icon: "〰", label: "texture.wave" },
  { value: "dots", icon: "⠿", label: "texture.dots" },
];

export function baseCard(): HTMLElement | null {
  if (d().parts === "caps" || d().parts === "az-set" || d().kind === "split") return null;
  const b = d().base;
  const card = section("card.base");
  if (adv()) {
    add(card, 
      slider("base.rim", b.rim, 1.6, 8, 0.1, "mm", (v) => {
        b.rim = v;
        changed();
      }),
      slider("base.rimRise", b.rimRise, 0, 5, 0.1, "mm", (v) => {
        b.rimRise = v;
        changed();
      }),
      slider("base.floor", b.floor, 1, 4, 0.1, "mm", (v) => {
        b.floor = v;
        changed();
      }),
      ["row", "grid", "fluted"].includes(d().kind)
        ? slider("base.gap", b.gap, 0.8, 6, 0.1, "mm", (v) => {
            b.gap = v;
            changed();
          })
        : null,
    );
    if (d().kind !== "picture")
      add(card, 
        field(
          t("base.shape"),
          segmented(
            [
              { value: "follow", label: t("base.follow"), icon: "✂" },
              { value: "circle", label: t("base.circle"), icon: "●" },
              { value: "hexagon", label: t("base.hexagon"), icon: "⬢" },
            ],
            b.shape,
            (v) => {
              b.shape = v as Design["base"]["shape"];
              changed();
            },
          ),
        ),
      );
  }
  add(card, 
    field(
      t("texture.label"),
      segmented(
        TEXTURES.map((x) => ({ value: x.value, label: t(x.label), icon: x.icon })),
        b.texture,
        (v) => {
          b.texture = v;
          rerender();
        },
        "wrap small",
      ),
    ),
  );
  if (adv() && b.texture !== "none")
    add(card, 
      slider("texture.depth", b.textureDepth, 0.3, 1.5, 0.1, "mm", (v) => {
        b.textureDepth = v;
        changed();
      }),
    );
  if (d().kind === "fluted")
    add(card,
      field(
        t("join.label"),
        segmented(
          (["rings", "connector"] as const).map((v) => ({ value: v, label: t(`join.${v}` as StringKey) })),
          b.join,
          (v) => {
            b.join = v;
            rerender();
          },
        ),
        b.join === "connector" ? t("join.hint") : undefined,
      ),
    );
  if (d().kind !== "fluted") {
    // H-connector: each side carries nothing, a tab or a socket.
    const pins = pinSide(b.connectors);
    const hasSocket = SIDES.some((side) => b.connectors[side] === "socket");
    const hasTab = SIDES.some((side) => b.connectors[side] === "tab");
    const notes = [
      hasTab ? t("connector.hint") : "",
      hasSocket ? (pins ? t("connector.pins").replace("{side}", t(`connector.${pins}` as StringKey)) : t("connector.noPins")) : "",
    ].filter(Boolean);
    const hint = notes.length ? notes.join(" ") : undefined;
    const rows = h("div", { class: "connector-sides" });
    for (const side of SIDES)
      rows.append(
        h("div", { class: "connector-side" },
          h("span", { text: t(`connector.${side}` as StringKey) }),
          segmented(
            (["none", "tab", "socket"] as End[]).map((v) => ({ value: v, label: v === "none" ? "—" : t(`connector.${v}` as StringKey) })),
            b.connectors[side],
            (v) => {
              b.connectors = { ...b.connectors, [side]: v };
              rerender();
            },
            "small",
          ),
        ),
      );
    add(card, field(t("connector.label"), rows, hint));
    add(card, 
      field(
        t("loop.label"),
        segmented(
          (["none", "left", "top", "right", "bottom", "both", "topBottom"] as Loop[]).map((v) => ({ value: v, label: t(`loop.${v}` as StringKey) })),
          b.loop,
          (v) => {
            b.loop = v;
            changed();
          },
          "wrap small",
        ),
      ),
    );
    if (adv())
      add(card, 
        slider("loop.hole", b.loopHole, 2, 6, 0.1, "mm", (v) => {
          b.loopHole = v;
          changed();
        }),
      );
  }
  add(card, 
    field(
      t("chain.label"),
      segmented(
        [
          { value: "ball", label: t("chain.ball") },
          { value: "cord", label: t("chain.cord") },
          { value: "none", label: t("chain.none") },
        ],
        d().chain,
        (v) => {
          d().chain = v as Design["chain"];
          rerender();
        },
      ),
      t("chain.hint"),
    ),
  );
  return card;
}

/* ---------- Fit ---------- */

const FIT_FIELDS: { key: keyof Fit; min: number; max: number; step: number }[] = [
  { key: "clearance", min: 0.3, max: 1.6, step: 0.05 },
  { key: "pocket", min: 13.6, max: 14.4, step: 0.02 },
  { key: "stemFit", min: -0.3, max: 0.3, step: 0.01 },
  { key: "plate", min: 1.2, max: 1.8, step: 0.05 },
  { key: "clipRoom", min: 15, max: 17, step: 0.1 },
  { key: "under", min: 6, max: 11, step: 0.1 },
  { key: "stemTop", min: 9, max: 14, step: 0.1 },
  { key: "travel", min: 3, max: 5, step: 0.1 },
  { key: "bottomGap", min: 0.2, max: 2, step: 0.1 },
  { key: "crossLength", min: 3.8, max: 4.4, step: 0.02 },
  { key: "crossWidth", min: 1.1, max: 1.6, step: 0.02 },
  { key: "socketDepth", min: 2.5, max: 4.5, step: 0.1 },
  { key: "boss", min: 5, max: 6.5, step: 0.1 },
  { key: "housingBottom", min: 14, max: 16.5, step: 0.1 },
  { key: "housingTop", min: 9, max: 14, step: 0.1 },
  { key: "housingHeight", min: 5, max: 8, step: 0.1 },
  { key: "reach", min: 15, max: 30, step: 0.5 },
  { key: "pitch", min: 16, max: 24, step: 0.05 },
  { key: "extraStemFit", min: 0, max: 0.3, step: 0.01 },
];

export function fitCard(): HTMLElement | null {
  if (!adv()) return null;
  const f = d().fit;
  const body = h("div");
  for (const x of FIT_FIELDS)
    body.append(
      slider(`fit.${x.key}` as StringKey, f[x.key], x.min, x.max, x.step, "mm", (v) => {
        f[x.key] = v;
        changed();
      }),
    );
  const det = h("details", { class: "card fit" }, h("summary", { text: t("card.fit") }), h("p", { class: "muted", text: t("fit.hint") }), body, button(t("fit.reset"), () => {
    d().fit = { ...DEFAULT_FIT };
    rerender();
  }));
  return det;
}

/* ---------- Price and Order ---------- */

const KIND_LABEL: Record<string, StringKey> = Object.fromEntries(KINDS.map((k) => [k.kind, k.label]));

export function orderCard(): HTMLElement {
  const total = price(d());
  const lines = priceLines(d());
  const qty = h("input", { class: "num", attrs: { type: "number", min: 1, max: 99, value: "1" } });
  const editing = state.editing !== null && state.order.items[state.editing];
  const card = section(
    "card.order",
    h(
      "div",
      { class: "price" },
      h("span", { class: "price-big", text: `${total} ${CURRENCY}` }),
      h("small", { text: lines.map((l) => `${l.label in KIND_LABEL ? t(KIND_LABEL[l.label]) : l.label} ${l.amount}`).join(" · ") }),
      h("small", { class: "muted", text: t("price.placeholder") }),
    ),
    h(
      "div",
      { class: "btn-row" },
      editing ? null : h("label", { class: "qty" }, t("order.qty"), qty),
      button(editing ? `✔ ${t("order.update")}` : `➕ ${t("order.add")}`, () => orderActions.addCurrent(Number(qty.value) || 1), "primary"),
    ),
  );
  add(card, orderList());
  return card;
}

function orderList(): HTMLElement {
  const o = state.order;
  const wrap = h("div", { class: "order" });
  const name = h("input", { class: "text", attrs: { type: "text", value: o.customer, placeholder: t("order.customer") } });
  name.addEventListener("change", () => {
    o.customer = name.value;
    rerender();
  });
  const note = h("textarea", { class: "text", attrs: { rows: 2, placeholder: t("order.note") } });
  note.value = o.note;
  note.addEventListener("change", () => {
    o.note = note.value;
    rerender();
  });
  wrap.append(h("h4", { text: `${t("order.title")} (${o.items.length})` }), name, note);
  o.items.forEach((it, i) => {
    const q = h("input", { class: "num", attrs: { type: "number", min: 1, max: 99, value: String(it.qty) } });
    q.addEventListener("change", () => {
      it.qty = Math.max(1, Number(q.value) || 1);
      rerender();
    });
    wrap.append(
      h(
        "div",
        { class: state.editing === i ? "order-item on" : "order-item" },
        it.thumb ? h("img", { attrs: { src: it.thumb, alt: "" } }) : h("span", { class: "thumb" }),
        h("div", { class: "oi-text" }, h("b", { text: it.design.name }), h("small", { text: `${t(`kind.${it.design.kind}` as StringKey)} · ${price(it.design)} ${CURRENCY}` })),
        q,
        button("✎", () => orderActions.edit(i), "ghost small", t("order.edit")),
        button("✕", () => orderActions.remove(i), "ghost small", t("order.remove")),
      ),
    );
  });
  if (o.items.length) {
    wrap.append(
      toggle("order.byColour", state.byColour, (v) => {
        state.byColour = v;
      }, "order.byColourHint"),
      h("div", { class: "order-total" }, h("span", { text: t("order.total") }), h("b", { text: `${orderTotal(o)} ${CURRENCY}` })),
      h(
        "div",
        { class: "btn-row" },
        button(`🧾 ${t("order.sheet")}`, () => orderActions.sheet()),
        button(`⬇ ${t("order.export")}`, () => orderActions.exportOrder("3mf"), "primary"),
        button(`⬇ ${t("order.exportStl")}`, () => orderActions.exportOrder("stl")),
      ),
    );
  }
  wrap.append(
    h(
      "div",
      { class: "btn-row" },
      button(`💾 ${t("order.save")}`, () => orderActions.save()),
      button(`📂 ${t("order.load")}`, () => orderActions.load()),
      o.items.length ? button(`🗑 ${t("order.clear")}`, () => orderActions.clear()) : null,
    ),
  );
  return wrap;
}

export function nameField(): HTMLElement {
  const input = h("input", { class: "text", attrs: { type: "text", value: d().name } });
  input.addEventListener("change", () => {
    d().name = input.value || "Clicker";
    rerender();
  });
  return field(t("design.name"), input);
}
