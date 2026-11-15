// Clicker Studio: wires the panels, the geometry worker and the preview.
import "./style.css";
import { newDesign, type Design } from "../design/types.ts";
import { t, tr, setLang } from "../i18n/strings.ts";
import { button, download, h, pickFile, segmented } from "./dom.ts";
import { changed, rerender, save, selectedPatches, selectionChanged, state, subscribe, upgrade } from "./state.ts";
import { Viewport } from "./viewport.ts";
import { onBuilt, requestBuild, requestExport } from "./engine.ts";
import { baseCard, capCard, colourCard, contentCard, fitCard, kindCard, loadCatalogs, nameField, orderCard, switchesCard, type FontInfo } from "./panels.ts";
import { cartoonAvailable, retraceAll } from "./picture-ui.ts";
import { setSnapshot } from "./order-ui.ts";
import { emptiedLayers, emptyHeights, patchAt, resetPatchColours, samePt, setPatchColours } from "../design/heights.ts";
import { FILAMENTS, filamentName } from "../design/palette.ts";
import { designColours } from "../design/price.ts";
import type { LayerHeights } from "../design/types.ts";
import { renderColourBar } from "./colour-bar.ts";

const app = document.getElementById("app")!;
const left = h("aside", { class: "panel left" });
const right = h("aside", { class: "panel right" });
const host = h("div", { class: "viewport" });
const dims = h("div", { class: "dims" });
const status = h("div", { class: "status", attrs: { role: "status" } });
const notes = h("div", { class: "notes" });
const stageTools = h("div", { class: "stage-tools" });
const colourBarHost = h("div", { class: "colour-bar", attrs: { hidden: true } });
const stage = h("section", { class: "stage" }, host, h("div", { class: "stage-top" }, stageTools, dims), notes, status, h("div", { class: "stage-hint" }), colourBarHost);
const header = h("header", { class: "bar" });
app.append(header, h("main", { class: "layout" }, left, stage, right));

const viewport = new Viewport(host);
setSnapshot(() => viewport.snapshot());
const dark = matchMedia("(prefers-color-scheme: dark)");
viewport.setTheme(dark.matches);
dark.addEventListener("change", () => viewport.setTheme(dark.matches));

const slug = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "clicker";

const designActions = {
  async fresh() {
    if (!confirm(t("design.newConfirm"))) return;
    state.design = newDesign(state.design.kind);
    state.editing = null;
    state.traced = {};
    state.selected = [];
    rerender();
  },
  save() {
    download(`${slug(state.design.name)}.clicker.json`, JSON.stringify(state.design), "application/json");
  },
  async open() {
    const f = await pickFile(".json");
    if (!f) return;
    try {
      const d = JSON.parse(await f.text()) as Design;
      if (!d.kind || !d.keys) throw new Error("not a Clicker Design file");
      state.design = upgrade(d);
      state.editing = null;
      state.traced = {};
      state.selected = [];
      await retraceAll();
      rerender();
    } catch (e) {
      alert(`${t("design.openFailed")}: ${e instanceof Error ? e.message : e}`);
    }
  },
  async exportAs(format: "3mf" | "stl") {
    state.status = t("status.exporting");
    paintStatus();
    try {
      const r = await requestExport(state.design.name, [{ design: state.design, qty: 1 }], state.traced, false, format);
      if (format === "stl") download(`${slug(state.design.name)}.zip`, r.data as BlobPart, "application/zip");
      else download(`${slug(state.design.name)}.3mf`, r.data as BlobPart, "model/3mf");
      state.status = format === "stl" ? `${t("status.exported")}: ${r.files} ${t("status.files")}` : `${t("status.exported")}: ${r.plates} ${t("status.plates")}, ${r.filaments.length} ${t("status.filaments")}`;
      state.error = r.warnings.join(" · ");
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
      state.status = "";
    }
    paintStatus();
  },
};

