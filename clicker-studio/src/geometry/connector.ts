// H-connector: the hinge joint of Justi-Fy Studio's Modular Clicker (Bubbly),
// measured from its 3MF so Clicker Studio Bases link with printed Bubbly blocks
// (ADR 0011). A tab with a hole sticks out of one side; the opposite side has a
// socket: a window through the wall and a pin standing on a floor tongue that is
// cut free by two slits, so it springs down while the next tab slides in.
//
// Each joint sits on a joint face: the Base's outermost point on that side, so
// nothing of the Base passes it and pieces of any shape link with the 2 mm gap.
// Where the wall is farther in, a low housing (socket) or an arm on the bed (tab)
// reaches out to the face. Each joint is built in a local frame (face at x = 0,
// outward +x, axis on y = 0) and turned to its side. z values are offsets from
// the Base bottom.
import type { BaseOptions, Connectors, End, Side } from "../design/types.ts";
import { NO_CONNECTORS, OPPOSITE, SIDES, pinSide } from "../design/connectors.ts";
import { K, type CrossSection, type Manifold } from "./kernel.ts";

export { NO_CONNECTORS, SIDES, pinSide };
import { circle, polygon } from "./outline.ts";
import { slab } from "./cap.ts";

/** Bubbly's joint, mm. Not owner-tunable: changing any of these breaks the fit with Bubbly blocks. */
export const H = {
  tabWidth: 9,
  /** Tab underside and top above the bed. */
  tabZ: [2, 5] as const,
  holeD: 4.5,
  /** Hole centre beyond the footprint edge. */
  holeOut: 5,
  /** Window through the socket wall: width and top above the bed. */
  window: 10,
  windowTop: 5.4,
  /** Floor tongue thickness (its top is where the window starts). */
  tongue: 1.6,
  slit: 0.2,
  /** Longest tongue, from the face inward. */
  tongueLen: 18,
  /**
   * Shortest tongue that still bends far enough (2.6 mm at the pin) without
   * cracking: a 1.6 mm PLA cantilever stays near 3 % strain from about 14 mm.
   */
  tongueMin: 14,
  pinD: 4,
  /** Pin centre inside the footprint edge. */
  pinIn: 3,
  pinTop: 4.6,
  /** Lead-in chamfer under the tab tip. */
  tipChamfer: 1.2,
  /** Edge-to-edge gap between joined Bases (holeOut - pinIn). */
  gap: 2,
  /** Socket housing: walls beside the window, and roof over it. */
  housingWall: 2.5,
  housingRoof: 1.6,
} as const;

/** Bottom of the MX bottom housing below the plate top (MX spec). The socket window must stay under it. */
export const HOUSING_BELOW_PLATE = 5.0;

export type { Side, End, Connectors };
export type Role = Exclude<End, "none">;

/** Each side's outward direction, degrees from +x. */
const ANGLE: Record<Side, number> = { right: 0, top: 90, left: 180, bottom: 270 };

/** A side's outward unit vector. */
export function sideDir(side: Side): [number, number] {
  const a = (ANGLE[side] * Math.PI) / 180;
  return [Math.round(Math.cos(a)), Math.round(Math.sin(a))];
}

function rot([x, y]: [number, number], deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  const c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  return [x * c - y * s, x * s + y * c];
}

/** One side's joint, placed: `at` is the joint face on the axis (plate frame). */
export type Joint = {
  side: Side;
  role: Role;
  at: [number, number];
  /** How far the tab root, arm or housing starts inside the face. */
  rootIn: number;
  /** Tongue and window length from the face inward. */
  len: number;
};

/** Sides with an end, and what each carries. */
export function connectorRoles(c: Connectors): Partial<Record<Side, Role>> {
  const out: Partial<Record<Side, Role>> = {};
  for (const s of SIDES) if (c[s] !== "none") out[s] = c[s] as Role;
  return out;
}

/** Footprint's rightmost x within a horizontal band (local frame). */
function bandRight(foot: CrossSection, y0: number, y1: number, left = false): number {
  const b = foot.bounds();
  const probe = K().CrossSection.square([b.max[0] - b.min[0] + 2, y1 - y0], false).translate([b.min[0] - 1, y0]);
  const hit = foot.intersect(probe);
  if (hit.isEmpty()) return left ? b.min[0] : b.max[0];
  const hb = hit.bounds();
  return left ? hb.min[0] : hb.max[0];
}

/** The axis (local y) of the +x side: through the Switch nearest it (ties: nearest the footprint's centre line). */
function localAxis(switches: [number, number][], foot: CrossSection): number {
  if (!switches.length) return 0;
  const b = foot.bounds();
  const cy = (b.min[1] + b.max[1]) / 2;
  const far = Math.max(...switches.map((s) => s[0]));
  const cands = switches.filter((s) => s[0] > far - 0.5);
  cands.sort((p, q) => Math.abs(p[1] - cy) - Math.abs(q[1] - cy) || p[1] - q[1]);
  return cands[0][1];
}

