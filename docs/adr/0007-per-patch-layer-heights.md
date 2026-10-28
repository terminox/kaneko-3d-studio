# Layer heights: each picture patch can stand at its own height

The owner wanted raised pictures with depth: some parts higher than others, like stacked paper cut-outs, instead of every colour at one Decoration height. It applies to Clicker Studio's Picture kind, to picture Decorations on keys, and to Tag Studio's pictures.

A **patch** is one connected island of one traced colour (`clicker-studio/src/geometry/patches.ts`). Each patch takes its height from the first match in this list:
1. Its own height, a pin set by clicking it in the 3D preview.
2. Its colour's height.
3. The default: the Decoration height, or Tag Studio's Raised height.

The owner's decisions:
- Heights are set per patch. Colour rows set every patch of a colour at once; clicking a patch overrides it alone, and Shift-click picks several. "Reset to colour" removes the override.
- The range is 0–8 mm in 0.2 mm steps. 0 makes the patch flush, inlaid 0.6 mm. Above 4 mm the slider turns amber and a warning shows.
- Raised patches are solid in their own colour all the way down, with flat tops and straight walls.
- New pictures start flat, so existing Designs don't change. **Make it pop** steps patches up by how many other patches surround them (0.8 mm per level, capped at 4 mm). **Flatten** resets everything.
- Heights work only in the Raised style. Inlay prints face down, so its top must be flat. Inlay stays the default for picture clickers, and the Picture card has a Raised/Inlay switch in both modes.
- Tag Studio's name and rings keep the single Raised height.
- There's no price change. The tools show in Simple and Advanced.

## Remembering a patch

A patch is remembered by a pin: a point inside it, 0–1 across the traced picture. Pins aren't stored as patch indices. This means:
- A retrace (a new colour count, background strength or AI cartoon) gives each pin to whatever patch now covers its spot.
- A re-crop or rotation moves the pins through the source image (`remapPins`), and drops pins that end up cropped away.
- Colour heights reset whenever the palette resets, because the colours re-sort.
- A new picture clears all heights.

## Considered options

- **Heights per colour only.** Simpler, but the owner wanted the left eye to stand apart from the right.
- **Painting regions by hand.** The most control, but far more UI than clicking the patches the tracer already makes.
- **Patch indices instead of pins.** Indices change with every retrace, so heights would land on the wrong patches.

## Consequences

- `Layer` carries an optional `h` and `patch` reference. `buildCap` and Tag Studio merge areas of one colour and height before extruding, so a flat picture still costs one extrusion per colour, and the 3MF still has one part per colour.
- Builds return the patches' footprints (`PatchInfo`) for picking. The preview raycasts the model and finds the patch under the hit with a point-in-polygon test (`design/heights.ts`, which needs no kernel).
- The shared logic lives in Clicker Studio and Tag Studio imports it through `@cs`. Each app has its own copy of the panel block and the viewport picking, following ADR 0006.
