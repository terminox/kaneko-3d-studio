# Map: Clicker Generator

Label: wayfinder:map

## Destination

A working, local, in-browser clicker generator. The owner enters a Design (Cap Clicker or Block Clicker: Outline, size, Switches, Decorations on any surface, colors) and gets a Bambu-ready 3MF. The 3MF has parts on AMS slots and the tuned R3D PLA Matte Print Profile embedded, and holds one or several Designs per Plate. It prints first time on the A1, with switch fit and text detail set by the owner's own Fit Calibration. It has feature parity with the MakerLab clicker generator and is built clean-room.

## Notes

- **Domain:** a physical product (3D-printed MX-switch fidget clickers) plus a TypeScript browser app. The glossary is in [CONTEXT.md](../../CONTEXT.md); use its terms.
- **Execution override:** the destination is a *working* generator, so execution is carried into this map. Once their decisions close, build tickets graduate from the fog and are worked here using the `tdd` skill.
- **Skills:** grilling tickets use `grilling` + `domain-modeling`; prototype tickets use `prototype`; research tickets use `research`; module seams and interfaces use `codebase-design`.
- **Standing decisions:** clean-room, so never copy code or meshes from the reference or other unlicensed generators ([ADR 0001](../../docs/adr/0001-clean-room-generator.md)). Geometry is TypeScript + Vite + three.js + manifold-3d WASM in a web worker ([ADR 0002](../../docs/adr/0002-in-browser-manifold-geometry.md)). The tool runs locally on the owner's Mac.
- **Setup:** Bambu Lab A1 Combo, AMS Lite (4 slots), 0.4 mm nozzle, textured PEI plate, R3D PLA Matte. Bambu Studio's CLI on this Mac is how generated 3MFs get verified.
- **Shape of the work:** about 99% of Cap Clickers have a single Switch. A Block Clicker has one Keycap per Switch; every other Design has one shared Top Cap. Reliability effort targets switch fit and text and fine detail. The owner starts using the generator once the full option set works (no staged sellable slices).
- **HITL:** the owner answers grilling and prototype tickets. The agent never answers its own questions.

## Decisions so far

<!-- one line per closed ticket: [title](link): gist -->

- [Reference generator teardown](issues/01-reference-generator-teardown.md): the parity checklist is Vostok's app (MakerLab identity unconfirmed). Cap Clicker modes have 1–3 Switches; Block Clicker has up to 24 keys. Decorations go on the top surface only. The Fit Test tests stem fit only. It exports a stock profile. Selling with it costs $99 lifetime or a membership.
- [Geometry stack gaps](issues/02-geometry-stack-gaps.md): every gap is solvable on manifold-3d. Use opentype.js with the NonZero fill rule for text, parse SVGs on the main thread, and trace PNGs with imagetracerjs. Each colour is a disjoint part. Side Decorations work through transforms or warps; avoid fillets.

## Not yet specified

- **Build sequence:** execution tickets (scaffold, geometry core, Cap Clicker, Block Clicker, Decorations, Fit Test export, 3MF writer, generator screen, Plate batching). These graduate once the anatomy, option catalog, Fit Test, Design file, screen and readiness-check tickets close.
- **Fit Calibration run:** the owner prints the Fit Test and records the winning values. This is a HITL task once Fit Test export exists.
- **Plate batching rules:** how several Designs share one Plate. Covers the 4-slot AMS palette shared across Designs, spacing, how many fit, and how parts are labelled per Design and Order.
- **Text and detail limits:** minimum text height and stroke, and emboss depth, as the Fit Calibration results dictate.
- **Logo and image pipeline details:** PNG tracing quality, background removal, color count. Depends on the geometry stack research and the option catalog.
- **Side and edge Decoration technique:** text on vertical or curved walls. Depends on the geometry stack research and the option catalog.
- **Font, icon and tracing-library licensing:** which fonts and icon sets may be bundled and used on Clickers that are sold. Depends on the option catalog's font and icon set. GPL/AGPL tracing and background-removal libraries are fine locally but would block any later hosting (see Geometry stack gaps).
- **Acceptance run:** a set of representative Designs printed end to end to declare the generator "working".

## Out of scope

- **Customer-facing configurator, public hosting, storefront and order-intake integration:** the generator is internal-first and runs locally. Opening it to customers would be a later effort.
- **Non-MX switch families (Kailh Choc etc.):** the product uses MX-style Switches only.
- **Send-to-printer and print-queue automation:** the destination ends at a Bambu-ready 3MF the owner opens and prints.
