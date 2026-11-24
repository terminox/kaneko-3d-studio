import { beforeAll, describe, expect, test } from "bun:test";
import { K, loadKernel, type Manifold } from "../src/geometry/kernel.ts";
import { baseFootprint, baseJoints, baseLevels, baseSupports, buildBase, loopCentres, connectorSides } from "../src/geometry/base.ts";
import { capOutline, centredOnSwitch } from "../src/geometry/outline.ts";
import { placeSwitches, switchGround } from "../src/geometry/switches.ts";
import type { BaseKey } from "../src/geometry/base.ts";
import { DEFAULT_FIT } from "../src/geometry/switch.ts";
import { newDesign, upgradeBase, type BaseOptions, type CapShape, type Connectors, type End, type Side } from "../src/design/types.ts";
import { NO_CONNECTORS, OPPOSITE, SIDES, pinSide } from "../src/design/connectors.ts";
import { H, holeCentre, jointPitch, sideDir, type Joint } from "../src/geometry/connector.ts";
import { build, packPlates } from "../src/geometry/build.ts";
import { platesTo3mf } from "../src/export/bambu.ts";
import { strFromU8, unzipSync } from "fflate";
import { assets } from "./helpers.ts";

beforeAll(async () => {
  await loadKernel();
});

const fit = DEFAULT_FIT;
const ends = (c: Partial<Connectors>): Connectors => ({ ...NO_CONNECTORS, ...c });

function base(c: Partial<Connectors>, over: Partial<BaseOptions> = {}, shape: CapShape = "square", size = 18) {
  const opts = { ...newDesign("cap").base, ...over, connectors: ends(c) };
  const k = [{ at: [0, 0] as [number, number], outline: capOutline(shape, size, 2) }];
  const foot = baseFootprint(k, opts, fit);
  return { opts, foot, m: buildBase(k, opts, fit, foot), joints: baseJoints(k, opts, fit, foot), sup: baseSupports(k, opts, fit, foot), bottom: baseLevels(opts, fit).bottom };
}

/** A Base over several keys (a row, a grid, or one cap on several switches). */
function multi(k: BaseKey[], c: Partial<Connectors>) {
  const opts = { ...newDesign("cap").base, connectors: ends(c) };
  const foot = baseFootprint(k, opts, fit);
  return { opts, foot, m: buildBase(k, opts, fit, foot), joints: baseJoints(k, opts, fit, foot), sup: baseSupports(k, opts, fit, foot), bottom: baseLevels(opts, fit).bottom };
}

function valid(m: Manifold) {
  expect(m.status()).toBe("NoError");
  expect(m.isEmpty()).toBe(false);
  expect(m.volume()).toBeGreaterThan(1);
}

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
  K().Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
const role = (joints: Joint[], r: "tab" | "socket") => joints.find((j) => j.role === r)!;

/**
 * Two pieces joined at A's socket: B (A's copy, moved by the pitch) has its tab in
 * A's socket. No overlap, A's pin inside B's hole, and ±`swing`° about the pin
 * (wide pieces swing less: their corners are the stop).
 */
function expectMates(a: ReturnType<typeof base>, socketSide: Side, swing = 5) {
  const { m, joints, foot, bottom } = a;
  const d = sideDir(socketSide);
  const turned = d[0] ? foot : foot.rotate(90);
  const pitch = jointPitch(turned, a.opts.texture === "dots" ? 0.8 : 0);
  const next = m.translate([d[0] * pitch, d[1] * pitch, 0]);
  expect(m.intersect(next).volume()).toBeLessThan(1e-3);
  const s = joints.find((j) => j.side === socketSide)!;
  const pin: [number, number] = [s.at[0] - d[0] * H.pinIn, s.at[1] - d[1] * H.pinIn];
  const tab = role(joints, "tab");
  const hole = holeCentre(tab);
  expect(hole[0] + d[0] * pitch).toBeCloseTo(pin[0], 3);
  expect(hole[1] + d[1] * pitch).toBeCloseTo(pin[1], 3);
  const probe = K().Manifold.cylinder(2.5, 1.9, 1.9, 32).translate([pin[0], pin[1], bottom + 2.05]);
  expect(probe.intersect(m).volume()).toBeGreaterThan(1);
  expect(probe.intersect(next).volume()).toBeLessThan(1e-3);
  for (const deg of [swing, -swing]) {
    const swung = next.translate([-pin[0], -pin[1], 0]).rotate([0, 0, deg]).translate([pin[0], pin[1], 0]);
    expect(m.intersect(swung).volume()).toBeLessThan(1e-3);
  }
}

