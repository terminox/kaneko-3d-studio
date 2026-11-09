import { beforeAll, expect, test } from "bun:test";
import { loadKernel, K } from "@cs/geometry/kernel.ts";
import { TOWER } from "@cs/geometry/build.ts";
import type { Mesh } from "@mm/pipeline/mesh.ts";
import { buildAll, buildTag } from "../src/geometry/tag.ts";
import { tagNames } from "../src/design/types.ts";
import { withFace } from "./helpers.ts";
import { tracePicture } from "@cs/picture/process.ts";
import { nodeFont } from "../scripts/node-assets.ts";
import { newTagDesign, upgradeTag } from "../src/design/types.ts";
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

test("a one-layer tag is a flat cut-out: every colour from the bed to the thickness, in one piece", async () => {
  const { design, assets } = withFace(2);
  design.plate.layers = 1;
  // Heights are ignored with one layer.
  design.picture.heights = { colour: [null, 3], pins: [] };
  const r = await buildTag(design, "Miyu", assets);
  expect(r.warnings).toEqual([]);
  const T = design.plate.thickness;
  // Frame + loop (white), face, eyes, name.
  expect(r.group.parts.map((p) => p.color).sort()).toEqual(["#1E1E1E", "#2F5FB3", "#F7D046", "#FFFFFF"]);
  expect(r.group.parts[0].name).toBe("Miyu plate");
  for (const p of r.group.parts) {
    const b = box(p.mesh);
    expect(b.minZ).toBeCloseTo(0, 3);
    expect(b.maxZ).toBeCloseTo(T, 3);
  }
  expect(r.patches.every((p) => p.h === 0 && p.top === T)).toBe(true);
  const solids = r.group.parts.map((p) => manifold(p.mesh));
  for (const s of solids) expect(s.status()).toBe("NoError");
  for (let i = 0; i < solids.length; i++)
    for (let j = i + 1; j < solids.length; j++) expect(solids[i].intersect(solids[j]).volume()).toBeLessThan(0.01);
  expect(K().Manifold.union(solids).decompose().length).toBe(1);
  expect(r.loop).not.toBeNull();
});

const pieces = (parts: { mesh: Mesh }[]) => K().Manifold.union(parts.map((p) => manifold(p.mesh))).decompose().length;

test("one layer, no border, no loop: the picture alone, in its own colours only", async () => {
  const { design, assets } = withFace(2);
  design.plate = { ...design.plate, layers: 1, border: 0 };
  design.loop.side = "none";
  const r = await buildTag(design, "", assets);
  expect(r.group.parts.map((p) => p.color).sort()).toEqual(["#1E1E1E", "#F7D046"]);
  expect(r.group.parts[0].name).toBe("Tag #F7D046");
  expect(r.warnings).toEqual([]);
  expect(r.loop).toBeNull();
});

test("one layer, no border, no loop: picture colours that match the plate colour stay", async () => {
  const { design, assets } = withFace(2);
  design.plate = { ...design.plate, layers: 1, border: 0 };
  design.loop.side = "none";
  // The face in the plate colour (white): there is no plate, but the face is still there.
  design.picture.palette = ["#FFFFFF", "#1E1E1E"];
  const r = await buildTag(design, "Miyu", assets);
  expect(r.group.parts.map((p) => p.color).sort()).toEqual(["#1E1E1E", "#2F5FB3", "#FFFFFF"]);
  const face = box(r.group.parts.find((p) => p.color === "#FFFFFF")!.mesh);
  expect(face.maxX - face.minX).toBeGreaterThan(39);
});

