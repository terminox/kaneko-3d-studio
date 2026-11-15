// Smallest warning-free sizes (for the README and UI limits): each cap shape,
// and the square section and height a split model needs in each style.
import { K, loadKernel } from "../src/geometry/kernel.ts";
import { build, toMesh } from "../src/geometry/build.ts";
import { newDesign, type CapShape } from "../src/design/types.ts";
import { writeBinaryStl } from "../../model-maker/src/pipeline/mesh.ts";
import { nodeAssets } from "./node-assets.ts";
await loadKernel();
const shapes: CapShape[] = ["square", "capsule", "circle", "heart", "cloud", "bear", "cat", "flower", "hexagon", "octagon", "keycap"];
for (const shape of shapes) {
  let size = 18;
  for (; size <= 40; size += 0.5) {
    const d = newDesign("cap");
    d.cap.shape = shape;
    d.cap.size = size;
    d.keys[0].deco = { type: "none" };
    const r = await build(d, nodeAssets());
    if (!r.warnings.length) break;
  }
  console.log(`${shape.padEnd(8)} ${size} mm`);
}

/** Does a side × side × height block split with a switch and no warnings? */
async function splits(style: "plug" | "plain", side: number, height: number) {
  const d = newDesign("split");
  d.files["model-block"] = `data:model/stl;base64,${Buffer.from(writeBinaryStl([toMesh(K().Manifold.cube([side, side, height]))])).toString("base64")}`;
  d.model = { file: "model-block", name: "block.stl", width: side, cut: 0, rotate: [0, 0, 0] };
  d.split = { ...d.split!, style };
  return !(await build(d, nodeAssets())).warnings.length;
}
for (const style of ["plain", "plug"] as const) {
  let side = 15, height = 10;
  while (!(await splits(style, side, 60))) side += 0.5;
  while (!(await splits(style, 60, height))) height += 0.5;
  console.log(`split ${style.padEnd(5)} section ${side} mm square, height ${height} mm`);
}
