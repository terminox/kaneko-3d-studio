// Order actions: add/edit/remove items, save/load, order sheet, export.
import type { Design } from "../design/types.ts";
import { newOrder, orderTotal, switchCount, type Order } from "../design/order.ts";
import { CURRENCY, designColours, price } from "../design/price.ts";
import { filamentName } from "../design/palette.ts";
import { t, type StringKey } from "../i18n/strings.ts";
import { download, pickFile } from "./dom.ts";
import { rerender, state, statusChanged, upgrade } from "./state.ts";
import { requestExport } from "./engine.ts";
import { retraceAll, traceDesign } from "./picture-ui.ts";

let snapshot: () => string = () => "";
export function setSnapshot(fn: () => string) {
  snapshot = fn;
}

const slug = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "order";

export const orderActions = {
  addCurrent(qty: number) {
    const design = JSON.parse(JSON.stringify(state.design)) as Design;
    if (design.name === "Clicker") design.name = autoName(design);
    const thumb = snapshot();
    if (state.editing !== null && state.order.items[state.editing]) {
      state.order.items[state.editing] = { ...state.order.items[state.editing], design, thumb };
      state.editing = null;
    } else state.order.items.push({ design, qty, thumb });
    rerender();
  },
  async edit(i: number) {
    state.design = upgrade(JSON.parse(JSON.stringify(state.order.items[i].design)));
    state.editing = i;
    state.selectedKey = 0;
    state.traced = {};
    await retraceAll();
    rerender();
  },
  remove(i: number) {
    state.order.items.splice(i, 1);
    if (state.editing === i) state.editing = null;
    rerender();
  },
  clear() {
    if (!confirm(t("order.clearConfirm"))) return;
    state.order = newOrder();
    state.editing = null;
    rerender();
  },
  save() {
    download(`${slug(state.order.customer)}.order.json`, JSON.stringify(state.order), "application/json");
  },
  async load() {
    const f = await pickFile(".json");
    if (!f) return;
    try {
      const o = JSON.parse(await f.text()) as Order;
      if (!Array.isArray(o.items)) throw new Error("not an order file");
      o.items = o.items.map((it) => ({ ...it, design: upgrade(it.design) }));
      state.order = o;
      state.editing = null;
      rerender();
    } catch (e) {
      alert(`${t("order.loadFailed")}: ${e instanceof Error ? e.message : e}`);
    }
  },
  async exportOrder() {
    const o = state.order;
    state.status = t("status.exporting");
    statusChanged();
    try {
      let traced = {};
      for (const it of o.items) traced = { ...traced, ...(await traceDesign(it.design)) };
      const r = await requestExport(o.customer || "Order", o.items.map((it) => ({ design: it.design, qty: it.qty })), traced, state.byColour);
      download(`${slug(o.customer)}.3mf`, r.data as BlobPart, "model/3mf");
      state.status = `${t("status.exported")}: ${r.plates} ${t("status.plates")}${r.warnings.length ? ` · ${r.warnings.join(" · ")}` : ""}`;
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
      state.status = "";
    }
    statusChanged();
  },
  sheet() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(orderSheetHtml(state.order));
    w.document.close();
  },
};