test("one layer, no border: the loop grips the picture on every side and the hole goes through", async () => {
  const { design, assets } = withFace(2);
  design.plate = { ...design.plate, layers: 1, border: 0 };
  for (const side of ["top", "left", "right"] as const) {
    design.loop.side = side;
    const r = await buildTag(design, "", assets);
    expect(r.warnings).toEqual([]);
    // Loop (white), face, eyes: one solid piece together.
    expect(r.group.parts.map((p) => p.color).sort()).toEqual(["#1E1E1E", "#F7D046", "#FFFFFF"]);
    expect(pieces(r.group.parts)).toBe(1);
    const loop = manifold(r.group.parts.find((p) => p.color === "#FFFFFF")!.mesh);
    const face = manifold(r.group.parts.find((p) => p.color === "#F7D046")!.mesh);
    expect(loop.intersect(face).volume()).toBeLessThan(0.01);
    const [x, y] = r.loop!;
    const probe = K().Manifold.cylinder(10, design.loop.hole / 2 - 0.2, design.loop.hole / 2 - 0.2, 24).translate([x, y, -1]);
    expect(loop.add(face).intersect(probe).volume()).toBeLessThan(0.01);
    const b = box(r.group.parts[0].mesh);
    expect(b.minZ).toBeCloseTo(0, 3);
    expect(b.maxZ).toBeCloseTo(design.plate.thickness, 3);
  }
});

test("one layer, no border: loose letters warn, a name laid over the picture holds together", async () => {
  const { design, assets } = withFace(2);
  design.plate = { ...design.plate, layers: 1, border: 0 };
  const apart = await buildTag(design, "Miyu", assets);
  expect(apart.warnings).toEqual(["warn.pieces"]);
  expect(pieces(apart.group.parts)).toBeGreaterThan(1);

  design.gap = -8;
  const over = await buildTag(design, "Miyu", assets);
  expect(over.warnings).toEqual([]);
  expect(pieces(over.group.parts)).toBe(1);
  // The name sits on top of the face, not the other way round.
  const nameBox = box(over.group.parts.find((p) => p.color === design.colours.name)!.mesh);
  expect(nameBox.maxY).toBeGreaterThan(-20);
});

test("one layer, no border: a loop over the gap between letters lands on top of a letter", async () => {
  const design = newTagDesign();
  design.plate = { ...design.plate, layers: 1, border: 0 };
  design.spacing = 1.5;
  const r = await buildTag(design, "B o", { font: nodeFont, traced: {} });
  // B, o, and the loop on top of the taller B: two loose pieces, not three.
  expect(r.warnings).toEqual(["warn.pieces"]);
  expect(pieces(r.group.parts)).toBe(2);
  const [x, y] = r.loop!;
  const name = box(r.group.parts.find((p) => p.color === design.colours.name)!.mesh);
  expect(x).toBeLessThan(0);
  expect(y).toBeGreaterThan(name.maxY);
});

test("a saved Design without layers loads as two layers", () => {
  const d = upgradeTag({ plate: { thickness: 3, relief: 1.2, border: 2.5, fillHoles: true } as never });
  expect(d.plate.layers).toBe(2);
});

test("a photo-sized picture: hundreds of patches build in well under a second each, without overlaps, in one piece", async () => {
  // A 4-colour checker whose cells never touch a cell of their own colour, not
  // even at a corner: every cell is its own patch, traced on its own, so
  // neighbours overlap by hairlines along every shared edge until they're cut.
  const w = 240, h = 240, data = new Uint8ClampedArray(w * h * 4);
  const tones = [[250, 200, 20], [30, 30, 30], [40, 120, 220], [220, 60, 90]];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) data.set([...tones[(Math.floor(x / 10) % 2) + 2 * (Math.floor(y / 10) % 2)], 255], (y * w + x) * 4);
  const design = newTagDesign();
  design.picture.image = "grid";
  design.picture.colors = 4;
  design.picture.width = 40;
  const traced = tracePicture({ width: w, height: h, data }, design.picture);
  design.picture.palette = traced.colours;
  design.gap = -6; // the name lies over the picture too
  const t = performance.now();
  const r = await buildTag(design, "Ann", { font: nodeFont, traced: { grid: traced } });
  expect(performance.now() - t).toBeLessThan(3000);
  expect(r.patches.length).toBeGreaterThan(400);
  expect(r.group.parts.length).toBe(6);
  const solids = r.group.parts.map((p) => manifold(p.mesh));
  for (let i = 0; i < solids.length; i++)
    for (let j = i + 1; j < solids.length; j++) expect(solids[i].intersect(solids[j]).volume()).toBeLessThan(0.01);
  expect(pieces(r.group.parts)).toBe(1);
});
