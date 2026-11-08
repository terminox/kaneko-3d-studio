import { beforeAll, describe, expect, test } from "bun:test";
import { K, loadKernel, type Manifold } from "../src/geometry/kernel.ts";
import { baseFootprint, baseJoints, baseLevels, baseSupports, buildBase, loopCentres, connectorSides } from "../src/geometry/base.ts";
import { capOutline } from "../src/geometry/outline.ts";
import { DEFAULT_FIT } from "../src/geometry/switch.ts";
import { newDesign, type BaseOptions, type Connector } from "../src/design/types.ts";
import { H, holeCentre, jointPitch } from "../src/geometry/connector.ts";
import { build, packPlates } from "../src/geometry/build.ts";
import { platesTo3mf } from "../src/export/bambu.ts";
import { strFromU8, unzipSync } from "fflate";
import { assets } from "./helpers.ts";

beforeAll(async () => {
  await loadKernel();
});

const fit = DEFAULT_FIT;
const keys = () => [{ at: [0, 0] as [number, number], outline: capOutline("square", 18, 2) }];

function base(over: Partial<BaseOptions> = {}) {
  const opts = { ...newDesign("cap").base, ...over };
  const k = keys();
  const foot = baseFootprint(k, opts, fit);
  return { opts, foot, m: buildBase(k, opts, fit, foot), joints: baseJoints(k, opts, fit, foot), bottom: baseLevels(opts, fit).bottom };
}

function valid(m: Manifold) {
  expect(m.status()).toBe("NoError");
  expect(m.isEmpty()).toBe(false);
  expect(m.volume()).toBeGreaterThan(1);
}

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
  K().Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);

