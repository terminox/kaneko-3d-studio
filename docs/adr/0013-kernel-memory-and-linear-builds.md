# Geometry builds that neither crash the page nor leak memory

On 2026-11-09 the owner reported that Tag Studio, on some devices, showed the panels but never a model and "shook repeatedly". A fresh default Design rendered fine everywhere, so the trouble was the saved Design: a real photo.

Two faults combined:
- **Every WASM object leaked.** manifold-3d objects (CrossSection, Manifold) are embind handles: nothing frees them until `.delete()` is called, and neither tool ever did. A photo-sized build made about 16,000 of them, 300–550 MB per build, and the kernel aborted after four to six builds.
- **The artwork covering loop was quadratic.** `buildTag` subtracted each picture patch from an ever-growing union and added it back (one boolean per patch against everything before it), plus a loop-hole subtract per patch. A 1226-polygon picture took 7.5 s, a 2620-polygon one 21 s. On an iPad or iPhone, the build on load blew the tab's memory, Safari reloaded the page, the panels flashed up, and the build ran again: the "shaking". The round-1 "Fill holes → blank screen" was the same crash, with the toggle saved just before it.

## Decisions

- **The kernel tracks and releases its objects.** `kernel.ts` wraps every method and static of both classes (and the two constructor call sites use `ofPolygons`) to record what they return. `release()` deletes everything recorded. Each worker runs its jobs one at a time through a single queue and calls `release()` after each one. Results must therefore be plain data: meshes as typed arrays (`toMesh` copies), polygons as arrays. Tests and CLI scripts need no release; the process ends.
- **Covering is done per colour group, not per patch.** Each traced colour is traced on its own, so neighbouring patches of different layers overlap by hairlines along shared edges; the rule "the name wins, then earlier layers" stays. `coveredBefore[layer]` is the union of the name and the layers before it, built once. A group's area is its patches merged, each layer's part cut by `coveredBefore`, then the loop hole taken out: a handful of booleans per build. Patch outlines for picking come from the uncut patch (as Clicker Studio does); a patch wholly under the name is dropped from the pick list. Rings are cut by the exact artwork, since they follow the simplified outline.
- **A dead worker is replaced and a dead page is not repeated.** `engine.ts` terminates and respawns the worker on its `error` event, so the next edit builds instead of hanging on "Building…". It also keeps a `tag-studio:v1:building` marker in localStorage while a job runs. If the marker is still there on load, the last page died mid-build: the form is shown, the automatic build is skipped, and a note explains. Any change builds again.

- **No `decompose` on shapes with thousands of contours.** manifold's `decompose` recurses per contour and overflowed a browser worker's stack at about 2,400 contours (the flat frame of a photo: hairline gaps between traced colours become slivers). `withoutSlivers` now uses an opening plus an intersect instead. The remaining `decompose` calls run on the simplified plate outline and on each traced layer, which stay in the hundreds. A one-layer tag with no border counts its loose pieces by their outer (counter-clockwise) contours instead, since its shape is the exact artwork. Bun reproduces the browser's limit with `BUN_JSC_maxPerThreadStackUsage=400000`.

Measured on the owner's Mac: 1226 polygons 7.5 s → 0.6 s, 2620 polygons 21 s → 1.6 s, process memory flat across builds.

## Considered options

- **Per-patch cut against neighbouring patches only** (bounding-box filter). Exact, but background patches span the whole picture, so every patch still fought a big operand: 1.4 s and 6.8 s.
- **Cutting only by the name.** Fast (0.55 s) but wrong: neighbouring colours overlap by hairlines, and three tests caught overlapping parts.
- **FinalizationRegistry for the leak.** Timing is up to the garbage collector; a worker can run out of WASM memory long before it fires.