/** The placed joints of a Base. */
export function connectorJoints(foot: CrossSection, switches: [number, number][], opts: BaseOptions, connectors: Connectors = opts.connectors): Joint[] {
  const bump = opts.texture === "dots" ? 0.8 : 0;
  const cut = opts.texture === "none" ? 0 : opts.textureDepth;
  const out: Joint[] = [];
  for (const side of SIDES) {
    const role = connectors[side];
    if (role === "none") continue;
    const deg = ANGLE[side];
    const f = deg ? foot.rotate(-deg) : foot;
    const ay = localAxis(switches.map((s) => rot(s, -deg)), f);
    const face = f.bounds().max[0] + bump;
    // Innermost wall across the pad: where a scalloped or curved wall is shallowest.
    const half = role === "tab" ? H.tabWidth / 2 : H.window / 2 + H.housingWall;
    let inner = face;
    for (let y = ay - half; y <= ay + half + 1e-6; y += 0.5) inner = Math.min(inner, bandRight(f, y - 0.1, y + 0.1));
    const far = bandRight(f, ay - 0.1, ay + 0.1, true);
    out.push({ side, role, at: rot([face, ay], deg), rootIn: face - inner + cut + 1, len: Math.min(H.tongueLen, face - far - 4) });
  }
  return separateTongues(out);
}

/** A socket's tongue with its slits, plus `grow` all round (plate frame). */
function tongueArea(j: Joint, grow = 0): CrossSection {
  const h = H.window / 2 + grow;
  return placeCs(rect(-j.len - grow, 1, -h, h), j);
}

/**
 * Two sockets' tongues must not cross, or their slits cut each other free. Opposite
 * sockets on one line share the span with a 2 mm bridge in the middle; otherwise a
 * later socket's tongue stops 1.5 mm short of an earlier one's.
 */
function separateTongues(joints: Joint[]): Joint[] {
  const sockets = joints.filter((j) => j.role === "socket");
  for (let a = 0; a < sockets.length; a++)
    for (let b = a + 1; b < sockets.length; b++) {
      const [p, q] = [sockets[a], sockets[b]];
      if (tongueArea(p).intersect(tongueArea(q)).isEmpty()) continue;
      if (OPPOSITE[p.side] === q.side) {
        const span = Math.hypot(p.at[0] - q.at[0], p.at[1] - q.at[1]);
        p.len = q.len = Math.min(p.len, q.len, (span - 2) / 2);
      }
      while (q.len > 0.5 && !tongueArea(p, 1.5).intersect(tongueArea(q)).isEmpty()) q.len -= 0.5;
    }
  return joints;
}

/** True when a socket's tongue came out too short to bend (a small Base, or sockets meeting in the middle). */
export function shortTongue(joints: Joint[]): boolean {
  return joints.some((j) => j.role === "socket" && j.len < H.tongueMin);
}

/** Local joint frame -> plate frame. */
function place(m: Manifold, j: Joint): Manifold {
  const deg = ANGLE[j.side];
  return (deg ? m.rotate([0, 0, deg]) : m).translate([j.at[0], j.at[1], 0]);
}

function placeCs(cs: CrossSection, j: Joint): CrossSection {
  const deg = ANGLE[j.side];
  return (deg ? cs.rotate(deg) : cs).translate(j.at);
}

function rect(x0: number, x1: number, y0: number, y1: number): CrossSection {
  return K().CrossSection.square([x1 - x0, y1 - y0], false).translate([x0, y0]);
}

/** A profile drawn in local (x, z) and extruded across y ±w/2. */
function xzPrism(pts: [number, number][], w: number): Manifold {
  return polygon(pts).extrude(w).rotate([90, 0, 0]).translate([0, w / 2, 0]);
}

/** Tab outline from `x0` to the round end, without the hole. */
function tabOutline(x0: number): CrossSection {
  const r = H.tabWidth / 2;
  return rect(x0, H.holeOut, -r, r).add(circle(r, [H.holeOut, 0]));
}

/** The socket housing's outline, from its root to the face (local). */
function housingOutline(j: Joint): CrossSection {
  const h = H.window / 2 + H.housingWall;
  const r = 3;
  return rect(-j.rootIn, -r, -h, h).add(rect(-j.rootIn, 0, -h + r, h - r)).add(circle(r, [-r, h - r])).add(circle(r, [-r, -h + r]));
}

/** What a joint adds to the footprint out to its face: the housing, or the tab arm (plate frame). */
export function padOutline(j: Joint): CrossSection {
  return placeCs(j.role === "socket" ? housingOutline(j) : rect(-j.rootIn, 0, -H.tabWidth / 2, H.tabWidth / 2), j);
}

