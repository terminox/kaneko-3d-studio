import { beforeAll, expect, test } from "bun:test";
import { loadKernel, K } from "@cs/geometry/kernel.ts";
import { TOWER } from "@cs/geometry/build.ts";
import type { Mesh } from "@mm/pipeline/mesh.ts";
import { buildAll, buildTag } from "../src/geometry/tag.ts";
import { tagNames } from "../src/design/types.ts";
import { withFace } from "./helpers.ts";
import { nodeFont } from "../scripts/node-assets.ts";
import { newTagDesign } from "../src/design/types.ts";
import { FLUSH_DEPTH, emptyHeights, setPatchColours, setPatchHeights } from "@cs/design/heights.ts";

beforeAll(async () => {
  await loadKernel();
});

const manifold = (m: Mesh) => new (K().Manifold)(new (K().Mesh)({ numProp: 3, vertProperties: m.vertices, triVerts: m.triangles }));

function box(m: Mesh) {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < m.vertices.length; i += 3) {
    minX = Math.min(minX, m.vertices[i]), maxX = Math.max(maxX, m.vertices[i]);
    minY = Math.min(minY, m.vertices[i + 1]), maxY = Math.max(maxY, m.vertices[i + 1]);
    minZ = Math.min(minZ, m.vertices[i + 2]), maxZ = Math.max(maxZ, m.vertices[i + 2]);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

test("picture + name: one plate piece, closed parts that don't overlap, one part per colour", async () => {
  const { design, assets } = withFace(2);
  const r = await buildTag(design, "Miyu", assets);
  expect(r.warnings).toEqual([]);
  const solids = r.group.parts.map((p) => manifold(p.mesh));
  for (const s of solids) expect(s.status()).toBe("NoError");
  // Plate (white), face yellow, eyes black, name blue.
  expect(r.group.parts.map((p) => p.color).sort()).toEqual(["#1E1E1E", "#2F5FB3", "#F7D046", "#FFFFFF"]);
  expect(solids[0].decompose().length).toBe(1);
  for (let i = 0; i < solids.length; i++)
    for (let j = i + 1; j < solids.length; j++) expect(solids[i].intersect(solids[j]).volume()).toBeLessThan(0.01);
  // Plate 0–3 mm, artwork up to 4.2 mm.
  const plate = box(r.group.parts[0].mesh);
  expect(plate.minZ).toBeCloseTo(0, 3);
  expect(plate.maxZ).toBeCloseTo(3, 3);
  expect(Math.max(...r.group.parts.map((p) => box(p.mesh).maxZ))).toBeCloseTo(4.2, 3);
  expect(r.loop).not.toBeNull();
});

test("the name goes on the chosen side of the picture", async () => {
  const { design, assets } = withFace(1);
  const nameBox = async (position: typeof design.position) => {
    design.position = position;
    const r = await buildTag(design, "Kaneko", assets);
    return box(r.group.parts.find((p) => p.color === design.colours.name)!.mesh);
  };
  const below = await nameBox("below"), above = await nameBox("above"), left = await nameBox("left"), right = await nameBox("right");
  // The 40 mm face is centred on the origin.
  expect(below.maxY).toBeLessThan(-20);
  expect(above.minY).toBeGreaterThan(20);
  expect(left.maxX).toBeLessThan(-20);
  expect(right.minX).toBeGreaterThan(20);
});

test("a name far from the picture still hangs on one plate", async () => {
  const { design, assets } = withFace(1);
  design.gap = 15;
  const r = await buildTag(design, "Far", assets);
  expect(manifold(r.group.parts[0].mesh).decompose().length).toBe(1);
});

test("name only, picture only, and an empty tag", async () => {
  const nameOnly = await buildTag(newTagDesign(), "คาเนโกะ", { font: nodeFont, traced: {} });
  expect(nameOnly.warnings).toEqual([]);
  expect(nameOnly.group.parts.length).toBe(2);
  const b = box(nameOnly.group.parts[1].mesh);
  // Thai with a 10 mm letter height comes out a sensible size.
  expect(b.maxX - b.minX).toBeGreaterThan(25);
  expect(b.maxY - b.minY).toBeGreaterThan(8);

  const { design, assets } = withFace(2);
  const picOnly = await buildTag(design, "", assets);
  expect(picOnly.group.parts.length).toBe(3);

  const empty = await buildTag(newTagDesign(), "", { font: nodeFont, traced: {} });
  expect(empty.warnings).toContain("warn.empty");
});

test("outline rings add a colour each and sit between artwork and plate edge", async () => {
  const { design, assets } = withFace(1);
  design.rings = { count: 2, width: 1.5, colors: ["#FFFFFF", "#22305C"] };
  design.colours.plate = "#F4B6C8";
  const r = await buildTag(design, "Ann", assets);
  // Plate pink, ring 1 white, ring 2 navy, face yellow, name blue: 5 colours.
  expect(r.group.parts.length).toBe(5);
  expect(r.warnings).toContain("warn.over4");
  const solids = r.group.parts.map((p) => manifold(p.mesh));
  for (let i = 0; i < solids.length; i++)
    for (let j = i + 1; j < solids.length; j++) expect(solids[i].intersect(solids[j]).volume()).toBeLessThan(0.01);
});

test("the keyring loop goes on the chosen side, and none removes it", async () => {
  const { design, assets } = withFace(1);
  for (const side of ["top", "left", "right"] as const) {
    design.loop.side = side;
    const r = await buildTag(design, "Bo", assets);
    const plate = box(r.group.parts[0].mesh);
    const [x, y] = r.loop!;
    if (side === "top") expect(y).toBeGreaterThan(plate.maxY - design.loop.hole / 2 - design.loop.wall - 0.1);
    if (side === "left") expect(x).toBeLessThan(plate.minX + design.loop.hole / 2 + design.loop.wall + 0.1);
    if (side === "right") expect(x).toBeGreaterThan(plate.maxX - design.loop.hole / 2 - design.loop.wall - 0.1);
    // The hole goes right through.
    const probe = K().Manifold.cylinder(10, design.loop.hole / 2 - 0.2, design.loop.hole / 2 - 0.2, 24).translate([x, y, -1]);
    expect(manifold(r.group.parts[0].mesh).intersect(probe).volume()).toBeLessThan(0.01);
  }
  design.loop.side = "none";
  expect((await buildTag(design, "Bo", assets)).loop).toBeNull();
});

test("a class set of 20 names packs onto plates with the tower corner free", async () => {
  const { design, assets } = withFace(2);
  design.names = Array.from({ length: 20 }, (_, i) => `Kid ${i + 1}`).concat(["", "  "]);
  expect(tagNames(design).length).toBe(20);
  const r = await buildAll(design, assets);
  expect(r.tags).toBe(20);
  expect(r.plates.length).toBeGreaterThanOrEqual(1);
  for (const p of r.plates) {
    expect(p.tower).toBeDefined();
    for (const g of p.groups)
      for (const part of g.parts) {
        const b = box(part.mesh);
        expect(b.minX).toBeGreaterThanOrEqual(0);
        expect(b.maxX).toBeLessThanOrEqual(256);
        expect(b.maxX > 256 - 8 - TOWER.w - 6 && b.maxY > 256 - 8 - TOWER.d - 6).toBe(false);
      }
  }
});

test("picture patches stand at their own heights; the name keeps the Raised height", async () => {
  const { design, assets } = withFace(2);
  const flat = await buildTag(design, "Miyu", assets);
  // A face and two eyes.
  expect(flat.patches.map((p) => p.layer).sort()).toEqual([0, 1, 1]);
  expect(flat.patches.every((p) => p.h === design.plate.relief && p.owner === -1)).toBe(true);
  expect(flat.patches.filter((p) => p.layer === 1).every((p) => p.depth === 1)).toBe(true);

  // Eyes up to 3 mm as a colour, then one eye to 6 mm on its own.
  design.picture.heights = { colour: [null, 3], pins: [] };
  const eyes = flat.patches.filter((p) => p.layer === 1);
  setPatchHeights(design.picture.heights, [eyes[0]], 6);
  const r = await buildTag(design, "Miyu", assets);
  expect(r.patches.filter((p) => p.layer === 1).map((p) => p.h).sort()).toEqual([3, 6]);
  expect(r.warnings).toContain("warn.tall");
  const T = design.plate.thickness;
  const top = (color: string) => box(r.group.parts.find((p) => p.color === color)!.mesh).maxZ;
  expect(top("#1E1E1E")).toBeCloseTo(T + 6, 3);
  expect(top("#F7D046")).toBeCloseTo(T + design.plate.relief, 3);
  expect(top(design.colours.name)).toBeCloseTo(T + design.plate.relief, 3);
  const solids = r.group.parts.map((p) => manifold(p.mesh));
  for (let i = 0; i < solids.length; i++)
    for (let j = i + 1; j < solids.length; j++) expect(solids[i].intersect(solids[j]).volume()).toBeLessThan(0.01);
});

test("a 0 mm patch is inlaid flush into the plate", async () => {
  const { design, assets } = withFace(2);
  design.picture.heights = { colour: [0], pins: [] };
  const r = await buildTag(design, "", assets);
  const face = box(r.group.parts.find((p) => p.color === "#F7D046")!.mesh);
  expect(face.maxZ).toBeCloseTo(design.plate.thickness, 3);
  expect(face.minZ).toBeCloseTo(design.plate.thickness - FLUSH_DEPTH, 3);
  const solids = r.group.parts.map((p) => manifold(p.mesh));
  expect(solids[0].intersect(solids[1]).volume()).toBeLessThan(0.01);
});

test("a one-colour picture is one raisable patch", async () => {
  const { design, assets } = withFace(1);
  const r = await buildTag(design, "", assets);
  expect(r.patches.length).toBe(1);
});

test("a painted patch builds in its filament, on a one-colour picture too", async () => {
  const { design, assets } = withFace(2);
  const hs = (design.picture.heights ??= emptyHeights());
  const before = await buildTag(design, "", assets);
  const eye = before.patches.find((p) => p.layer === 1)!;
  setPatchColours(hs, [eye], "#D32F2F");
  const r = await buildTag(design, "", assets);
  expect(r.patches.filter((p) => p.painted).map((p) => p.color)).toEqual(["#D32F2F"]);
  expect(r.group.parts.map((p) => p.color)).toContain("#D32F2F");
  expect(r.group.parts.map((p) => p.color)).toContain("#1E1E1E");

  const one = withFace(1);
  const whole = (await buildTag(one.design, "", one.assets)).patches;
  setPatchColours((one.design.picture.heights ??= emptyHeights()), whole, "#D32F2F");
  const painted = await buildTag(one.design, "", one.assets);
  expect(painted.group.parts.map((p) => p.color)).toContain("#D32F2F");
});
