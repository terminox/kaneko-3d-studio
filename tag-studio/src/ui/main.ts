// Tag Studio: wires the form, the geometry worker and the preview.
import "./style.css";
import { newTagDesign, tagNames, upgradeTag, type TagDesign } from "../design/types.ts";
import { t, tr, setLang } from "../i18n/strings.ts";
import { button, download, h, pickFile, segmented } from "./dom.ts";
import { changed, rerender, selectedPatches, selectionChanged, state, subscribe } from "./state.ts";
import { emptyHeights, patchAt, resetPatchColours, samePt, setPatchColours } from "@cs/design/heights.ts";
import { FILAMENTS, filamentName } from "@cs/design/palette.ts";
import { renderColourBar } from "@cs/ui/colour-bar.ts";
import { Viewport } from "./viewport.ts";
import { crashedLastTime, onBuilt, requestBuild, requestExport } from "./engine.ts";
import { colourCard, designColours, designNameCard, loadFonts, loopCard, nameCard, pictureCard, plateCard, ringsCard, type FontInfo } from "./panels.ts";
import { cartoonAvailable, retracePicture } from "./picture-ui.ts";

const app = document.getElementById("app")!;
const left = h("aside", { class: "panel left" });
const host = h("div", { class: "viewport" });
const dims = h("div", { class: "dims" });
const status = h("div", { class: "status", attrs: { role: "status" } });
const notes = h("div", { class: "notes" });
const stageTools = h("div", { class: "stage-tools" });
const colourBarHost = h("div", { class: "colour-bar", attrs: { hidden: true } });
const stage = h("section", { class: "stage" }, host, h("div", { class: "stage-top" }, stageTools, dims), notes, status, h("div", { class: "stage-hint" }), colourBarHost);
const header = h("header", { class: "bar" });
app.append(header, h("main", { class: "layout" }, left, stage));

const viewport = new Viewport(host);
const dark = matchMedia("(prefers-color-scheme: dark)");
viewport.setTheme(dark.matches);
dark.addEventListener("change", () => viewport.setTheme(dark.matches));

const slug = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "name-tag";

const designActions = {
  fresh() {
    if (!confirm(t("design.newConfirm"))) return;
    state.design = newTagDesign();
    state.preview = 0;
    state.traced = {};
    state.selected = [];
    rerender();
  },
  save() {
    download(`${slug(state.design.name)}.tag.json`, JSON.stringify(state.design), "application/json");
  },
  async open() {
    const f = await pickFile(".json");
    if (!f) return;
    try {
      const d = JSON.parse(await f.text()) as TagDesign;
      if (!Array.isArray(d.names) || !d.picture) throw new Error("not a Tag Studio Design file");
      state.design = upgradeTag(d);
      state.preview = 0;
      await retracePicture();
      rerender();
    } catch (e) {
      alert(`${t("design.openFailed")}: ${e instanceof Error ? e.message : e}`);
    }
  },
  async export3mf() {
    state.status = t("status.exporting");
    paintStatus();
    try {
      const r = await requestExport(state.design, state.traced);
      download(`${slug(state.design.name)}.3mf`, r.data as BlobPart, "model/3mf");
      state.status = `${t("status.exported")}: ${r.tags} ${t("names.count")}, ${r.plates} ${t("status.plates")}, ${r.filaments.length} ${t("status.filaments")}`;
      state.error = r.warnings.map(tr).join(" · ");
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
      state.status = "";
    }
    paintStatus();
  },
};

function nodes(...xs: (Node | null | false | undefined)[]): Node[] {
  return xs.filter((x): x is Node => Boolean(x));
}

