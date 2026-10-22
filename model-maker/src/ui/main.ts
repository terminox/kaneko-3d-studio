// The model maker app: pick or open a .scad, tune its parameters, watch the
// preview, export a Bambu-ready 3MF.
import { BrowserRunner, Cancelled, type FontEntry } from "../openscad/browser-runner.ts";
import { parseParams, type ParamSchema, type ParamValues } from "../params/parse.ts";
import { findPlates, renderPreview, type Target } from "../pipeline/render.ts";
import { export3mf, exportStl } from "../export/project.ts";
import type { ProjectTemplate } from "../export/bambu3mf.ts";
import stockTemplate from "../../profiles/stock-a1-generic-pla.json";
import { renderPanel, type Upload } from "./panel.ts";
import { Viewport } from "./viewport.ts";

type Model = { title: string; source: string; files: Record<string, Uint8Array> };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Bundled models: models/<name>/<name>.scad plus any default.png|svg|stl next to it.
const modelSources = import.meta.glob("../../models/*/*.scad", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const modelAssets = import.meta.glob("../../models/*/default.*", { query: "?url", import: "default", eager: true }) as Record<string, string>;
// The owner's tuned profile when it has been built (bun run template --from …), else stock.
const tunedTemplate = Object.values(import.meta.glob("../../profiles/project-template.json", { eager: true, import: "default" }))[0];
const template = (tunedTemplate ?? stockTemplate) as ProjectTemplate;

const fonts: FontEntry[] = await (await fetch(`${import.meta.env.BASE_URL}fonts/fonts.json`)).json();
const preview = new BrowserRunner(fonts);
const exporter = new BrowserRunner(fonts);
const viewport = createViewport();
const dark = matchMedia("(prefers-color-scheme: dark)");
viewport?.setTheme(dark.matches);
dark.addEventListener("change", () => viewport?.setTheme(dark.matches));

// Without WebGL the form and exports still work; only the 3D view is missing.
function createViewport(): Viewport | null {
  try {
    return new Viewport($("viewport"));
  } catch {
    $("viewport").textContent = "3D preview unavailable: this browser couldn't start WebGL. Exports still work.";
    $("viewport").classList.add("no-webgl");
    return null;
  }
}

let model: Model;
let schema: ParamSchema = { groups: [] };
let values: ParamValues = {};
let uploads: Record<string, Upload> = {};
let target: Target = { kind: "model" };

const status = (text: string, kind: "" | "busy" | "error" | "warn" = "") => {
  const s = $("status");
  s.textContent = text;
  s.className = `status ${kind}`;
};
const log = (lines: string[]) => {
  $("console").textContent = lines.join("\n");
};

// ---- models ---------------------------------------------------------------

async function bundledModel(path: string): Promise<Model> {
  const dir = path.slice(0, path.lastIndexOf("/") + 1);
  const files: Record<string, Uint8Array> = {};
  for (const [asset, url] of Object.entries(modelAssets)) {
    if (asset.startsWith(dir)) files[asset.slice(dir.length)] = new Uint8Array(await (await fetch(url)).arrayBuffer());
  }
  return { title: path.split("/").pop()!.replace(/\.scad$/, ""), source: modelSources[path], files };
}

function storageKey() {
  return `model-maker:values:${model.title}`;
}

function loadModel(next: Model, keepValues?: ParamValues) {
  model = next;
  uploads = {};
  $("title").textContent = model.title;
  ($("code-text") as HTMLTextAreaElement).value = model.source;
  setSchema(parseParams(model.source), keepValues ?? remembered());
  setTargets();
  schedulePreview(true);
}

function remembered(): ParamValues {
  try {
    return JSON.parse(localStorage.getItem(storageKey()) ?? "{}");
  } catch {
    return {};
  }
}

function setSchema(next: ParamSchema, carry: ParamValues) {
  schema = next;
  values = {};
  for (const p of schema.groups.flatMap((g) => g.params)) {
    const v = carry[p.name];
    values[p.name] = v !== undefined && typeof v === typeof p.default && Array.isArray(v) === Array.isArray(p.default) ? v : p.default;
    if (p.type === "file" && String(values[p.name]).startsWith("uploads/") && !uploads[p.name]) values[p.name] = p.default;
  }
  renderPanel($("params"), schema, values, fonts, uploads, {
    change: () => {
      try {
        localStorage.setItem(storageKey(), JSON.stringify(values));
      } catch {
        // storage unavailable: values just aren't remembered
      }
      schedulePreview();
    },
    upload: (param, upload) => {
      if (upload) uploads[param] = upload;
      else delete uploads[param];
    },
  });
}

function setTargets() {
  const { plates, assembly } = findPlates(model.source);
  const select = $("target") as HTMLSelectElement;
  const options: [string, Target, string][] = [];
  if (assembly) options.push(["assembly", { kind: "assembly" }, "Assembly view"]);
  for (const p of plates) options.push([`plate${p}`, { kind: "plate", plate: p }, `Plate ${p}`]);
  if (!plates.length && !assembly) options.push(["model", { kind: "model" }, "Model"]);
  select.replaceChildren(...options.map(([value, , label]) => new Option(label, value)));
  select.hidden = options.length < 2;
  target = options[0][1];
  select.onchange = () => {
    target = options.find(([v]) => v === select.value)![1];
    schedulePreview(true);
  };
  ($("export-stl") as HTMLButtonElement).disabled = plates.length > 0;
  $("export-stl").title = plates.length ? "Multi-plate models export as 3MF only" : "Download an STL (all colours merged)";
}

function files(): Record<string, Uint8Array> {
  const out = { ...model.files };
  for (const u of Object.values(uploads)) out[u.path] = u.data;
  return out;
}

// ---- preview --------------------------------------------------------------

let timer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;

function schedulePreview(frame = false) {
  clearTimeout(timer);
  timer = setTimeout(() => void runPreview(frame), 350);
}

async function runPreview(frame: boolean) {
  const mine = ++generation;
  preview.cancel();
  status("Rendering…", "busy");
  const t0 = performance.now();
  try {
    const r = await renderPreview(preview, { source: model.source, values: { ...values }, files: files(), target });
    if (mine !== generation) return;
    log(r.log);
    if (r.error && !r.meshes.length) {
      status(r.error, "error");
      ($("console-box") as HTMLDetailsElement).open = true;
      return;
    }
    viewport?.show(r.meshes, frame);
    const size = viewport?.size();
    $("size").textContent = size ? `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm · ${r.meshes.length} colour${r.meshes.length === 1 ? "" : "s"}` : "";
    const tooBig = size && (size.x > 256 || size.y > 256);
    status(
      tooBig ? "Larger than the 256 mm bed" : r.error ?? `Rendered in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
      tooBig ? "warn" : r.error ? "warn" : "",
    );
  } catch (e) {
    if (e instanceof Cancelled || mine !== generation) return;
    status(String(e), "error");
  }
}

// ---- export ---------------------------------------------------------------

function download(data: Uint8Array, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function exportName(ext: string) {
  const label = Object.entries(values).find(([k, v]) => /name|text|label/i.test(k) && typeof v === "string" && v && !String(v).includes("."))?.[1];
  const slug = String(label ?? "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return `${model.title}${slug ? `-${slug}` : ""}.${ext}`;
}

async function withExport(button: HTMLButtonElement, work: () => Promise<void>) {
  const buttons = [$("export-3mf"), $("export-stl")] as HTMLButtonElement[];
  const wasDisabled = buttons.map((b) => b.disabled);
  buttons.forEach((b) => (b.disabled = true));
  const label = button.textContent;
  button.textContent = "Exporting…";
  try {
    await work();
  } catch (e) {
    status(`Export failed: ${e instanceof Error ? e.message : e}`, "error");
  } finally {
    buttons.forEach((b, i) => (b.disabled = wasDisabled[i]));
    button.textContent = label;
  }
}

$("export-3mf").onclick = () =>
  withExport($("export-3mf") as HTMLButtonElement, async () => {
    const t0 = performance.now();
    const r = await export3mf(exporter, { source: model.source, values: { ...values }, files: files(), title: model.title, template }, (m) => status(m, "busy"));
    log(r.log);
    download(r.data, exportName("3mf"), "model/3mf");
    const note = r.warnings.length ? ` · ${r.warnings.join(" · ")}` : "";
    status(`3MF ready in ${((performance.now() - t0) / 1000).toFixed(1)} s: ${r.filaments.length} filament${r.filaments.length === 1 ? "" : "s"} (${r.filaments.join(", ")})${note}`, r.warnings.length ? "warn" : "");
  });

$("export-stl").onclick = () =>
  withExport($("export-stl") as HTMLButtonElement, async () => {
    status("Building STL…", "busy");
    download(await exportStl(exporter, { source: model.source, values: { ...values }, files: files() }), exportName("stl"), "model/stl");
    status("STL ready");
  });

// ---- toolbar --------------------------------------------------------------

const modelSelect = $("model") as HTMLSelectElement;
for (const path of Object.keys(modelSources).sort()) modelSelect.append(new Option(path.split("/").pop()!.replace(/\.scad$/, ""), path));
modelSelect.onchange = async () => loadModel(await bundledModel(modelSelect.value));

$("open").onclick = () => $("open-file").click();
$("open-file").onchange = async () => {
  const file = ($("open-file") as HTMLInputElement).files?.[0];
  if (file) openFile(file);
};
async function openFile(file: File) {
  const custom = new Option(file.name.replace(/\.scad$/, ""), `file:${file.name}`);
  modelSelect.append(custom);
  modelSelect.value = custom.value;
  loadModel({ title: custom.text, source: await file.text(), files: {} });
}
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file?.name.endsWith(".scad")) openFile(file);
});

$("reset").onclick = () => {
  uploads = {};
  setSchema(schema, {});
  try {
    localStorage.removeItem(storageKey());
  } catch {
    // nothing remembered
  }
  schedulePreview();
};

// Code view: edit the source live; the form follows.
$("code").onclick = () => {
  const pane = $("code-pane");
  pane.hidden = !pane.hidden;
  $("code").setAttribute("aria-pressed", String(!pane.hidden));
};
let codeTimer: ReturnType<typeof setTimeout> | undefined;
$("code-text").oninput = () => {
  clearTimeout(codeTimer);
  codeTimer = setTimeout(() => {
    model = { ...model, source: ($("code-text") as HTMLTextAreaElement).value };
    setSchema(parseParams(model.source), values);
    setTargets();
    schedulePreview();
  }, 600);
};

// A saved design is the model, its values and its uploads: enough to reprint exactly.
type Design = { model: string; source: string; values: ParamValues; uploads: Record<string, { name: string; path: string; data: string }> };
const b64 = (d: Uint8Array) => btoa(Array.from(d, (c) => String.fromCharCode(c)).join(""));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

$("save-design").onclick = () => {
  const design: Design = {
    model: model.title,
    source: model.source,
    values,
    uploads: Object.fromEntries(Object.entries(uploads).map(([k, u]) => [k, { name: u.name, path: u.path, data: b64(u.data) }])),
  };
  download(new TextEncoder().encode(JSON.stringify(design, null, 2)), exportName("design.json"), "application/json");
};
$("load-design").onclick = () => $("load-design-file").click();
$("load-design-file").onchange = async () => {
  const file = ($("load-design-file") as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const d = JSON.parse(await file.text()) as Design;
    const bundled = Object.keys(modelSources).find((p) => p.endsWith(`/${d.model}.scad`));
    const base = bundled ? await bundledModel(bundled) : { title: d.model, source: d.source, files: {} };
    if (bundled) modelSelect.value = bundled;
    if (base.source !== d.source) status("This design was saved with a different version of the model", "warn");
    model = { ...base, source: d.source };
    loadModel(model, d.values);
    uploads = Object.fromEntries(Object.entries(d.uploads ?? {}).map(([k, u]) => [k, { name: u.name, path: u.path, data: unb64(u.data) }]));
    setSchema(schema, d.values);
    schedulePreview(true);
  } catch (e) {
    status(`Couldn't read that design: ${e}`, "error");
  }
};

// ---- start ----------------------------------------------------------------

const first = Object.keys(modelSources).sort().find((p) => p.includes("name-keychain")) ?? Object.keys(modelSources)[0];
modelSelect.value = first;
loadModel(await bundledModel(first));