/** A readable name from the Design's text, e.g. "MAA" or "Picture 2". */
function autoName(d: Design): string {
  const text = d.keys.map((k) => (k.deco.type === "text" ? k.deco.text : k.deco.type === "emoji" ? k.deco.emoji : "")).join("");
  if (text.trim() && d.kind !== "picture" && d.kind !== "model") return text.slice(0, 24);
  return `${t(`kind.${d.kind}` as StringKey)} ${state.order.items.length + 1}`;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function describe(d: Design): string {
  const keys = d.keys
    .map((k) => (k.deco.type === "text" ? k.deco.text : k.deco.type === "emoji" ? k.deco.emoji : k.deco.type === "icon" ? k.deco.icon.replace("symbol:", "") : k.deco.type === "image" ? "🖼" : ""))
    .filter(Boolean);
  const bits = [t(`kind.${d.kind}` as StringKey)];
  if (d.parts !== "cap+base") bits.push(t(`parts.${d.parts === "caps" ? "caps" : d.parts === "base" ? "base" : "az"}` as StringKey));
  if (d.kind !== "picture" && d.kind !== "model") bits.push(`${t(`shape.${d.cap.shape}` as StringKey)} ${d.cap.size} mm`);
  if (d.kind === "picture" && d.picture) bits.push(`${d.picture.width} mm · ${d.picture.colors} ${t("sheet.colours")}${d.picture.useCartoon ? " · AI" : ""}`);
  if (keys.length && d.kind !== "picture") bits.push(`“${keys.join(" ")}”`);
  if (d.base.texture !== "none") bits.push(t(`texture.${d.base.texture}` as StringKey));
  if (d.chain !== "none") bits.push(t(`chain.${d.chain}` as StringKey));
  return bits.join(" · ");
}

export function orderSheetHtml(o: Order): string {
  const lang = state.lang;
  const rows = o.items
    .map((it, i) => {
      const colours = designColours(it.design)
        .map((c) => `<span class="c"><i style="background:${c}"></i>${esc(filamentName(c, lang))}</span>`)
        .join("");
      return `<tr><td>${i + 1}</td><td>${it.thumb ? `<img src="${it.thumb}">` : ""}</td><td><b>${esc(it.design.name)}</b><br><small>${esc(describe(it.design))}</small><div class="cs">${colours}</div></td><td class="n">${switchCount(it.design)}</td><td class="n">${it.qty}</td><td class="n">${price(it.design)}</td><td class="n">${price(it.design) * it.qty}</td></tr>`;
    })
    .join("");
  const switches = o.items.reduce((s, it) => s + switchCount(it.design) * it.qty, 0);
  const all = [...new Set(o.items.flatMap((it) => designColours(it.design)))];
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(t("sheet.title"))} · ${esc(o.customer)}</title>
<style>
body{font-family:-apple-system,"Segoe UI",Thonburi,"Noto Sans Thai",sans-serif;color:#1d1830;margin:32px;font-size:14px}
h1{margin:0 0 4px;font-size:22px}.meta{color:#666;margin-bottom:16px}table{width:100%;border-collapse:collapse}
th,td{border-bottom:1px solid #e3e0ec;padding:8px;text-align:left;vertical-align:top}th{font-size:12px;color:#666}
td.n,th.n{text-align:right;white-space:nowrap}img{width:72px;height:72px;object-fit:contain;background:#f6f4fb;border-radius:8px}
.cs{margin-top:4px}.c{display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:12px}.c i{width:12px;height:12px;border-radius:50%;border:1px solid #0003;display:inline-block}
.tot{margin-top:16px;display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}.tot b{font-size:20px}
.note{background:#f6f4fb;padding:10px;border-radius:8px;margin-bottom:12px;white-space:pre-wrap}
button{margin-top:20px;padding:8px 16px}@media print{button{display:none}body{margin:12mm}}
</style></head><body>
<h1>${esc(t("sheet.title"))}${o.customer ? ` · ${esc(o.customer)}` : ""}</h1>
<div class="meta">${new Date().toLocaleString(lang === "th" ? "th-TH" : "en-GB")}</div>
${o.note ? `<div class="note">${esc(o.note)}</div>` : ""}
<table><thead><tr><th>#</th><th></th><th>${esc(t("sheet.design"))}</th><th class="n">${esc(t("sheet.switches"))}</th><th class="n">${esc(t("order.qty"))}</th><th class="n">${esc(t("sheet.unit"))}</th><th class="n">${esc(t("sheet.line"))}</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot"><div>${esc(t("sheet.switchesTotal"))}: <b>${switches}</b><div class="cs">${all.map((c) => `<span class="c"><i style="background:${c}"></i>${esc(filamentName(c, lang))}</span>`).join("")}</div></div>
<div>${esc(t("order.total"))}: <b>${orderTotal(o)} ${CURRENCY}</b></div></div>
<button onclick="print()">🖨 ${esc(t("sheet.print"))}</button>
</body></html>`;
}
