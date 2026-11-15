# Split a model: any STL becomes an MX clicker's two halves

PrintPal's Fidget Clicker Maker has a "Cut Into a Model" mode ([research](../research/printpal-fidget-clicker-maker.md)). You upload an STL, a level cut splits it, and an MX switch goes between the halves. The owner asked for the same in Clicker Studio. It is the `split` kind, "Split a model", in `clicker-studio/src/geometry/split.ts`.

The owner's decisions (2026-11-15):
- **Switches are placed automatically, then can be nudged** by hand.
- **Two seam styles, Plug (the default) and Plain.** They replace PrintPal's Embedded and Regular. PrintPal's In a Box is the existing 3D model kind.
- **All of PrintPal's extras** that Clicker Studio lacked: the Apart and Slice preview, STL download, a hang tab at any angle, SVG art and imported fonts. They come in later steps. This record covers the split itself.

My defaults, not asked (the owner can overrule them):
- **A new kind.** It shares the 3D model upload, rotation and Flat bottom (the model kind's `cut`). The cap and Base cards don't apply to it and are hidden.
- **The gap is added, not removed.** The whole model is kept. At rest the top half floats one travel plus the bottom gap (4.6 mm) above the bottom half. Fully pressed, 0.6 mm is left between them.
- **Nudge, the wall and the 1–4 switch override are in Advanced mode only.** Simple mode shows the switch count, as ADR 0009 does.

## The two halves

Everything is in the plate frame: z = 0 is the switch plate's top, as for caps and Bases.

- **Plain.** The seam is at z 0. The top half is raised by the gap.
- **Plug.** The seam is at z 6.6, the cap skirt's bottom plus 2 mm, where a Base's rim ends. The top half hangs a plug into a well in the bottom half, so it can't wobble and the switch is hidden. The plug runs from z 4.6 up to the top half's face (11.2 at rest). Its outline is the narrowest section over the well's height, less the wall and the clearance. The well is the plug grown by the clearance, from z 0 up through the seam.
- **Bottom half.** The lower half, less the well, less each switch's clip room and plate cutout. `switchPocket` cuts these and the Base uses it too.
- **Top half.** The raised upper half and the plug, less each switch's housing keep-out (swept through the travel) and stem socket, plus a stem boss. `stemBoss` builds the boss and the cap uses it too. The fit is therefore the cap's and the Base's, Fit panel included.

The plug follows the narrowest section, not the seam's. A model that narrows under the seam (an egg) would otherwise get a well that breaks through its side.

## Where the seam and the switches go

One table drives the search, the switch spots, the warnings and the smallest size. For each style it lists the square of solid material each half needs around a switch, at every height:
- Bottom half: the clip room plus a wall on each side, from the floor to the plate, and a wall-thick floor under it.
- Plug only: the housing keep-out at the skirt's bottom, plus two walls and the clearance, over the whole well.
- Top half: the keep-out plus a wall from the face up, a wall-thick roof over it, and the boss's width over the stem socket.

The model is sliced every 0.5 mm (or a 120th of its height, if more) and each slice is rasterised at 0.25 mm (coarser for big models, about 40,000 pixels a slice). Each raster becomes a chessboard distance field, so "does a square of half-width h fit here" is one comparison per pixel. The worker keeps the parsed mesh, the slices and the search result between builds. They are plain data, so ADR 0013's release rule still holds.

- **Automatic seam.** Slice heights are tried from the middle outward, and the first with room for one switch wins. If none has room, the seam that fits at the smallest scale is used and `warn.splitNoRoom` shows.
- **Switch spots.** The first switch goes at the deepest point of the section (for Plug, of the narrowest section over the well), moved onto the nearest spot with room. The others come from the shared-cap placement of ADR 0009, run on the same room mask. Then the nudge moves them all.
- **Smallest size.** A bisection over scale (0.1–4×) finds the smallest size where some seam has room. It adds 2 % and rounds up to a millimetre, because the model is sliced afresh at the new size, and it never shows more than a width that already fits. The Split card shows "Fits a switch from N mm". Make it fit sets that size and the best spot. A fresh upload too small for a switch grows to it once, the way PrintPal scales a model up.
- **Tapping the model** in the assembled view puts the seam at that height. A tap on the top half takes off the gap.

The warnings:
- `warn.splitNoRoom`: no switch fits at this seam.
- `warn.splitBottom`: a switch's pocket breaks through the bottom half's bottom or side. A nudge too far shows this.
- `warn.splitTop`: the top half is too thin over a switch.
- `warn.splitMiss`: the seam misses the model.
- `warn.splitSmallFoot`: the bottom half stands on less than 50 mm². Use Flat bottom, or supports.
- The shared-cap warnings `warn.hugeCap` and `warn.noRoom`, and `warn.modelBroken` for a model that isn't watertight.

## Printing

The bottom half prints as built. The top half stands on its seam face (Plain) or its plug (Plug), as a raised cap stands on its skirt, so the stem boss hangs the same way. In the Plug style the face sticks out past the plug by the wall plus the clearance (2.4 mm), 6.6 mm above the bed. That ledge prints without support and needs a test print.

Smallest warning-free blocks with the defaults (`bun scripts/min-sizes.ts`): Plain needs a 20 mm square section and 21 mm of height, Plug a 24.5 mm section and 20.5 mm.

## Considered options

- **Removing the gap** (cutting 4.6 mm out at the seam). The clicker would look like the model at rest, as PrintPal's halves do. But it loses part of the model, and PrintPal's flush halves leave no room to press.
- **One switch at a fixed point, as PrintPal does.** Simpler, but large models wobble on one switch (ADR 0009), so the shared-cap rule and placement are reused.
- **PrintPal's Embedded sizes** (a 5 mm inset pillar in a 4 mm well). Our plug uses the cap skirt's height and the Base's clearance, so the fit is the one already printed and tested.
- **Exact wall checks with polygons**, per switch and per slice. Exact, but a second rule beside the raster. The raster is half a pixel stricter, so a spot the search picked always passes, and one table stays the only rule.
- **A size estimate from ratios** (needed room over available room, for the section and the depths). Cheaper, but it ignores the shape between the slices. The bisection runs the real check, once per model and size.