function renderHeader() {
  header.replaceChildren(...nodes(
    import.meta.env.VITE_HOME_URL ? h("a", { class: "home", text: `← ${t("home")}`, attrs: { href: import.meta.env.VITE_HOME_URL } }) : null,
    h("h1", {}, h("span", { class: "logo", text: "🏷" }), "Tag Studio"),
    h("span", { class: "spacer" }),
    button(`＋ ${t("design.new")}`, () => designActions.fresh()),
    button(`📂 ${t("design.open")}`, () => void designActions.open()),
    button(`💾 ${t("design.save")}`, () => designActions.save()),
    button(`⬇ ${t("design.export")}`, () => void designActions.export3mf(), "primary"),
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

function renderStageTools() {
  stageTools.replaceChildren(...nodes(
    tagNames(state.design).length > 1
      ? segmented(
          [
            { value: "tag", label: t("view.tag"), icon: "🏷" },
            { value: "plate", label: t("view.plate"), icon: "🧩" },
          ],
          state.view,
          (v) => {
            state.view = v as typeof state.view;
            renderStageTools();
            scheduleBuild();
          },
        )
      : null,
    button(`⤢ ${t("view.reset")}`, () => viewport.resetView()),
  ));
  stage.querySelector(".stage-hint")!.textContent = t(plateView() ? "view.plateHint" : "view.hint");
}

function renderPanels() {
  const keep = left.scrollTop;
  left.replaceChildren(designNameCard(), pictureCard(), nameCard(), colourCard(), ringsCard(), plateCard(), loopCard());
  left.scrollTop = keep;
}

function paintStatus() {
  status.textContent = state.status;
  status.hidden = !state.status;
  notes.replaceChildren(
    ...(state.build?.warnings ?? []).map((w) => h("div", { class: "note warn", text: `⚠ ${tr(w)}` })),
    state.error ? h("div", { class: "note error", text: `✕ ${state.error}` }) : "",
  );
}

const plateView = () => state.view === "plate" && tagNames(state.design).length > 1;

function showModel(frame = false) {
  const b = state.build;
  if (!b) return;
  viewport.show(b.parts, b.plateView, frame);
  const s = viewport.size();
  if (b.plateView) dims.textContent = `${tagNames(state.design).length} ${t("names.count")} · ${b.plates} ${t("status.plates")}`;
  else dims.textContent = s ? `${s.x.toFixed(0)} × ${s.y.toFixed(0)} × ${s.z.toFixed(1)} mm` : "";
}

/** Identifies a build's patches, which have their own height (not the heights themselves) and their colours. */
const patchKey = (b: typeof state.build) => (b?.patches ?? []).map((p) => `${p.at}${p.own ? "*" : ""}:${p.color}`).join("|");
/** True while a panel input has focus: re-rendering then would cut a drag short. */
const editing = () => document.activeElement instanceof HTMLInputElement && left.contains(document.activeElement);

/** A tap acts like Shift-click: tablets have no Shift key. Ends when nothing is picked. */
let pickSeveral = false;

function paintHighlight() {
  const sel = state.build && !state.build.plateView ? selectedPatches() : [];
  viewport.highlight(sel);
  if (!sel.length) pickSeveral = false;
  stage.classList.toggle("picking", sel.length > 0);
  const hs = () => (state.design.picture.heights ??= emptyHeights());
  renderColourBar(colourBarHost, sel.length
    ? {
        patches: sel,
        filaments: FILAMENTS.map((f) => ({ hex: f.hex, name: f[state.lang] })),
        colourName: (hex) => filamentName(hex, state.lang),
        several: pickSeveral,
        note: designColours(state.design).length > 4 ? t("colour.over4") : undefined,
        labels: { selected: t("heights.selected"), several: t("parts.several"), reset: t("parts.resetColour"), deselect: t("heights.deselect") },
        onColour: (hex) => {
          setPatchColours(hs(), selectedPatches(), hex);
          changed();
        },
        onSeveral: () => {
          pickSeveral = !pickSeveral;
          paintHighlight();
        },
        onReset: () => {
          resetPatchColours(hs(), selectedPatches());
          changed();
        },
        onDeselect: () => {
          state.selected = [];
          selectionChanged();
        },
      }
    : null);
}

// Click a picture patch to pick it; Shift-click (or Pick several) adds or removes; a click elsewhere clears.
viewport.onPick = (hit, shiftKey) => {
  const patches = state.build?.plateView ? [] : (state.build?.patches ?? []);
  if (!patches.length) return;
  const shift = shiftKey || pickSeveral;
  const p = hit ? patchAt(patches, hit) : null;
  if (!p) {
    if (shift || !state.selected.length) return;
    state.selected = [];
  } else {
    const on = state.selected.some((s) => samePt(s.at, p.at));
    if (!shift) state.selected = [{ owner: p.owner, at: p.at }];
    else state.selected = on ? state.selected.filter((s) => !samePt(s.at, p.at)) : [...state.selected, { owner: p.owner, at: p.at }];
  }
  selectionChanged();
};

let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleBuild() {
  clearTimeout(timer);
  state.status = t("status.building");
  paintStatus();
  const names = tagNames(state.design);
  const name = names[Math.min(state.preview, names.length - 1)];
  timer = setTimeout(() => requestBuild(state.design, state.traced, name, plateView()), 90);
}

onBuilt((r) => {
  if (r.type === "error") {
    state.error = r.message;
    state.status = "";
  } else {
    const first = !state.build;
    const before = patchKey(state.build);
    state.build = r;
    state.error = "";
    state.status = "";
    showModel(first);
    // Keep picks whose patch still exists (a retrace rebuilds them all). The
    // height tools list the patches: refresh them when the patches change,
    // unless a slider is mid-drag.
    const kept = r.plateView ? state.selected : state.selected.filter((s) => r.patches.some((p) => samePt(s.at, p.at)));
    if (kept.length !== state.selected.length || (patchKey(r) !== before && !editing())) {
      state.selected = kept;
      renderPanels();
    }
    paintHighlight();
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
  }
  renderStageTools();
  scheduleBuild();
});

async function fontFaces() {
  try {
    const list = (await (await fetch("fonts/fonts.json")).json()) as FontInfo[];
    const css = list.map((f) => `@font-face{font-family:"ts-${f.name}";src:url("fonts/${f.name}.ttf");font-display:swap}`).join("\n");
    document.head.append(h("style", { text: css }));
  } catch {
    // Without the manifest the picker still works, just without previews.
  }
}

async function start() {
  setLang(state.lang);
  await Promise.all([loadFonts(), fontFaces()]);
  state.cartoonEnabled = await cartoonAvailable();
  await retracePicture();
  if (crashedLastTime()) {
    // The saved Design killed the last page mid-build: show the form, but
    // don't run that build again until something changes.
    state.error = t("error.crashed");
    renderHeader();
    renderPanels();
    renderStageTools();
    paintStatus();
    return;
  }
  rerender();
}

void start();
if (import.meta.env.DEV) Object.assign(window, { __vp: viewport, __state: state });
