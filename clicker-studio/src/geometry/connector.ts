// H-connector: the hinge joint of Justi-Fy Studio's Modular Clicker (Bubbly),
// measured from its 3MF so Clicker Studio Bases link with printed Bubbly blocks
// (ADR 0011). A tab with a hole sticks out of one side; the opposite side has a
// socket: a window through the wall and a pin standing on a floor tongue that is
// cut free by two slits, so it springs down while the next tab slides in.
//
// Each joint is built in a local frame (edge at x = 0, outward +x, axis on y = 0)
// and placed on its side of the Base. z values are offsets from the Base bottom.
import type { BaseOptions, Connector } from "../design/types.ts";
import { K, type CrossSection, type Manifold } from "./kernel.ts";
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
  /** Longest tongue, from the edge inward. */
  tongueLen: 18,
  pinD: 4,
  /** Pin centre inside the footprint edge. */
  pinIn: 3,
  pinTop: 4.6,
  /** Lead-in chamfer under the tab tip. */
  tipChamfer: 1.2,
  /** Edge-to-edge gap between joined Bases (holeOut - pinIn). */
  gap: 2,
} as const;

/** Bottom of the MX bottom housing below the plate top (MX spec). The socket window must stay under it. */
export const HOUSING_BELOW_PLATE = 5.0;

export type Side = "left" | "right";
export type Role = "tab" | "socket";
export type Roles = Partial<Record<Side, Role>>;

/** One side's joint, placed: `edge` is the footprint's outer x on that side, `ay` the axis. */
export type Joint = {
  side: Side;
  role: Role;
  ay: number;
  edge: number;
  /** How far the tab root starts inside the edge. */
  rootIn: number;
  /** Tongue and window length from the edge inward. */
  len: number;
};

const other = (s: Side): Side => (s === "left" ? "right" : "left");
const dir = (s: Side) => (s === "right" ? 1 : -1);

export function connectorRoles(connector: Connector, tabSide: Side): Roles {
  if (connector === "none") return {};
  if (connector === "double") return { left: "tab", right: "tab" };
  if (connector === "close") return { [tabSide]: "tab" };
  return { [tabSide]: "tab", [other(tabSide)]: "socket" };
}

/** Footprint's outermost x on a side, within a horizontal band. */
function bandEdge(foot: CrossSection, y0: number, y1: number, side: Side): number {
  const b = foot.bounds();
  const probe = K().CrossSection.square([b.max[0] - b.min[0] + 2, y1 - y0], false).translate([b.min[0] - 1, y0]);
  const hit = foot.intersect(probe);
  if (hit.isEmpty()) return side === "right" ? b.max[0] : b.min[0];
  const hb = hit.bounds();
  return side === "right" ? hb.max[0] : hb.min[0];
}

/** Outer edges on both sides along an axis: across the window band, and the innermost edge across the tab. */
function edges(foot: CrossSection, ay: number, side: Side, bump: number) {
  const half = H.window / 2 + 0.5;
  const outer = bandEdge(foot, ay - half, ay + half, side) + dir(side) * bump;
  // Innermost edge across the tab width: where a scalloped or curved wall is shallowest.
  let inner = outer;
  for (let y = ay - H.tabWidth / 2; y <= ay + H.tabWidth / 2 + 1e-6; y += 0.5) {
    const e = bandEdge(foot, y - 0.1, y + 0.1, side);
    inner = side === "right" ? Math.min(inner, e) : Math.max(inner, e);
  }
  return { outer, inner };
}

/** The axis of a side: through the Switch nearest that side (ties: nearest the footprint's centre line). */
export function sideAxis(switches: [number, number][], foot: CrossSection, side: Side): number {
  if (!switches.length) return 0;
  const b = foot.bounds();
  const cy = (b.min[1] + b.max[1]) / 2;
  const far = Math.max(...switches.map((s) => dir(side) * s[0]));
  const cands = switches.filter((s) => dir(side) * s[0] > far - 0.5);
  cands.sort((p, q) => Math.abs(p[1] - cy) - Math.abs(q[1] - cy) || p[1] - q[1]);
  return cands[0][1];
}

