// The bar over the 3D preview that recolours picked picture patches. It sits
// in the preview, not the side panel, so a tap on a tablet reaches it without
// scrolling. Tag Studio shares it: everything app-specific comes in as options.
import type { PatchInfo } from "../design/heights.ts";
import { button, h, swatches } from "./dom.ts";

export type ColourBar = {
  /** The picked patches; there is at least one. */
  patches: PatchInfo[];
  filaments: { hex: string; name: string }[];
  /** A colour's filament name: tablets have no tooltips on the swatches. */
  colourName: (hex: string) => string;
  /** True while each tap adds to the selection, as Shift-click does. */
  several: boolean;
  /** Shown under the title, for example when the Design passes 4 filaments. */
  note?: string;
  labels: { selected: string; several: string; reset: string; deselect: string };
  onColour: (hex: string) => void;
  onSeveral: () => void;
  onReset: () => void;
  onDeselect: () => void;
};

/** Fills `host` with the bar, or hides it when there is nothing picked. */
export function renderColourBar(host: HTMLElement, bar: ColourBar | null) {
  host.hidden = !bar;
  if (!bar) return host.replaceChildren();
  const { patches, labels } = bar;
  const colours = new Set(patches.map((p) => p.color.toUpperCase()));
  const one = colours.size === 1 ? patches[0].color : "";
  const title = `${labels.selected}: ${patches.length}${one ? ` · ${bar.colourName(one)}` : ""}`;
  // Each build re-renders the bar; keep the swatches where they were scrolled to.
  const scrolled = host.querySelector(".swatches")?.scrollLeft ?? 0;
  const row = swatches(bar.filaments, one, bar.onColour);
  const reset = button(`↺ ${labels.reset}`, bar.onReset, "ghost small");
  reset.disabled = !patches.some((p) => p.painted);
  host.replaceChildren(
    h(
      "div",
      { class: "cb-head" },
      h("span", { class: "dot", style: `--c:${one || "transparent"}` }),
      h("span", { class: "cb-title", text: title }),
      button(`☑ ${labels.several}`, bar.onSeveral, bar.several ? "ghost small on" : "ghost small"),
      reset,
      button(`✕ ${labels.deselect}`, bar.onDeselect, "ghost small"),
    ),
    bar.note ? h("small", { class: "cb-note", text: bar.note }) : "",
    row,
  );
  row.scrollLeft = scrolled;
}
