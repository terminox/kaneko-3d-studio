# Clicker Studio: a Maaprint-style clicker designer, separate from the clicker generator

The owner wanted a tool like Maaprint3Dshop's keycap clicker designer (research: [maaprint-clicker-tool.md](../research/maaprint-clicker-tool.md)), built internal-first but able to face customers later. We built it as a **separate project**, `clicker-studio/`, and left the clicker-generator wayfinder map and its tickets as they are. It uses the geometry stack from [ADR 0002](0002-in-browser-manifold-geometry.md): TypeScript, manifold-3d in a Web Worker, and a three.js preview. Its Bambu 3MF writer, profile template and slicer check are imported from `model-maker/`, not copied.

Because manifold-3d is Apache-2 (OpenSCAD is GPL), the same code can be hosted for customers later. The AI cartoon step runs on a dev-server endpoint that holds the OpenRouter key; hosting it would need a real server endpoint.

## Considered options

- **Fold it into the clicker-generator map** as a second parity reference. Rejected by the owner: the map aims at MakerLab parity for the owner alone, and this project aims at a Maaprint-style flow with prices and orders.
- **Write it as OpenSCAD models for the Model Maker.** Rejected: picture tracing, per-key editing and live sliders need a real app, and OpenSCAD WASM is too slow for the colour-split rebuilds on every change.

## Consequences

- `model-maker/src/export/bambu3mf.ts` gained two optional plate fields: `bedPositioned` (keep the caller's bed coordinates) and `wipeTower` (prime tower position). Clicker Studio packs parts itself and keeps the top-right corner free for the tower. Without that, plates with 4+ colours failed to slice ("G-code outside the printable area").
- The switch dimensions come from the public MX spec, and the Switch housing is modelled as a tapering square. Each cap removes that housing swept through the key travel, so no cap shape can hit the switch. Until the owner prints a fit test, they are defaults in a Fit panel.
- Order export can put one-colour pieces on plates of their own colour. A 4-colour fluted chain went from 11.6 h on one mixed plate to about 30 min per plate.
