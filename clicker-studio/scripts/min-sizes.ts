// Smallest cap size per shape that raises no warnings (for the README and UI limits).
import { loadKernel } from "../src/geometry/kernel.ts";
import { build } from "../src/geometry/build.ts";
import { newDesign, type CapShape } from "../src/design/types.ts";
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
