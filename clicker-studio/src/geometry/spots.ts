// Switch spots the owner pinned (ADR 0016). Plain data and arithmetic, no
// kernel, so the worker and the page clamp a spot the same way.

export type Pt = [number, number];

/** A bitmap over a region of the plate frame; pixel (i, j) is centred at (x0 + (i + 0.5) px, y0 + (j + 0.5) px). */
export type Mask = { w: number; h: number; x0: number; y0: number; px: number; data: Uint8Array };

/** Where the Switches under a shared cap are and may go (cap-local mm). */
export type Place = {
  at: Pt[];
  ok: Mask;
  pitch: number;
  /** The cap's bounds: pinned spots are shares of them, from the middle. */
  min: Pt;
  max: Pt;
  cap: Pt[][];
  foot: Pt[][];
  /** Cap top z (plate frame). */
  top: number;
};

type Ground = Pick<Place, "ok" | "pitch" | "min" | "max">;

export function maskAt(m: Mask, p: Pt): boolean {
  const i = Math.floor((p[0] - m.x0) / m.px), j = Math.floor((p[1] - m.y0) / m.px);
  return i >= 0 && j >= 0 && i < m.w && j < m.h && m.data[j * m.w + i] === 1;
}

const clear = (others: Pt[], pitch: number, p: Pt) => others.every((o) => Math.hypot(o[0] - p[0], o[1] - p[1]) >= pitch - 1e-6);

export const spotFits = (g: Ground, others: Pt[], p: Pt) => maskAt(g.ok, p) && clear(others, g.pitch, p);

/** `p` itself when a Switch fits there, else the nearest pixel centre where one does (null when there is none). */
export function nearestSpot(g: Ground, others: Pt[], p: Pt): Pt | null {
  if (spotFits(g, others, p)) return p;
  const m = g.ok;
  let best: Pt | null = null, bd = Infinity;
  for (let j = 0; j < m.h; j++)
    for (let i = 0; i < m.w; i++) {
      if (!m.data[j * m.w + i]) continue;
      const q: Pt = [m.x0 + (i + 0.5) * m.px, m.y0 + (j + 0.5) * m.px];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < bd && clear(others, g.pitch, q)) (bd = d), (best = q);
    }
  return best;
}

export const middle = (g: Pick<Place, "min" | "max">): Pt => [(g.min[0] + g.max[0]) / 2, (g.min[1] + g.max[1]) / 2];

export function toShare(g: Pick<Place, "min" | "max">, p: Pt): Pt {
  const c = middle(g);
  return [(p[0] - c[0]) / (g.max[0] - g.min[0]), (p[1] - c[1]) / (g.max[1] - g.min[1])];
}

/** Pinned shares -> cap-local spots, each moved to the nearest place it fits. Null when they can't all fit. */
export function resolveSpots(g: Ground, shares: Pt[]): Pt[] | null {
  const c = middle(g);
  const out: Pt[] = [];
  for (const s of shares) {
    const q = nearestSpot(g, out, [c[0] + s[0] * (g.max[0] - g.min[0]), c[1] + s[1] * (g.max[1] - g.min[1])]);
    if (!q) return null;
    out.push(q);
  }
  return out;
}
