// Price of a Design from pricing.json.
import pricing from "../../pricing.json";
import type { Design } from "./types.ts";

export const CURRENCY = pricing.currency;

export type PriceLine = { label: string; amount: number };

export function priceLines(d: Design): PriceLine[] {
  const lines: PriceLine[] = [];
  const keys = d.kind === "cap" || d.kind === "picture" || d.kind === "model" ? 1 : d.keys.length;
  if (d.parts === "az-set") lines.push({ label: "A–Z set", amount: pricing.parts.azSet });
  else if (d.parts === "caps") lines.push({ label: `Caps × ${keys}`, amount: pricing.parts.capsOnlyPerKey * keys });
  else if (d.parts === "base") lines.push({ label: "Base", amount: pricing.parts.baseOnly });
  else {
    const k = pricing.kinds[d.kind];
    lines.push({ label: d.kind, amount: k.base });
    const extra = Math.max(0, keys - k.includedKeys);
    if (extra && k.perExtraKey) lines.push({ label: `+${extra} keys`, amount: extra * k.perExtraKey });
  }
  if (d.chain === "cord" && pricing.extras.cord) lines.push({ label: "cord", amount: pricing.extras.cord });
  if (d.base.texture !== "none" && pricing.extras.texture) lines.push({ label: "texture", amount: pricing.extras.texture });
  if (d.picture?.useCartoon && pricing.extras.aiCartoon) lines.push({ label: "AI cartoon", amount: pricing.extras.aiCartoon });
  const colours = new Set(designColours(d)).size;
  if (colours > 4 && pricing.extras.perColourBeyond4) lines.push({ label: `${colours} colours`, amount: (colours - 4) * pricing.extras.perColourBeyond4 });
  return lines;
}

export function price(d: Design): number {
  return priceLines(d).reduce((s, l) => s + l.amount, 0);
}

/** Every filament colour a Design uses. */
export function designColours(d: Design): string[] {
  const out: string[] = [];
  const keys = d.kind === "cap" || d.kind === "picture" || d.kind === "model" ? d.keys.slice(0, 1) : d.keys;
  if (d.parts !== "base") {
    for (const k of keys) {
      out.push(k.capColor);
      if (d.kind !== "picture" && k.deco.type !== "none") out.push(k.decoColor);
      for (let i = 0; i < k.outline; i++) out.push(k.outlineColors[i]);
    }
    if (d.kind === "picture" && d.picture) out.push(...d.picture.palette.slice(0, d.picture.colors));
  }
  if (d.parts === "cap+base" || d.parts === "base") {
    if (d.kind === "fluted") out.push(...keys.map((k) => k.baseColor ?? d.baseColor));
    else out.push(d.baseColor);
  }
  return [...new Set(out.map((c) => c.toUpperCase()))];
}
