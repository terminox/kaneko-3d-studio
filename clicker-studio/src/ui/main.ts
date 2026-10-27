// Clicker Studio: wires the panels, the geometry worker and the preview.
import "./style.css";
import { newDesign, type Design } from "../design/types.ts";
import { t, tr, setLang } from "../i18n/strings.ts";
import { button, download, h, pickFile, segmented } from "./dom.ts";
import { changed, rerender, state, subscribe, upgrade } from "./state.ts";
import { Viewport } from "./viewport.ts";
import { onBuilt, requestBuild, requestExport } from "./engine.ts";
import { baseCard, capCard, colourCard, contentCard, fitCard, kindCard, loadCatalogs, nameField, orderCard, type FontInfo } from "./panels.ts";
import { cartoonAvailable, retraceAll } from "./picture-ui.ts";
import { setSnapshot } from "./order-ui.ts";

const app = document.getElementById("app")!;
const left = h("aside", { class: "panel left" });
const right = h("aside", { class: "panel right" });
const host = h("div", { class: "viewport" });
const dims = h("div", { class: "dims" });
const status = h("div", { class: "status", attrs: { role: "status" } });
const notes = h("div", { class: "notes" });
const stageTools = h("div", { class: "stage-tools" });
const stage = h("section", { class: "stage" }, host, h("div", { class: "stage-top" }, stageTools, dims), notes, status, h("div", { class: "stage-hint" }));
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
      await retraceAll();
      rerender();
    } catch (e) {
      alert(`${t("design.openFailed")}: ${e instanceof Error ? e.message : e}`);
    }
  },
  async export3mf() {
    state.status = t("status.exporting");
    paintStatus();
    try {
      const r = await requestExport(state.design.name, [{ design: state.design, qty: 1 }], state.traced);
      download(`${slug(state.design.name)}.3mf`, r.data as BlobPart, "model/3mf");
      state.status = `${t("status.exported")}: ${r.plates} ${t("status.plates")}, ${r.filaments.length} ${t("status.filaments")}`;
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
    button(`⬇ ${t("design.export")}`, () => designActions.export3mf(), "primary"),
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
  stage.querySelector(".stage-hint")!.textContent = t(state.view === "print" ? "view.printHint" : "view.hint");
}

function renderPanels() {
  const keepScroll = [left.scrollTop, right.scrollTop];
  left.replaceChildren(kindCard(), ...[contentCard(), colourCard()].filter((x): x is HTMLElement => Boolean(x)));
  right.replaceChildren(
    ...[nameFieldCard(), capCard(), baseCard(), fitCard(), orderCard()].filter((x): x is HTMLElement => Boolean(x)),
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
  const parts = state.view === "print" ? (b.plates[0]?.groups.flatMap((g) => g.parts) ?? []) : b.assembled;
  viewport.show({ parts, switches: b.switches, loops: b.loops, bottom: b.bottom, chain: state.design.chain, printLayout: state.view === "print" }, frame);
  const s = viewport.size();
  const plates = b.plates.length > 1 ? ` · ${b.plates.length} ${t("status.plates")}` : "";
  dims.textContent = s ? `${s.x.toFixed(0)} × ${s.y.toFixed(0)} × ${s.z.toFixed(1)} mm${plates}` : "";
}

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
    state.build = r;
    state.error = "";
    state.status = "";
    showModel();
  }
  paintStatus();
});

subscribe((what) => {
  if (what === "status") return paintStatus();
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
if (import.meta.env.DEV) (window as unknown as { __vp: Viewport }).__vp = viewport;