function renderHeader() {
  header.replaceChildren(...nodes(
    import.meta.env.VITE_HOME_URL ? h("a", { class: "home", text: `← ${t("home")}`, attrs: { href: import.meta.env.VITE_HOME_URL } }) : null,
    h("h1", {}, h("span", { class: "logo", text: "⌨" }), "Clicker Studio"),
    segmented(
      [
        { value: "simple", label: t("mode.simple"), icon: "✨" },
        { value: "advanced", label: t("mode.advanced"), icon: "🛠" },
      ],
      state.mode,
      (v) => {
        state.mode = v as typeof state.mode;
        rerender();
      },
      "mode",
    ),
    h("span", { class: "spacer" }),
    state.editing !== null ? h("span", { class: "editing", text: `✎ ${t("order.editing")} #${state.editing + 1}` }) : null,
    button(`＋ ${t("design.new")}`, () => designActions.fresh()),
    button(`📂 ${t("design.open")}`, () => designActions.open()),
    button(`💾 ${t("design.save")}`, () => designActions.save()),
    button(`⬇ ${t("design.export")}`, () => designActions.exportAs("3mf"), "primary"),
    button(`⬇ ${t("design.exportStl")}`, () => designActions.exportAs("stl")),
    segmented(
      [
        { value: "th", label: "TH" },
        { value: "en", label: "EN" },
      ],
      state.lang,
      (v) => {
        state.lang = v as typeof state.lang;
        setLang(state.lang);
        rerender();
      },
      "lang",
    ),
  ));
}

function nodes(...xs: (Node | null | false | undefined)[]): Node[] {
  return xs.filter((x): x is Node => Boolean(x));
}

function renderStageTools() {
  stageTools.replaceChildren(...nodes(
    segmented(
      [
        { value: "assembled", label: t("view.assembled"), icon: "🔗" },
        { value: "print", label: t("view.print"), icon: "🧩" },
      ],
      state.view,
      (v) => {
        state.view = v as typeof state.view;
        showModel();
        paintHighlight();
        renderStageTools();
      },
    ),
    state.view === "assembled"
      ? button(`🔩 ${t("view.switch")}`, () => {
          state.showSwitch = !state.showSwitch;
          viewport.showSwitch = state.showSwitch;
          showModel();
          renderStageTools();
        }, state.showSwitch ? "ghost on" : "ghost")
      : null,
    button(`✂ ${t("view.section")}`, () => {
      state.section = !state.section;
      viewport.section = state.section;
      showModel();
      renderStageTools();
    }, state.section ? "ghost on" : "ghost"),
    button(`⤢ ${t("view.reset")}`, () => viewport.resetView()),
  ));
  paintHint();
}

function paintHint() {
  const assembled = state.view !== "print";
  const pickable = assembled && Boolean(state.build?.patches.length);
  const seam = assembled && Boolean(state.build?.split);
  stage.querySelector(".stage-hint")!.textContent = `${t(assembled ? "view.hint" : "view.printHint")}${pickable ? ` · ${t("view.pickHint")}` : ""}${seam ? ` · ${t("view.seamHint")}` : ""}`;
}

function renderPanels() {
  const keepScroll = [left.scrollTop, right.scrollTop];
  left.replaceChildren(kindCard(), ...[contentCard(), colourCard()].filter((x): x is HTMLElement => Boolean(x)));
  right.replaceChildren(
    ...[nameFieldCard(), capCard(), baseCard(), switchesCard(), fitCard(), orderCard()].filter((x): x is HTMLElement => Boolean(x)),
  );
  [left.scrollTop, right.scrollTop] = keepScroll;
}

function nameFieldCard() {
  return h("section", { class: "card slim" }, nameField());
}

function paintStatus() {
  status.textContent = state.status;
  status.hidden = !state.status;
  const warn = [...(state.build?.warnings ?? [])];
  notes.replaceChildren(
    ...warn.map((w) => h("div", { class: "note warn", text: `⚠ ${tr(w)}` })),
    state.error ? h("div", { class: "note error", text: `✕ ${state.error}` }) : "",
  );
}

