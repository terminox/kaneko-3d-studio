# Model Maker

A local, in-browser parametric model maker in the style of MakerWorld's Parametric Model Maker (PMM). Open a `.scad` file. Its Customizer comments become a form. Change the values and the 3D preview updates. Then export a Bambu Studio project 3MF with each colour on its own filament, or an STL.

OpenSCAD runs as WebAssembly in a Web Worker, so nothing is sent anywhere. Why it exists next to the clicker generator: [ADR 0003](../docs/adr/0003-standalone-openscad-model-maker.md). How MakerWorld's tool works, with evidence: [research note](../docs/research/makerworld-parametric-model-maker.md).

## Run it

```sh
cd model-maker
bun install
bun run setup      # OpenSCAD WASM builds, 25 Google Fonts, BOSL2 (about 30 MB, not committed)
bun run dev        # http://localhost:5178
```

The preview needs WebGL. Without it, the form and the exports still work.

## Writing a model

Use the same syntax as MakerWorld PMM, so a model works in both. See [`models/syntax-demo/syntax-demo.scad`](models/syntax-demo/syntax-demo.scad) for every type.

| Write | You get |
|---|---|
| `/* [Group] */` | A collapsible section. `/* [Hidden] */` hides what follows. |
| `// text` on the line above | The parameter's help text. `Text_Size` is shown as "Text Size". |
| `n = 5;` / `n = 5.0;` | A number box (steps 1 / 0.1). |
| `n = 5; // [0:20]`, `[0:0.5:20]`, `[20]` | A slider. |
| `n = 2; // [1, 2, 3]`, `s = "a"; // [a:Label A, b:Label B]` | A dropdown. |
| `b = true;` / `s = "hi";` / `s = "hi"; // 8` | A checkbox / a text box / a text box limited to 8 characters. |
| `v = [1, 2]; // [0:0.1:10]` | One number box per item. |
| `c = "#FF0000"; // color` | A colour picker. |
| `f = "Nunito:style=Bold"; // font` | A font picker (bundled fonts only; see `public/fonts/fonts.json`). |
| `logo = "default.svg";` (or `.png`, `.stl`) | A file upload. Put a `default.svg` next to the model as the placeholder. |
| `module mw_plate_1() {…}`, `mw_plate_2`… | One 3MF plate per module. STL export is turned off, as on MakerWorld. |
| `module mw_assembly_view() {…}` | Preview only, never exported. |

Bundled libraries: `include <BOSL2/std.scad>;` works (BOSL2 at the commit MakerWorld documents). `textmetrics()` is enabled, so a model can measure its text. [`name-keychain`](models/name-keychain/name-keychain.scad) uses it to place the keyring.

To add a model to the menu, make `models/<name>/<name>.scad`, plus any `default.*` files it uses.

### Colours become filaments

Every distinct `color()` becomes a separate part on its own filament in the 3MF. Exporting renders each colour on its own and clips it against the full model, so the parts are closed and never overlap:

```
part(c) = (only c's geometry − uncoloured geometry − earlier colours) ∩ full model
```

So a coloured object that only *cuts* (inside a `difference()`) doesn't become a part. Geometry outside any `color()` becomes one extra part in OpenSCAD yellow. Each colour costs two extra OpenSCAD runs; a two-colour keychain exports in about 1–3 s.

Rules for models:
- **Outermost `color()` wins**, as in OpenSCAD. Wrap whole parts, not just their pieces.
- **Multi-plate scripts must not draw anything at top level.** Top-level geometry would land on every plate.
- **Colours inside `use <lib.scad>` modules aren't split**, because `use` doesn't see our colour hook. Those modules end up in the uncoloured part. `include` is fine.
- More than 4 colours works, but the AMS Lite holds 4, so the export warns.

## Exports and the print profile

The 3MF uses the Bambu project layout from the [3MF research](../docs/research/bambu-3mf-and-cli.md) (branch `research/bambu-3mf-and-cli`): it carries the `BambuStudio-02.08.02.61` stamp, one object per plate centred on its plate, one part per colour, and an embedded `project_settings.config`.

The settings come from a template in `profiles/`:
- `stock-a1-generic-pla.json` is committed. It's A1 0.4 / 0.20mm Standard / Generic PLA, flattened from the presets inside Bambu Studio and completed by a CLI round trip. Rebuild it with `bun run template`.
- `project-template.json` is the owner's tuned profile. Save a project from the Bambu Studio GUI as `../profiles/template.3mf` (ticket 04), then run `bun run template -- --from ../profiles/template.3mf`. When it exists, the app uses it instead of the stock one.

`BAMBU_STUDIO_VERSION` in `src/export/bambu3mf.ts` must match the installed Bambu Studio. A newer stamp makes the CLI refuse the file.

## Command line

```sh
bun run make models/name-keychain/name-keychain.scad -D Name=Miyu -D 'Font=Kanit:style=Bold' --validate
bun run make models/logo-tag/logo-tag.scad --file Logo=~/logo.svg --out out/tag.3mf
bun run validate out/*.3mf      # slice headless with Bambu Studio, check result.json
bun test                        # parser, OpenSCAD-oracle and render pipeline tests
```

`--validate` slices with the Bambu Studio CLI. It fails unless every plate sliced with a print time, every filament has grams > 0, and each plate uses the filaments its parts were given.

## Layout

```
src/params/     parse.ts (Customizer comments -> schema), defines.ts (values -> -D args)
src/openscad/   runner.ts (one OpenSCAD run), worker.ts + browser-runner.ts (app), node-runner.ts (tests, CLI)
src/pipeline/   render.ts (preview, colour split, plates), mesh.ts (OFF/STL), colors.ts
src/export/     bambu3mf.ts (3MF writer), project.ts (model -> 3MF/STL)
src/ui/         main.ts, panel.ts (form), viewport.ts (three.js)
scripts/        fetch-assets, make, validate-3mf, make-template, bambu-cli
models/         bundled models, written from scratch
```

## Licences

- **OpenSCAD WebAssembly:** GPL-2. It's fine for this local tool. Hosting the app publicly would mean offering the OpenSCAD source.
- **Fonts:** all SIL OFL, so prints made with them can be sold.
- **BOSL2:** BSD-2.
- **Sample models:** our own. Nothing is copied from MakerWorld or its models.
