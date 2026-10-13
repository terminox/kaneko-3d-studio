# Geometry stack gaps

Type: research
Status: resolved
Blocked by: none
Map: [Clicker Generator](../map.md)

## Question

The stack is TypeScript + Vite + three.js + manifold-3d (WASM, web worker), per [ADR 0002](../../../docs/adr/0002-in-browser-manifold-geometry.md). Using primary sources (library docs and source code), how do we do each of the following?

1. Font text → manifold solids: loading TTF/OTF/WOFF, converting glyph outlines to polygons (e.g. opentype.js → manifold CrossSection), and handling holes and winding.
2. SVG import → CrossSection, including curves, fill rules and stroke-only art.
3. PNG/JPG → vector tracing for logos: library options (e.g. potrace ports, imagetracerjs), their licences, and any background-removal options.
4. Decorations on non-top surfaces (side walls, curved edges, undersides): projecting or wrapping 2D art onto them.
5. Multi-color Decoration techniques in a single print: raised, flush inlay, and engraved. How each is modelled as separate parts so each part can sit on its own AMS slot.
6. Running manifold-3d in a Vite web worker and passing meshes to three.js, plus any known pitfalls (WASM loading, memory, transferables).

## Answer

Full findings with sources: branch `research/geometry-stack-gaps` → `docs/research/geometry-stack-gaps.md`. Nothing found overturns ADR 0002.

1. **Fonts:** opentype.js 2.x (MIT) in the worker loads TTF, OTF and WOFF (WOFF2 needs decompressing first). Feed all glyph contours into one manifold `CrossSection` with the **NonZero** fill rule. The default "Positive" rule silently drops outlines wound the opposite way.
2. **SVG:** three.js `SVGLoader` needs `DOMParser`, so parse on the main thread and send polygons to the worker. Stroke-only art needs a workaround (per-segment hull unions or a Clipper2 port), because manifold can't offset open paths.
3. **PNG → vector:** imagetracerjs (public domain) now. vtracer traces better but its npm build is Node-only. Remove backgrounds via the image's transparency or flat-colour detection. Potrace ports are GPL and IMG.LY is AGPL: fine locally, but they would block customer hosting.
4. **Non-top surfaces:** flat sides and undersides are just a transform (mirror the art for undersides). Curved walls use `refineToLength` then `warp`. Avoid Decorations on fillets and curved edges.
5. **Multi-colour:** each colour is its own disjoint part made with booleans, exported as its own 3MF part on an AMS slot. The generator must produce non-overlapping parts, because Bambu resolves overlaps by list order. Raised, flush-inlay and engraved techniques are compared for a 0.4 mm nozzle in the doc.
6. **Vite worker:** load WASM with `manifold.wasm?url` plus `locateFile`. The build is single-threaded, so no COOP/COEP headers are needed. `.delete()` every manifold object. Transfer mesh buffers.

Risks passed on to other tickets:
- Multi-colour Decorations on sides cost a filament change on every layer they span (→ Option catalog).
- Stock A1 profiles use the classic wall generator with thin-wall detection off, which matters for fine text (→ Fit Test design; the install task records the tuned profile's setting).
