import { tracePicture, type Img } from "@cs/picture/process.ts";
import type { Traced } from "@cs/geometry/decoration.ts";
import { nodeFont } from "../scripts/node-assets.ts";
import { newTagDesign, type TagDesign } from "../src/design/types.ts";

/** A yellow face with two dark eyes, on a transparent background. */
export function face(): Img {
  const w = 160, h = 160;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const r = Math.hypot(x - 80, y - 80);
      let c = [255, 255, 255, 0];
      if (r < 64) c = [250, 200, 20, 255];
      if (Math.hypot(x - 56, y - 68) < 10 || Math.hypot(x - 104, y - 68) < 10) c = [30, 30, 30, 255];
      data.set(c, (y * w + x) * 4);
    }
  return { width: w, height: h, data };
}

/** A Tag Design with the face traced into `colors` colours, plus its assets. */
export function withFace(colors = 2): { design: TagDesign; assets: { font: typeof nodeFont; traced: Record<string, Traced> } } {
  const design = newTagDesign();
  design.picture.image = "face";
  design.picture.colors = colors;
  const traced = tracePicture(face(), design.picture);
  design.picture.palette = traced.colours.map(() => "#F7D046").map((c, i) => (i === 0 ? c : "#1E1E1E"));
  return { design, assets: { font: nodeFont, traced: { face: traced } } };
}
