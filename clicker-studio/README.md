# Clicker Studio

A local, in-browser designer for MX-switch fidget clickers, in the style of Maaprint3Dshop's keycap clicker tool ([research](../docs/research/maaprint-clicker-tool.md), [ADR 0004](../docs/adr/0004-standalone-clicker-studio.md)). Pick a kind, type letters or upload a picture, choose colours, and export a Bambu Studio 3MF with every colour on its own filament. Designs and Orders save as files, and an Order prints as an order sheet.

Thai and English, with Simple and Advanced screens. Geometry runs in a Web Worker on manifold-3d. Nothing leaves the Mac, except a picture you choose to send for the AI cartoon step.

## Run it

```sh
cd model-maker && bun install && cd ..   # the 3MF writer and slicer check live there
cd clicker-studio
bun install
bun run setup      # 29 Google Fonts (Thai, Korean, Chinese, emoji) and 1,512 Phosphor icons, about 34 MB, not committed
bun run dev        # http://localhost:5179
```

The preview needs WebGL. For the **AI cartoon** button, copy `.env.example` to `.env`, add an `OPENROUTER_API_KEY`, and restart `bun run dev`. The default model is `google/gemini-3.1-flash-image`; change it with `OPENROUTER_IMAGE_MODEL`. The endpoint lives on the dev server here; the hosted site uses `../api/cartoon.ts` (see the [root README](../README.md)).

## Kinds

| Kind | What it makes |
|---|---|
| Single key | One Top Cap on a Base: text (several lines), emoji, icon, symbol or picture on top. |
| Letter row | One Keycap per character (Thai, English, 한국어, 中文, emoji), up to 10, on one Base. |
| Grid / WASD | Keys in a row, column, grid, WASD, arrows, T or custom cells, up to 24. |
| Picture | Upload a picture. The cap and Base follow its outline, the picture splits into 1–7 colours, and a cap border of 0–3 mm is added around it, so the cap and Base grow with the border and the picture keeps its width (0 = the picture runs to the edge; under 0.8 mm warns), and the Switch goes at the widest point of the shape. |
| Fluted chain | One scalloped Base per key, with a small loop on each side. Link them with 6–8 mm metal jump rings. |
| 3D model | An STL/OBJ is rotated, scaled, cut flat and fused onto a standard cap pedestal. The model must be watertight. |

"Parts to print" switches between Cap + Base, Caps only, the A–Z set (26 keycaps) and Base only.

## Switches under a large cap

A big cap on one switch binds when pressed off-centre and lets its far edge droop, so a shared cap (Single key, Picture, 3D model) gets as many switches as its size needs, placed automatically ([ADR 0009](../docs/adr/0009-multi-switch-shared-caps.md)). The rule follows keyboards, which stabilise any key from 2u (38 mm) up: every point of the cap must lie within the **reach** (22 mm) of a switch. A 40 mm round cap keeps one switch, a 60 × 20 mm bar gets two, a 45 mm round cap three, a 50 mm square four. Positions come from the cap's shape (`src/geometry/switches.ts`): two go on the long axis, three or four balance the area, and every spot keeps the housing inside the cap wall and the pocket inside the Base, at least the **pitch** (18 mm) apart. The first switch sits where it always did; the others get a little extra stem fit so the cap never binds on print tolerance. Simple mode shows the count; Advanced mode can force 1–4 (it falls back to as many as fit and says so) and tunes reach, pitch and extra stem fit in the Fit panel. A cap that even four switches can't cover warns. Note that each extra switch adds its actuation force: two 45 g switches press at about 90 g.

## Layer heights

In the Raised style, a picture (the Picture kind, or a picture on a key) can stand in layers ([ADR 0007](../docs/adr/0007-per-patch-layer-heights.md)). Each traced colour gets a height slider (0–8 mm; 0 is flush). Click a patch in the 3D preview to give that patch its own height, and Shift-click to pick several. **Make it pop** raises what sits inside other patches (pupils on eyes, eyes on the face). **Flatten** resets everything. Above 4 mm the slider turns amber and a warning shows. Heights stay with their spot on the picture through a retrace or a re-crop.