describe("H-connector", () => {
  for (const side of SIDES)
    for (const r of ["tab", "socket"] as End[])
      test(`${r} on the ${side}: one valid piece`, () => {
        const { m, sup } = base({ [side]: r });
        valid(m);
        // The tongue stays attached: still one piece.
        expect(m.decompose().length).toBe(1);
        expect(sup.length).toBe(r === "tab" ? 1 : 0);
      });

  test("tab and socket are where Bubbly puts them", () => {
    const { m, joints, bottom, foot } = base({ left: "tab", right: "socket" });
    const tab = role(joints, "tab");
    const socket = role(joints, "socket");
    expect(tab.side).toBe("left");
    expect(socket.side).toBe("right");
    const fb = foot.bounds();
    expect(socket.at[0]).toBeCloseTo(fb.max[0], 3);
    const [hx, hy] = holeCentre(tab);
    expect(hx).toBeCloseTo(fb.min[0] - H.holeOut, 3);
    // Hole open through the tab, tab material around it at z 2–5, nothing under it.
    const probe = K().Manifold.cylinder(20, H.holeD / 2 - 0.15, H.holeD / 2 - 0.15, 32).translate([hx, hy, bottom - 5]);
    expect(m.intersect(probe).volume()).toBeLessThan(1e-3);
    expect(m.intersect(box(hx - 4, hx - 2.5, -1, 1, bottom + 2.1, bottom + 4.9)).volume()).toBeGreaterThan(1.4 * 2 * 2.7);
    expect(m.intersect(box(hx - 4, hx - 2.5, -1, 1, bottom, bottom + 1.9)).volume()).toBeLessThan(1e-3);
    // Pin 3 mm inside the face, standing to z 4.6.
    const px = socket.at[0] - H.pinIn;
    expect(m.intersect(box(px - 1, px, -0.5, 0.5, bottom + 4.0, bottom + 4.4)).volume()).toBeGreaterThan(0.3);
    expect(m.intersect(box(px - 1.5, px + 1.5, -1.5, 1.5, bottom + 4.7, bottom + 5.3)).volume()).toBeLessThan(1e-3);
    // Slits through the floor beside the tongue.
    for (const y of [4.9, -4.9]) expect(m.intersect(box(socket.at[0] - 15, socket.at[0], y - 0.05, y + 0.05, bottom - 1, bottom + 1.6)).volume()).toBeLessThan(1e-3);
    // The window is open above the tongue.
    for (const [y0, y1] of [[2.3, 4.5], [-4.5, -2.3]]) expect(m.intersect(box(socket.at[0] - 7, socket.at[0] + 1, y0, y1, bottom + 1.7, bottom + 5.3)).volume()).toBeLessThan(1e-3);
  });

  test("top and bottom: the hole 5 mm past the top face, the pin 3 mm inside the bottom face", () => {
    const { m, joints, bottom, foot } = base({ top: "tab", bottom: "socket" });
    const fb = foot.bounds();
    const [hx, hy] = holeCentre(role(joints, "tab"));
    expect(hx).toBeCloseTo(0, 3);
    expect(hy).toBeCloseTo(fb.max[1] + H.holeOut, 3);
    const probe = K().Manifold.cylinder(20, H.holeD / 2 - 0.15, H.holeD / 2 - 0.15, 32).translate([hx, hy, bottom - 5]);
    expect(m.intersect(probe).volume()).toBeLessThan(1e-3);
    expect(m.intersect(box(-1, 1, hy + 2.5, hy + 4, bottom + 2.1, bottom + 4.9)).volume()).toBeGreaterThan(1.4 * 2 * 2.7);
    const py = fb.min[1] + H.pinIn;
    expect(m.intersect(box(-0.5, 0.5, py, py + 1, bottom + 4.0, bottom + 4.4)).volume()).toBeGreaterThan(0.3);
    for (const x of [4.9, -4.9]) expect(m.intersect(box(x - 0.05, x + 0.05, fb.min[1], fb.min[1] + 15, bottom - 1, bottom + 1.6)).volume()).toBeLessThan(1e-3);
  });

  test("left to right: two pieces join and swing", () => {
    expectMates(base({ left: "tab", right: "socket" }), "right");
  });

  test("top to bottom: two pieces join and swing", () => {
    expectMates(base({ top: "tab", bottom: "socket" }), "bottom");
  });

  test("a heart bulges past the joint: the housing and arm reach its lobes, and pieces join", async () => {
    const a = base({ left: "tab", right: "socket" }, { shape: "follow" }, "heart", 36.5);
    valid(a.m);
    expect(a.m.decompose().length).toBe(1);
    const fb = a.foot.bounds();
    expect(role(a.joints, "socket").at[0]).toBeCloseTo(fb.max[0], 3);
    expect(role(a.joints, "tab").at[0]).toBeCloseTo(fb.min[0], 3);
    expectMates(a, "right");
    // Nothing of the Base passes either face.
    const mb = a.m.boundingBox();
    expect(mb.max[0]).toBeCloseTo(fb.max[0], 2);
    const d = newDesign("cap");
    d.cap.shape = "heart";
    d.cap.size = 36.5;
    d.base.shape = "follow";
    d.base.connectors = ends({ left: "tab", right: "socket" });
    const r = await build(d, assets);
    expect(r.warnings.filter((w) => w.startsWith("warn.connector"))).toEqual([]);
  });

  describe("joints sit on the middle of the Base", () => {
    const u = 18 + 2 * fit.clearance + newDesign("cap").base.gap;
    const keys = (cells: number[][]): BaseKey[] => {
      const sq = centredOnSwitch(capOutline("square", 18, 2));
      return cells.map(([c, r]) => ({ at: [c * u, r * u], outline: sq }));
    };
    const row4 = () => keys([[-1.5, 0], [-0.5, 0], [0.5, 0], [1.5, 0]]);
    const grid = () => keys([[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]);
    const mid = (a: { foot: { bounds(): { min: number[]; max: number[] } } }) => {
      const b = a.foot.bounds();
      return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
    };
    /** Left/right joints on the mid-height, top/bottom on the mid-width; one valid piece. */
    function expectCentred(a: ReturnType<typeof multi>) {
      const [cx, cy] = mid(a);
      for (const j of a.joints) {
        if (j.side === "left" || j.side === "right") expect(j.at[1]).toBeCloseTo(cy, 3);
        else expect(j.at[0]).toBeCloseTo(cx, 3);
      }
      valid(a.m);
      expect(a.m.decompose().length).toBe(1);
    }

    test("a 4-key row: top and bottom between the middle keys", () => {
      const a = multi(row4(), { top: "tab", bottom: "socket" });
      expectCentred(a);
      expect(role(a.joints, "tab").at[0]).toBeCloseTo(0, 3);
      // 85 mm wide: its corners stop the swing near ±2.5°.
      expectMates(a, "bottom", 2);
    });

    test("a 2x2 grid: left and right on one line, top and bottom too", () => {
      const lr = multi(grid(), { left: "tab", right: "socket" });
      expectCentred(lr);
      expectMates(lr, "right");
      expectCentred(multi(grid(), { top: "tab", bottom: "socket" }));
    });

    test("a cap on two switches: top and bottom on the middle, not over a switch", () => {
      const o = centredOnSwitch(capOutline("capsule", 40, 2));
      const opts = newDesign("cap").base;
      const foot = baseFootprint([{ at: [0, 0], outline: o }], opts, fit);
      const sw = placeSwitches(o, switchGround(o, foot, fit, baseLevels(opts, fit).wallTop), fit, 0).at;
      expect(sw.length).toBe(2);
      const a = multi([{ at: [0, 0], outline: o, switches: sw }], { top: "tab", bottom: "socket" });
      expectCentred(a);
      expect(role(a.joints, "tab").at[0]).toBeCloseTo(0, 3);
    });

    test("a heart: left and right at its mid-height, not on the switch", () => {
      const a = multi([{ at: [0, 0], outline: centredOnSwitch(capOutline("heart", 36.5, 2)) }], { left: "tab", right: "socket" });
      expectCentred(a);
      expect(Math.abs(mid(a)[1])).toBeGreaterThan(1);
    });
  });

  test("the joint face counts texture dots", () => {
    const a = base({ left: "tab", right: "socket" }, { texture: "dots", textureDepth: 0.8 });
    expect(role(a.joints, "socket").at[0]).toBeCloseTo(a.foot.bounds().max[0] + 0.8, 3);
    expectMates(a, "right");
  });

  test("which way the switch pins go", () => {
    expect(pinSide(ends({ right: "socket" }))).toBe("left");
    expect(pinSide(ends({ top: "socket", left: "tab" }))).toBe("bottom");
    expect(["top", "bottom"]).toContain(pinSide(ends({ left: "socket", right: "socket" }))!);
    // Left + bottom sockets: pins to a free side, opposite one of them.
    const p = pinSide(ends({ left: "socket", bottom: "socket" }))!;
    expect(["right", "top"]).toContain(p);
    expect(pinSide(ends({ left: "socket", right: "socket", top: "socket", bottom: "socket" }))).toBeNull();
  });

  // MX underside in its spec layout (pins toward +y): centre post, two pins, 5-pin side posts left out.
  const MX: [number, number, number][] = [[0, 0, 2], [-3.81, 2.54, 0.75], [2.54, 5.08, 0.75]];
  for (const socket of SIDES)
    test(`the next tab clears an MX switch, socket on the ${socket}, pins toward pinSide`, () => {
      const a = base({ [socket]: "socket", [OPPOSITE[socket]]: "tab" });
      const d = sideDir(socket);
      const pitch = jointPitch(d[0] ? a.foot : a.foot.rotate(90));
      const next = a.m.translate([d[0] * pitch, d[1] * pitch, 0]);
      const pins = pinSide(a.opts.connectors)!;
      const [px, py] = sideDir(pins);
      // Turn the +y layout to point at `pins`.
      const turn = ([x, y]: [number, number]): [number, number] => [x * py + y * px, -x * px + y * py];
      const tip = -(5 + 3.3);
      for (const [x, y, r] of MX) {
        const [u, v] = turn([x, y]);
        expect(K().Manifold.cylinder(-tip, r, r, 24).translate([u, v, tip]).intersect(next).volume()).toBeLessThan(1e-3);
      }
    });

  test("two sockets on a small Base: tongues never cross, and a short one warns", async () => {
    for (const c of [{ right: "socket", top: "socket" }, { left: "socket", right: "socket" }, { left: "socket", right: "socket", top: "socket", bottom: "socket" }] as Partial<Connectors>[]) {
      const { m, joints } = base(c);
      valid(m);
      expect(m.decompose().length).toBe(1);
      expect(joints.some((j) => j.len < H.tongueMin)).toBe(true);
      const d = newDesign("cap");
      d.base.connectors = ends(c);
      expect((await build(d, assets)).warnings).toContain("warn.connectorTongue");
    }
    // A big cap fits opposite sockets with full tongues.
    const big = base({ left: "socket", right: "socket" }, {}, "square", 40);
    expect(big.m.decompose().length).toBe(1);
    expect(big.joints.every((j) => j.len >= H.tongueMin)).toBe(true);
  });

  test("sockets on all four sides warn", async () => {
    const d = newDesign("cap");
    d.base.connectors = ends({ left: "socket", right: "socket", top: "socket", bottom: "socket" });
    const r = await build(d, assets);
    expect(r.warnings).toContain("warn.connectorSwitch");
  });

  test("the tongue top stays 1.6 above the bed for any floor", () => {
    for (const floor of [1.0, 3.0]) {
      const { m, joints, bottom } = base({ left: "tab", right: "socket" }, { floor });
      valid(m);
      expect(m.decompose().length).toBe(1);
      const x = role(joints, "socket").at[0] - 6;
      // Tongue material just under 1.6, room just over it.
      expect(m.intersect(box(x - 0.5, x + 0.5, 2.5, 3.5, bottom + 1.3, bottom + 1.5)).volume()).toBeGreaterThan(0.15);
      expect(m.intersect(box(x - 0.5, x + 0.5, 2.5, 3.5, bottom + 1.7, bottom + 1.9)).volume()).toBeLessThan(1e-3);
    }
  });

  test("keyring loops leave connector sides alone", () => {
    const a = base({ left: "tab", right: "socket" }, { loop: "both" });
    expect(loopCentres(a.foot, a.opts.loop, 1.75, connectorSides(a.opts)).length).toBe(0);
    const b = base({ left: "tab" }, { loop: "both" });
    expect(loopCentres(b.foot, b.opts.loop, 1.75, connectorSides(b.opts)).length).toBe(1);
    const c = base({ top: "socket" }, { loop: "topBottom" });
    const pts = loopCentres(c.foot, c.opts.loop, 1.75, connectorSides(c.opts));
    expect(pts.length).toBe(1);
    expect(pts[0][1]).toBeLessThan(0);
  });

  test("supports sit under the tab, past the face only", () => {
    const { m, sup, joints, bottom } = base({ left: "tab", right: "tab" });
    expect(sup.length).toBe(2);
    for (const s of sup) {
      valid(s);
      const b = s.boundingBox();
      expect(b.min[2]).toBeCloseTo(bottom, 3);
      // Past the face: the arm inside it stands on the bed.
      const j = joints.find((q) => (q.side === "right") === b.min[0] > 0)!;
      if (j.side === "right") expect(b.min[0]).toBeCloseTo(j.at[0], 3);
      else expect(b.max[0]).toBeCloseTo(j.at[0], 3);
      expect(s.intersect(m).volume()).toBeLessThan(s.volume() * 0.7);
    }
  });

  test("textured walls keep the joint attached", () => {
    for (const texture of ["ribs", "sawtooth", "dots"] as const) {
      const { m } = base({ left: "tab", right: "socket", top: "tab" }, { texture, textureDepth: 1.5 });
      valid(m);
      expect(m.decompose().length).toBe(1);
    }
  });

  test("the default cap raises no connector warning on any single socket", async () => {
    for (const side of SIDES) {
      const d = newDesign("cap");
      d.base.connectors = ends({ [side]: "socket", [OPPOSITE[side]]: "tab" });
      const r = await build(d, assets);
      expect(r.warnings.filter((w) => w.startsWith("warn.connector"))).toEqual([]);
    }
  });

  test("a top tab takes the keyring, hanging upward", async () => {
    const d = newDesign("cap");
    d.base.loop = "none";
    d.base.connectors = ends({ top: "tab" });
    const r = await build(d, assets);
    expect(r.keyring?.dir).toEqual([0, 1]);
  });

  test("a fluted chain joined by H-connectors: links mate, the last has no socket, the first tab takes the keyring", async () => {
    const d = newDesign("fluted");
    d.base.join = "connector";
    d.keys = [..."LOVE"].map((c) => ({ ...d.keys[0], deco: { type: "text" as const, text: c, font: "Fredoka-700" } }));
    const r = await build(d, assets);
    expect(r.warnings).toEqual([]);
    const bases = r.assembled.filter((p) => p.name.startsWith("Base"));
    expect(bases.length).toBe(4);
    const groups = r.print.filter((g) => g.name.startsWith("Base"));
    // Every link has one tab, so one support volume.
    for (const g of groups) expect(g.parts.filter((p) => p.role === "support").length).toBe(1);
    const toManifold = (mesh: { vertices: Float32Array; triangles: Uint32Array }) => {
      const m = new (K().Mesh)({ numProp: 3, vertProperties: mesh.vertices, triVerts: mesh.triangles });
      m.merge();
      return new (K().Manifold)(m);
    };
    const ms = bases.map((b) => toManifold(b.mesh));
    for (let i = 0; i + 1 < ms.length; i++) expect(ms[i].intersect(ms[i + 1]).volume()).toBeLessThan(1e-3);
    expect(r.keyring?.dir).toEqual([-1, 0]);
    expect(r.keyring!.at[0]).toBeLessThan(ms[0].boundingBox().min[0] + H.holeOut + 0.01);
  });

  test("the 3MF carries the tab supports as enforcers and turns support on for that plate only", async () => {
    const d = newDesign("cap");
    d.base.connectors = ends({ left: "tab", right: "socket" });
    const r = await build(d, assets);
    const plates = packPlates(r.print, { byColour: true });
    const out = platesTo3mf("t", plates, null);
    // The enforcer adds no filament.
    expect(out.filaments.length).toBe(new Set(r.print.flatMap((g) => g.parts.map((p) => p.color.toUpperCase()))).size);
    const settings = strFromU8(unzipSync(out.data)["Metadata/model_settings.config"]);
    expect(settings).toContain('subtype="support_enforcer"');
    expect(settings).toContain('key="support_type" value="normal(manual)"');
    const plain = newDesign("cap");
    const r2 = await build(plain, assets);
    const s2 = strFromU8(unzipSync(platesTo3mf("t", packPlates(r2.print), null).data)["Metadata/model_settings.config"]);
    expect(s2).not.toContain("support");
  });

  test("Designs saved with the first H-connector presets keep their ends", () => {
    const fresh = newDesign("cap").base;
    const old = (connector: string, connectorSide: "left" | "right") => upgradeBase(fresh, { ...fresh, connectors: undefined, connector, connectorSide } as never).connectors;
    expect(old("open", "left")).toEqual(ends({ left: "tab", right: "socket" }));
    expect(old("open", "right")).toEqual(ends({ right: "tab", left: "socket" }));
    expect(old("close", "right")).toEqual(ends({ right: "tab" }));
    expect(old("double", "left")).toEqual(ends({ left: "tab", right: "tab" }));
    expect(old("none", "left")).toEqual(NO_CONNECTORS);
  });
});