function showModel(frame = false) {
  const b = state.build;
  if (!b) return;
  const parts = state.view === "print" ? (b.plates[0]?.groups.flatMap((g) => g.parts).filter((p) => p.role !== "support") ?? []) : b.assembled;
  viewport.show({ parts, switches: b.switches, keyring: b.keyring, bottom: b.bottom, chain: state.design.chain, printLayout: state.view === "print" }, frame);
  const s = viewport.size();
  const plates = b.plates.length > 1 ? ` · ${b.plates.length} ${t("status.plates")}` : "";
  dims.textContent = s ? `${s.x.toFixed(0)} × ${s.y.toFixed(0)} × ${s.z.toFixed(1)} mm${plates}` : "";
}

/** Identifies a build's patches, which have their own height (not the heights themselves) and their colours. */
const patchKey = (b: typeof state.build) => (b?.patches ?? []).map((p) => `${p.owner}:${p.at}${p.own ? "*" : ""}:${p.color}`).join("|");
/** What the Split card shows from a build: the seam, the smallest size, and whether a switch fits. */
const splitKey = (b: typeof state.build) => (b?.split ? JSON.stringify([b.split, b.warnings.includes("warn.splitNoRoom")]) : "");
/** True while a panel input has focus: re-rendering then would cut a drag short. */
const editing = () => document.activeElement instanceof HTMLInputElement && left.contains(document.activeElement);

/** A tap acts like Shift-click: tablets have no Shift key. Ends when nothing is picked. */
let pickSeveral = false;

/** The settings a picked patch's edits go to. */
function heightsOf(owner: number): LayerHeights | null {
  const { picture, keys } = state.design;
  if (owner < 0) return picture ? (picture.heights ??= emptyHeights()) : null;
  const deco = keys[owner]?.deco;
  return deco?.type === "image" ? (deco.heights ??= emptyHeights()) : null;
}

function paintHighlight() {
  const sel = state.view === "assembled" ? selectedPatches() : [];
  viewport.highlight(sel);
  if (!sel.length) pickSeveral = false;
  stage.classList.toggle("picking", sel.length > 0);
  paintHint();
  const hs = () => heightsOf(sel[0].owner);
  renderColourBar(colourBarHost, sel.length
    ? {
        patches: sel,
        filaments: FILAMENTS.map((f) => ({ hex: f.hex, name: f[state.lang] })),
        colourName: (hex) => filamentName(hex, state.lang),
        several: pickSeveral,
        note: designColours(state.design).length > 4 ? t("colour.over4") : undefined,
        labels: { selected: t("heights.selected"), several: t("parts.several"), reset: t("parts.resetColour"), deselect: t("heights.deselect") },
        onColour: (hex) => {
          const to = hs();
          if (to) setPatchColours(to, selectedPatches(), hex);
          changed();
        },
        onSeveral: () => {
          pickSeveral = !pickSeveral;
          paintHighlight();
        },
        onReset: () => {
          const to = hs();
          if (to) resetPatchColours(to, selectedPatches());
          changed();
        },
        onDeselect: () => {
          state.selected = [];
          selectionChanged();
        },
      }
    : null);
}

/** Split a model: a tap on the model puts the seam at that height. The top half rests a gap higher, and a tap inside the gap changes nothing. */
function pickSeam(hit: [number, number, number] | null) {
  const s = state.build?.split, sp = state.design.split;
  if (state.view !== "assembled" || !hit || !s || !sp) return;
  const z = hit[2] <= s.seamZ ? hit[2] : hit[2] >= s.seamZ + s.gap ? hit[2] - s.gap : null;
  if (z === null) return;
  sp.at = Math.min(0.98, Math.max(0.02, (z - s.modelZ0) / s.height));
  rerender();
}

