# Geometry stack gaps

Type: research
Status: open
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
