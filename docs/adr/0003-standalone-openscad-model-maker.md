# A standalone OpenSCAD model maker, running in the browser

Besides the clicker generator, we want MakerWorld's Parametric Model Maker workflow for our own simpler products, such as name keychains and tags: write a `.scad` with Customizer comments, get a form, tune it, export a multi-colour Bambu 3MF. So we built `model-maker/` as a separate tool. It runs the OpenSCAD WebAssembly build in a Web Worker, reads MakerWorld's comment syntax (`// color`, `// font`, `default.svg` uploads, `mw_plate_N`), and writes our own Bambu project 3MF. This does not replace [ADR 0002](0002-in-browser-manifold-geometry.md). The clicker generator still builds its geometry in TypeScript on manifold-3d. This tool is for products that are quicker to write as an OpenSCAD script.

The WebAssembly build can't export 3MF, and OpenSCAD's own coloured export merges touching colours inside modules. So a model is split by colour itself: `color()` is shadowed by a module that keeps one colour per run, and each pass is clipped as `(pass − uncoloured − earlier colours) ∩ full`. That gives closed, non-overlapping parts, at the cost of two extra renders per colour.

## Considered options

- **Run native OpenSCAD behind a local server, as MakerWorld does on its servers.** It's faster and can keep `.scad` source private ("protected" models). We rejected it: it needs an install and a server process, and source protection means nothing on the owner's own Mac.
- **Use OpenSCAD's coloured 3MF/OFF export directly (lazy-union).** It's one render, but colours inside a module, such as every `mw_plate_N`, come back as one merged solid with open per-colour shells.

## Consequences

- OpenSCAD is GPL-2. Hosting the app for customers would mean offering its source.
- Colours set inside `use`d libraries aren't split.
- Multi-plate scripts must keep top-level geometry empty.
