// MX switch dimensions (public MX spec) and the printed parts that fit them.
// Every value that touches a real part is a Fit setting the owner can change.

export type Fit = {
  /** Plate cutout the switch clips into. Spec 14.0. */
  pocket: number;
  /** Plate thickness the switch clips grip. Spec 1.5. */
  plate: number;
  /** Square room under the plate for the bottom housing and clips. */
  clipRoom: number;
  /** Depth under the plate for the bottom housing and pins (5.0 + 3.3 + margin). */
  under: number;
  /** Stem top above the plate top, at rest. */
  stemTop: number;
  /** Key travel. */
  travel: number;
  /** Extra gap between the cap skirt and the plate when fully pressed. */
  bottomGap: number;
  /** Cross socket arm length and width (before stem fit). */
  crossLength: number;
  crossWidth: number;
  /** Added to the cross socket on every side. Negative = tighter. */
  stemFit: number;
  /** Socket depth and boss diameter. */
  socketDepth: number;
  boss: number;
  /** Top housing above the plate, which the cap must clear at every point of travel:
   *  width at the plate, width at its top, and height. Measure your switches. */
  housingBottom: number;
  housingTop: number;
  housingHeight: number;
  /** Gap between cap and base walls, on every side. */
  clearance: number;
  /** Farthest any point of a shared cap may be from its nearest switch. Beyond it, more
   *  switches are added (the keyboard "2u" rule: a 38 × 19 cap's corner is 21.3 mm out). */
  reach: number;
  /** Smallest centre-to-centre distance between switches under one cap (clip rooms plus a plate web). */
  pitch: number;
  /** Extra stem fit on every socket but the first, so a cap on several switches never binds. */
  extraStemFit: number;
};

export const DEFAULT_FIT: Fit = {
  pocket: 14.0,
  plate: 1.5,
  clipRoom: 15.8,
  under: 8.6,
  stemTop: 11.6,
  travel: 4.0,
  bottomGap: 0.6,
  crossLength: 4.1,
  crossWidth: 1.35,
  stemFit: 0,
  socketDepth: 3.8,
  boss: 5.6,
  housingBottom: 15.4,
  housingTop: 11.6,
  housingHeight: 6.6,
  clearance: 0.8,
  reach: 22,
  pitch: 18,
  extraStemFit: 0.1,
};

/** Heights relative to the plate top, at rest. */
export function capHeights(fit: Fit) {
  const skirtBottom = fit.travel + fit.bottomGap;
  return { skirtBottom, ceiling: fit.stemTop, bossBottom: fit.stemTop - fit.socketDepth };
}

/** Smallest total cap height: skirt to ceiling plus a 1.6 mm top. */
export function minCapHeight(fit: Fit): number {
  const { skirtBottom, ceiling } = capHeights(fit);
  return ceiling - skirtBottom + 1.6;
}
