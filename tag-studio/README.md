# Tag Studio

An in-browser tool that turns an uploaded picture and a name into a multi-colour Name Tag keychain ([ADR 0006](../docs/adr/0006-standalone-tag-studio.md)). The plate follows the outline of the picture and the name. The picture's colours and the name are raised on top, and there's a keyring loop. A tag can also be one flat layer with no plate ([ADR 0012](../docs/adr/0012-one-layer-tags.md)). Type several names, one per line, to make a whole set with the same picture and style. The export is a Bambu Studio 3MF with every colour on its own filament.

It reuses Clicker Studio's picture handling (background removal, the colour split, the AI cartoon) and its Thai text shaping. Its options follow Model Maker's name keychain: font, weight, letter spacing, border, plate thickness, raised height, fill holes and the keyring loop. Geometry runs in a Web Worker on manifold-3d. Nothing leaves the Mac, except a picture you choose to send for the AI cartoon step.

## Run it

```sh
cd model-maker && bun install && cd ..                        # the 3MF writer and slicer check live there
cd clicker-studio && bun install && bun run setup && cd ..    # shared picture/text code and the fonts
cd tag-studio
bun install
bun run setup      # copies Clicker Studio's 29 fonts (Thai, Korean, Chinese, emoji), else downloads them
bun run dev        # http://localhost:5180
```

The preview needs WebGL. For the **AI cartoon** button, copy `.env.example` to `.env`, add an `OPENROUTER_API_KEY`, and restart `bun run dev`. The hosted site uses `../api/cartoon.ts`, with the same key and daily cap as Clicker Studio.

## The form

| Group | What it sets |
|---|---|
| Picture | Upload, crop/rotate/adjust, AI cartoon, background removal, enclosed gaps, 1–5 colours and the filament for each, layer heights, part colours, width |
| Name | The names (one tag each), which one to preview, font, letter height, stroke weight, letter spacing, position (below, above, left or right of the picture), gap |
| Colours | Plate and name colours, colour pairs, and the filament count (warns past 4, the AMS Lite limit) |
| Outline rings | 0–2 sticker-style bands around the artwork, each with its own colour |
| Plate | Layers (2: plate + raised artwork, or 1: a flat cut-out), thickness, raised height, border, fill holes |
| Keyring loop | Top, left, right or none; slide along the edge; hole and wall size |

Colours come from `../clicker-studio/filaments.json`. Artwork in the plate's colour fuses into the plate, so it doesn't cost a filament. The print profile is Model Maker's, as in Clicker Studio.

"Plate 1" in the preview shows how every name packs onto A1 plates, with the top-right corner left free for the prime tower.

**Layer heights** ([ADR 0007](../docs/adr/0007-per-patch-layer-heights.md)) work as in Clicker Studio. Each picture colour gets a height (0–8 mm above the plate; 0 is flush). Click a patch in the "This tag" preview to give it its own height, and Shift-click to pick several. Make it pop and Flatten work as there. The name and rings keep the Raised height.

**One layer** ([ADR 0012](../docs/adr/0012-one-layer-tags.md)): with Layers set to 1 there is no plate. Every colour runs from the bed to the tag thickness, side by side, with a flat top. The border becomes a flat frame in the plate colour, which also joins letters that don't touch and carries the keyring loop. At 0 mm border, only those joins and the loop are left in the plate colour, and a tag with no loop and nothing apart doesn't use it at all. Raised height and Layer heights don't apply; part colours do.

**Part colours** ([ADR 0010](../docs/adr/0010-per-patch-colours.md)) work as in Clicker Studio. Click or tap a patch in the "This tag" preview and choose a filament in the bar over it. Only that patch changes, on every tag.

## Command line

```sh
bun test                                                   # geometry tests
bun scripts/face-png.ts out/face.png                       # a test picture
bun run make --picture out/face.png --names "Miyu,คาเนโกะ" --validate
bun run make my-set.tag.json --out out/set.3mf --validate  # a Design saved from the app
```

The command line reads PNG pictures only. It applies the crop, but not the rotation or the light adjustments. `--validate` slices with the Bambu Studio CLI and fails unless every plate sliced and every filament was used.

## Layout

```
src/design/     types.ts (TagDesign, defaults, tag names)
src/geometry/   tag.ts: Design + name -> one Name Tag (plate, raised parts, loop); buildAll packs every name
src/ui/         main, panels, picture-ui (crop dialog, AI), viewport, state, engine, dom
src/i18n/       strings.ts: every Thai and English string
src/worker.ts   builds and exports off the main thread
scripts/        fetch-assets, make (CLI), png (PNG reader for the CLI), face-png, node-assets
```

`@cs/...` imports come from `../clicker-studio/src`, and `@mm/...` from `../model-maker/src`.

## Licences

manifold-3d Apache-2, three.js MIT, HarfBuzz (harfbuzzjs) MIT, imagetracerjs Unlicense, and all fonts SIL OFL, so prints made with them can be sold.