/** The housing (socket) or arm (tab) from the bed, out to the face. Add it before the cuts. */
export function padSolid(j: Joint, bottom: number): Manifold {
  const top = j.role === "socket" ? H.windowTop + H.housingRoof : H.tabZ[1];
  return slab(padOutline(j), bottom, bottom + top);
}

export function tabSolid(j: Joint, bottom: number): Manifold {
  const [z0, z1] = [bottom + H.tabZ[0], bottom + H.tabZ[1]];
  const cs = tabOutline(-j.rootIn).subtract(circle(H.holeD / 2, [H.holeOut, 0]));
  const tip = H.holeOut + H.tabWidth / 2;
  const c = H.tipChamfer;
  // Lead-in: a 45° chamfer under the tip rides the pin down as the tab slides in.
  const chamfer = xzPrism([[tip - c - 0.01, z0 - 0.1], [tip + 1, z0 - 0.1], [tip + 1, z0 + c + 1.01]], H.tabWidth + 2);
  return place(slab(cs, z0, z1).subtract(chamfer), j);
}

/** The window through the wall plus the room above the tongue, as one cut. */
export function socketCut(j: Joint, bottom: number): Manifold {
  const h = H.window / 2;
  const cs = rect(-j.len, 1, -h, h).add(circle(h, [-H.pinIn, 0]));
  return place(slab(cs, bottom + H.tongue, bottom + H.windowTop), j);
}

/** The tongue's own floor, 1.6 thick whatever the Floor setting (clip to the footprint and pads before adding). */
export function tongueSlab(j: Joint, bottom: number): Manifold {
  const h = H.window / 2 - H.slit;
  return place(slab(rect(-j.len, 1, -h, h), bottom, bottom + H.tongue), j);
}

export function pinSolid(j: Joint, bottom: number): Manifold {
  const r = H.pinD / 2;
  const pin = K().Manifold.cylinder(H.pinTop - H.tongue + 0.01, r, r, 48).translate([-H.pinIn, 0, bottom + H.tongue - 0.01]);
  // Lead-in on the outer top: 45° from the top centre down to the outer side.
  const zTop = bottom + H.pinTop;
  const x0 = -H.pinIn;
  const chamfer = xzPrism([[x0, zTop + 0.01], [x0 + r + 0.2, zTop - r - 0.19], [x0 + r + 0.2, zTop + 1]], H.pinD + 1);
  return place(pin.subtract(chamfer), j);
}

/** The two slits that free the tongue, through the floor. */
export function slitCut(j: Joint, bottom: number, floor: number): Manifold {
  const h = H.window / 2;
  const cs = rect(-j.len, 1, h - H.slit, h).add(rect(-j.len, 1, -h, -h + H.slit));
  return place(slab(cs, bottom - 1, bottom + Math.max(H.tongue, floor) + 0.1), j);
}

/** Where the slicer must support the tab: its part past the face (the arm stands on the bed), up to the tab top. */
export function supportVolume(j: Joint, bottom: number): Manifold {
  return slab(placeCs(tabOutline(0), j), bottom, bottom + H.tabZ[1]);
}

/** The tab hole's centre (a keyring point), plate frame. */
export function holeCentre(j: Joint): [number, number] {
  const d = sideDir(j.side);
  return [j.at[0] + d[0] * H.holeOut, j.at[1] + d[1] * H.holeOut];
}

/** Centre-to-centre distance of two identical Bases joined left to right: face to face plus the gap. */
export function jointPitch(foot: CrossSection, bump = 0): number {
  const b = foot.bounds();
  return b.max[0] - b.min[0] + 2 * bump + H.gap;
}

/**
 * How far an inserted tab's tip must stay from a Switch centre, by where its
 * socket is relative to the pins (MX: pins at 5.08 and 3.81 + r 0.75, centre post r 2).
 */
const TIP_CLEAR = { pins: 6.1, beside: 4.9, opposite: 2.5 };

/**
 * True when the next Base's tab would reach a Switch put in with its pins toward
 * `pinSide`, or a socket window climbs into the bottom housing.
 */
export function switchClash(joints: Joint[], switches: [number, number][], bottom: number, connectors: Connectors): boolean {
  const sockets = joints.filter((j) => j.role === "socket");
  if (!sockets.length) return false;
  const pins = pinSide(connectors);
  if (!pins) return true;
  if (bottom + H.windowTop > -HOUSING_BELOW_PLATE) return true;
  const reach = H.pinIn + H.tabWidth / 2;
  return sockets.some((j) => {
    const need = j.side === pins ? TIP_CLEAR.pins : j.side === OPPOSITE[pins] ? TIP_CLEAR.opposite : TIP_CLEAR.beside;
    const deg = ANGLE[j.side];
    const [fx, fy] = rot(j.at, -deg);
    return switches.some((s) => {
      const [sx, sy] = rot(s, -deg);
      return Math.abs(sy - fy) < H.tabWidth / 2 + 6 && fx - reach - sx < need;
    });
  });
}