## Part colours

A picture's patches can each have their own filament, in Raised and Inlay ([ADR 0010](../docs/adr/0010-per-patch-colours.md)). Click or tap a patch in the 3D preview and a colour bar opens over it. Choose a filament and only that patch changes. Use Shift-click or **Pick several** to pick more, and **Reset colour** to go back to the patch's colour. Colours stay with their spot on the picture through a retrace or a re-crop. On an iPad the bar stays over the preview and its swatches swipe sideways.

## Your settings files

- `filaments.json`: the filament colours you stock (hex plus Thai and English names). Swatches, colour pairs and the order sheet use it.
- `pricing.json`: **placeholder prices**. Replace them with yours. Price = the kind's base price, plus extra keys, plus extra switches under a shared cap, plus extras (cord, texture, AI cartoon, colours beyond 4).
- The print profile is Model Maker's: `../model-maker/profiles/project-template.json` if you made one (ticket 04), else the stock A1 / Generic PLA one.

## Fit

The Fit panel (Advanced mode) holds every dimension that touches the switch. The defaults come from the public MX spec: pocket 14.0, plate 1.5, stem top 11.6 above the plate, travel 4.0, cross 4.1 × 1.35. **Measure your switches and check these**, especially the top-housing size (15.4 mm at the plate, 11.6 mm at its top, 6.6 mm tall). Every cap removes that housing swept through the travel, so caps never hit the switch. A cap that is too small shows a warning instead. Smallest warning-free sizes with the defaults (`bun scripts/min-sizes.ts`): square, capsule and keyboard key 18 mm, hexagon 21, circle and octagon 21.5, flower 23, bear and cat 24, cloud 30, heart 36.5.

Raised Decorations print the cap face up. Flush inlays print it face down, so the coloured top sits on the bed.

## Exports

One 3MF per Design (the header button) or per Order. Parts are packed onto 256 mm A1 plates with the top-right corner left free for the prime tower. "Group plates by colour" (on the Order panel) puts one-colour pieces on their own colour's plates, which cuts filament swaps a lot (a 4-colour fluted chain: 11.6 h on one plate → about 30 min per plate).

## Command line

```sh
bun test                              # geometry, text, picture, switch placement and kind tests
bun scripts/check-kinds.ts            # build one fixture per kind, slice each with the Bambu Studio CLI
bun run make --text MAA --validate    # quick Design → out/*.3mf, sliced
bun run make out/x.clicker.json       # a saved Design
bun scripts/min-sizes.ts              # smallest warning-free cap size per shape
```

## Layout

```
src/design/     types.ts (Design), palette.ts, price.ts, order.ts, heights.ts (layer height and part colour edits, picking)
src/geometry/   kernel, switch (Fit), switches (where the switches go under a shared cap), outline,
                cap, base, texture, layout, chain, model-cap, decoration, patches (picture islands
                + heights), symbols, path (SVG paths), build.ts (Design → parts, plate packing)
src/text/       shape.ts: HarfBuzz text shaping with per-character font fallback
src/picture/    process.ts: background removal, holes, Lab k-means colour split, tracing
src/export/     bambu.ts (→ Model Maker's 3MF writer), template.ts
src/ui/         main, panels, colour-bar (part colours), picture-ui (crop dialog, AI), order-ui (order sheet), viewport, state
src/i18n/       strings.ts: every Thai and English string
scripts/        fetch-assets, make, check-kinds, min-sizes, cartoon (OpenRouter call), cartoon-api (dev-server endpoint)
```

## Licences

manifold-3d Apache-2, three.js MIT, HarfBuzz (harfbuzzjs) MIT, imagetracerjs Unlicense, Phosphor Icons MIT, and all fonts SIL OFL, so prints made with them can be sold. Every symbol and cap shape is drawn from scratch. Nothing is copied from Maaprint.
