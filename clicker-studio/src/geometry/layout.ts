// Block Clicker layouts: key cells in key units, x right, y down.
import type { Design } from "../design/types.ts";

export type Cell = [number, number];

export function keyCells(design: Pick<Design, "layout" | "columns" | "cells">, n: number): Cell[] {
  const cols = Math.max(1, Math.round(design.columns));
  switch (design.layout) {
    case "row":
      return Array.from({ length: n }, (_, i) => [i, 0]);
    case "column":
      return Array.from({ length: n }, (_, i) => [0, i]);
    case "grid":
      return Array.from({ length: n }, (_, i) => [i % cols, Math.floor(i / cols)]);
    case "wasd":
    case "arrows":
      // One key on top, then a row of three.
      return [[1, 0], [0, 1], [1, 1], [2, 1]].slice(0, n) as Cell[];
    case "t": {
      // A top row of `cols` keys, then a column down from the middle.
      const out: Cell[] = [];
      const mid = (cols - 1) / 2;
      for (let i = 0; i < n; i++) out.push(i < cols ? [i, 0] : [mid, i - cols + 1]);
      return out;
    }
    case "custom": {
      const out = design.cells.slice(0, n);
      for (let i = out.length; i < n; i++) out.push([i, 0]);
      return out;
    }
  }
}

/** How many keys a fixed layout holds; null when any count works. */
export function layoutKeyCount(layout: Design["layout"]): number | null {
  return layout === "wasd" || layout === "arrows" ? 4 : null;
}
