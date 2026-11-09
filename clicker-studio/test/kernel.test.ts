import { beforeAll, expect, test } from "bun:test";
import { loadKernel, release, trackedCount } from "../src/geometry/kernel.ts";
import { build } from "../src/geometry/build.ts";
import { newDesign } from "../src/design/types.ts";
import { assets } from "./helpers.ts";

beforeAll(async () => {
  await loadKernel();
});

test("the kernel frees every object a build made once its results are plain data, and builds again", async () => {
  release();
  const first = await build(newDesign(), assets);
  expect(trackedCount()).toBeGreaterThan(100);
  expect(release()).toBeGreaterThan(100);
  expect(trackedCount()).toBe(0);
  // The meshes handed out are copies, so they survive the release.
  for (const p of first.assembled) expect(p.mesh.triangles.length).toBeGreaterThan(0);
  const again = await build(newDesign(), assets);
  expect(again.assembled.length).toBe(first.assembled.length);
  expect(release()).toBeGreaterThan(100);
});