// Click a patch to pick it; Shift-click (or Pick several) adds or removes; a click elsewhere clears.
viewport.onPick = (hit, shiftKey) => {
  if (state.design.kind === "split") return pickSeam(hit);
  const patches = state.build?.patches ?? [];
  if (state.view !== "assembled" || !patches.length) return;
  const shift = shiftKey || pickSeveral;
  const p = hit ? patchAt(patches, hit) : null;
  if (!p) {
    if (shift || !state.selected.length) return;
    state.selected = [];
  } else {
    const on = state.selected.some((s) => s.owner === p.owner && samePt(s.at, p.at));
    const mine = state.selected.filter((s) => s.owner === p.owner);
    if (!shift) state.selected = [{ owner: p.owner, at: p.at }];
    else state.selected = on ? mine.filter((s) => !samePt(s.at, p.at)) : [...mine, { owner: p.owner, at: p.at }];
    if (p.owner >= 0) state.selectedKey = p.owner;
  }
  selectionChanged();
};

let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleBuild() {
  clearTimeout(timer);
  state.status = t("status.building");
  paintStatus();
  timer = setTimeout(() => requestBuild(state.design, state.traced), 90);
}

onBuilt((r) => {
  if (r.type === "error") {
    state.error = r.message;
    state.status = "";
  } else {
    const before = patchKey(state.build);
    const splitBefore = splitKey(state.build);
    state.build = r;
    state.error = "";
    state.status = "";
    showModel();
    // Keep picks whose patch still exists (a retrace rebuilds them all).
    const kept = state.selected.filter((s) => r.patches.some((p) => p.owner === s.owner && samePt(s.at, p.at)));
    // The Switch count is placed by the build; the price and order sheet read it from the Design.
    const switchesChanged = r.switchesPerCap !== state.design.placedSwitches;
    if (switchesChanged) {
      state.design.placedSwitches = r.switchesPerCap;
      save("design", state.design);
    }
    // Likewise which traced colours no longer use their filament.
    const picture = state.design.picture;
    const emptied = picture ? emptiedLayers(r.patches.filter((p) => p.owner < 0)) : [];
    const emptiedChanged = Boolean(picture) && emptied.join() !== (picture?.emptied ?? []).join();
    if (picture && emptiedChanged) {
      picture.emptied = emptied;
      save("design", state.design);
    }
    // The height tools list the patches and the Switch note shows the count:
    // refresh them when either changes, unless a slider is mid-drag.
    if (kept.length !== state.selected.length || ((patchKey(r) !== before || switchesChanged || emptiedChanged || splitKey(r) !== splitBefore) && !editing())) {
      state.selected = kept;
      renderPanels();
    }
    paintHighlight();
    // A just-uploaded model too small for a switch grows to the smallest size that fits, once.
    const m = state.design.model;
    if (state.fitOnBuild) {
      state.fitOnBuild = false;
      if (r.split?.minWidth && m && r.split.minWidth > m.width) {
        m.width = Math.min(150, r.split.minWidth);
        rerender();
      }
    }
  }
  paintStatus();
});

subscribe((what) => {
  if (what === "status") return paintStatus();
  if (what === "selection") {
    renderPanels();
    paintHighlight();
    return;
  }
  if (what === "panels") {
    renderHeader();
    renderPanels();
    renderStageTools();
  }
  scheduleBuild();
});

async function fontFaces() {
  try {
    const list = (await (await fetch("fonts/fonts.json")).json()) as FontInfo[];
    const css = list.map((f) => `@font-face{font-family:"cs-${f.name}";src:url("fonts/${f.name}.ttf");font-display:swap}`).join("\n");
    document.head.append(h("style", { text: css }));
  } catch {
    // Without the manifest the picker still works, just without previews.
  }
}

async function start() {
  setLang(state.lang);
  await Promise.all([loadCatalogs(), fontFaces()]);
  state.cartoonEnabled = await cartoonAvailable();
  await retraceAll();
  rerender();
  showModel(true);
}

void start();
void changed;
if (import.meta.env.DEV) Object.assign(window, { __vp: viewport, __state: state });