/** The placed joints of a Base. */
export function connectorJoints(foot: CrossSection, switches: [number, number][], opts: BaseOptions, roles: Roles = connectorRoles(opts.connector, opts.connectorSide)): Joint[] {
  const bump = opts.texture === "dots" ? 0.8 : 0;
  const cut = opts.texture === "none" ? 0 : opts.textureDepth;
  const out: Joint[] = [];
  for (const side of ["left", "right"] as Side[]) {
    const role = roles[side];
    if (!role) continue;
    const ay = sideAxis(switches, foot, side);
    const { outer, inner } = edges(foot, ay, side, bump);
    const far = bandEdge(foot, ay - 0.1, ay + 0.1, other(side));
    const width = Math.abs(outer - far);
    out.push({ side, role, ay, edge: outer, rootIn: Math.abs(outer - inner) + cut + 1, len: Math.min(H.tongueLen, width - 4) });
  }
  return out;
}

/** Local joint frame -> plate frame. */
function place(m: Manifold, j: Joint): Manifold {
  return (j.side === "right" ? m : m.rotate([0, 0, 180])).translate([j.edge, j.ay, 0]);
}

function placeCs(cs: CrossSection, j: Joint): CrossSection {
  return (j.side === "right" ? cs : cs.rotate(180)).translate([j.edge, j.ay]);
}

function rect(x0: number, x1: number, y0: number, y1: number): CrossSection {
  return K().CrossSection.square([x1 - x0, y1 - y0], false).translate([x0, y0]);
}

/** A profile drawn in local (x, z) and extruded across y ±w/2. */
function xzPrism(pts: [number, number][], w: number): Manifold {
  return polygon(pts).extrude(w).rotate([90, 0, 0]).translate([0, w / 2, 0]);
}

/** Tab outline from its root to the round end, without the hole. */
function tabOutline(j: Joint): CrossSection {
  const r = H.tabWidth / 2;
  return rect(-j.rootIn, H.holeOut, -r, r).add(circle(r, [H.holeOut, 0]));
}

export function tabSolid(j: Joint, bottom: number): Manifold {
  const [z0, z1] = [bottom + H.tabZ[0], bottom + H.tabZ[1]];
  const cs = tabOutline(j).subtract(circle(H.holeD / 2, [H.holeOut, 0]));
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

/** The tongue's own floor, 1.6 thick whatever the Floor setting (clip to the footprint before adding). */
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

/** Where the slicer must support the tab: its part outside the footprint, up to the tab top. */
export function supportVolume(j: Joint, bottom: number, foot: CrossSection): Manifold {
  return slab(placeCs(tabOutline(j), j).subtract(foot), bottom, bottom + H.tabZ[1]);
}

/** The tab hole's centre (a keyring point), plate frame. */
export function holeCentre(j: Joint): [number, number] {
  return [j.edge + dir(j.side) * H.holeOut, j.ay];
}

/** Centre-to-centre distance of two identical Bases joined on this axis. */
export function jointPitch(foot: CrossSection, ay: number, bump = 0): number {
  const half = H.window / 2 + 0.5;
  return bandEdge(foot, ay - half, ay + half, "right") - bandEdge(foot, ay - half, ay + half, "left") + 2 * bump + H.gap;
}

/** True when a copy of this Base joined at a connector would overlap it outside the joint. */
export function neighbourClash(foot: CrossSection, joints: Joint[], bump = 0): boolean {
  return joints.some((j) => {
    const shift = dir(j.side) * jointPitch(foot, j.ay, bump);
    return foot.intersect(foot.translate([shift, 0])).area() > 0.01;
  });
}

/**
 * True when the next Base's tab would reach the Switch: its tip comes within the
 * centre post (Ø4 + margin) of a Switch, or the window climbs into the bottom housing.
 */
export function switchClash(joints: Joint[], switches: [number, number][], bottom: number): boolean {
  const reach = H.pinIn + H.tabWidth / 2;
  return joints.some((j) => {
    if (j.role !== "socket") return false;
    if (bottom + H.windowTop > -HOUSING_BELOW_PLATE) return true;
    const tip = j.edge - dir(j.side) * reach;
    return switches.some((s) => Math.abs(s[1] - j.ay) < H.tabWidth / 2 + 2 && dir(j.side) * (tip - s[0]) < 2.5);
  });
}