describe("H-connector", () => {
  for (const connector of ["open", "close", "double"] as Connector[])
    for (const side of ["left", "right"] as const)
      test(`${connector}, tab ${side}: one valid piece`, () => {
        const { m } = base({ connector, connectorSide: side });
        valid(m);
        // The tongue stays attached: still one piece.
        expect(m.decompose().length).toBe(1);
      });

  test("tab and socket are where Bubbly puts them", () => {
    const { m, joints, bottom, foot } = base({ connector: "open", connectorSide: "left" });
    const tab = joints.find((j) => j.role === "tab")!;
    const socket = joints.find((j) => j.role === "socket")!;
    expect(tab.side).toBe("left");
    expect(socket.side).toBe("right");
    const fb = foot.bounds();
    expect(socket.edge).toBeCloseTo(fb.max[0], 3);
    const [hx, hy] = holeCentre(tab);
    expect(hx).toBeCloseTo(fb.min[0] - H.holeOut, 3);
    // Hole open through the tab, tab material around it at z 2–5.
    const probe = K().Manifold.cylinder(20, H.holeD / 2 - 0.15, H.holeD / 2 - 0.15, 32).translate([hx, hy, bottom - 5]);
    expect(m.intersect(probe).volume()).toBeLessThan(1e-3);
    expect(m.intersect(box(hx - 4, hx - 2.5, -1, 1, bottom + 2.1, bottom + 4.9)).volume()).toBeGreaterThan(1.4 * 2 * 2.7);
    expect(m.intersect(box(hx - 4, hx - 2.5, -1, 1, bottom, bottom + 1.9)).volume()).toBeLessThan(1e-3);
    // Pin 3 mm inside the edge, standing to z 4.6.
    const px = socket.edge - H.pinIn;
    expect(m.intersect(box(px - 1, px, -0.5, 0.5, bottom + 4.0, bottom + 4.4)).volume()).toBeGreaterThan(0.3);
    expect(m.intersect(box(px - 1.5, px + 1.5, -1.5, 1.5, bottom + 4.7, bottom + 5.3)).volume()).toBeLessThan(1e-3);
    // Slits through the floor beside the tongue.
    for (const y of [4.9, -4.9]) expect(m.intersect(box(socket.edge - 15, socket.edge, y - 0.05, y + 0.05, bottom - 1, bottom + 1.6)).volume()).toBeLessThan(1e-3);
    // The window is open above the tongue.
    for (const [y0, y1] of [[2.3, 4.5], [-4.5, -2.3]]) expect(m.intersect(box(socket.edge - 7, socket.edge + 1, y0, y1, bottom + 1.7, bottom + 5.3)).volume()).toBeLessThan(1e-3);
  });

  test("two Bases join: no overlap, the pin goes through the hole, and they swing", () => {
    const { m, joints, foot, bottom } = base({ connector: "open", connectorSide: "left" });
    const socket = joints.find((j) => j.role === "socket")!;
    const pitch = jointPitch(foot, 0);
    const next = m.translate([pitch, 0, 0]);
    expect(m.intersect(next).volume()).toBeLessThan(1e-3);
    // The pin (A) sits in B's hole: a probe inside the pin hits A, not B.
    const px = socket.edge - H.pinIn;
    const probe = K().Manifold.cylinder(2.5, 1.9, 1.9, 32).translate([px, 0, bottom + 2.05]);
    expect(probe.intersect(m).volume()).toBeGreaterThan(1);
    expect(probe.intersect(next).volume()).toBeLessThan(1e-3);
    // B's tab is inside A's window.
    const nextTabHole = pitch + holeCentre(joints.find((j) => j.role === "tab")!)[0];
    expect(nextTabHole).toBeCloseTo(px, 3);
    // Swing ±5° about the pin.
    for (const deg of [5, -5]) {
      const swung = next.translate([-px, 0, 0]).rotate([0, 0, deg]).translate([px, 0, 0]);
      expect(m.intersect(swung).volume()).toBeLessThan(1e-3);
    }
  });

  test("the next tab clears an MX switch put in with its pins away from the socket", () => {
    const { m, joints, foot } = base({ connector: "open", connectorSide: "left" });
    const next = m.translate([jointPitch(foot, 0), 0, 0]);
    // MX underside, pins pointing away from the socket (-x): rotate the spec layout +90°.
    const tip = -(5 + 3.3);
    const post = (x: number, y: number, r: number) => K().Manifold.cylinder(-tip, r, r, 24).translate([x, y, tip]);
    const rot = ([x, y]: [number, number]): [number, number] => [-y, x];
    const pins = [
      post(0, 0, 2),
      post(...rot([-3.81, 2.54]), 0.75),
      post(...rot([2.54, 5.08]), 0.75),
      post(...rot([-5.08, 0]), 0.9),
      post(...rot([5.08, 0]), 0.9),
    ];
    for (const p of pins) expect(p.intersect(next).volume()).toBeLessThan(1e-3);
    expect(joints.length).toBe(2);
  });

  test("the tongue top stays 1.6 above the bed for any floor", () => {
    for (const floor of [1.0, 3.0]) {
      const { m, joints, bottom } = base({ connector: "open", floor });
      valid(m);
      expect(m.decompose().length).toBe(1);
      const s = joints.find((j) => j.role === "socket")!;
      const x = s.side === "right" ? s.edge - 6 : s.edge + 6;
      // Tongue material just under 1.6, room just over it.
      expect(m.intersect(box(x - 0.5, x + 0.5, 2.5, 3.5, bottom + 1.3, bottom + 1.5)).volume()).toBeGreaterThan(0.15);
      expect(m.intersect(box(x - 0.5, x + 0.5, 2.5, 3.5, bottom + 1.7, bottom + 1.9)).volume()).toBeLessThan(1e-3);
    }
  });

  test("keyring loops leave connector sides alone", () => {
    const { opts, foot } = base({ connector: "open", connectorSide: "left", loop: "both" });
    expect(loopCentres(foot, opts.loop, 1.75, connectorSides(opts)).length).toBe(0);
    const { opts: o2, foot: f2 } = base({ connector: "close", connectorSide: "left", loop: "both" });
    expect(loopCentres(f2, o2.loop, 1.75, connectorSides(o2)).length).toBe(1);
  });

  test("supports sit under the tab, outside the Base", () => {
    const opts = { ...newDesign("cap").base, connector: "double" as Connector };
    const k = keys();
    const foot = baseFootprint(k, opts, fit);
    const sup = baseSupports(k, opts, fit, foot);
    expect(sup.length).toBe(2);
    const m = buildBase(k, opts, fit, foot);
    for (const s of sup) {
      valid(s);
      expect(s.boundingBox().min[2]).toBeCloseTo(baseLevels(opts, fit).bottom, 3);
      // Only the tab overlaps the support volume.
      expect(s.intersect(m).volume()).toBeLessThan(s.volume() * 0.7);
    }
  });

  test("textured walls keep the tab attached", () => {
    for (const texture of ["ribs", "sawtooth", "dots"] as const) {
      const { m } = base({ connector: "open", texture, textureDepth: 1.5 });
      valid(m);
      expect(m.decompose().length).toBe(1);
    }
  });

  test("the default cap raises no connector warning", async () => {
    const d = newDesign("cap");
    d.base.connector = "open";
    const r = await build(d, assets);
    expect(r.warnings.filter((w) => w.startsWith("warn.connector"))).toEqual([]);
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
    expect(r.keyring?.dir).toBe(-1);
    expect(r.keyring!.at[0]).toBeLessThan(ms[0].boundingBox().min[0] + H.holeOut + 0.01);
  });

  test("the 3MF carries the tab supports as enforcers and turns support on for that plate only", async () => {
    const d = newDesign("cap");
    d.base.connector = "open";
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
});
