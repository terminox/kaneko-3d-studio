# Clicker Studio

A local, in-browser designer for MX-switch fidget clickers, in the style of Maaprint3Dshop's keycap clicker tool ([research](../docs/research/maaprint-clicker-tool.md), [ADR 0004](../docs/adr/0004-standalone-clicker-studio.md)). Pick a kind, type letters or upload a picture, choose colours, and export a Bambu Studio 3MF with every colour on its own filament. Designs and Orders save as files, and an Order prints as an order sheet.

Thai and English, with Simple and Advanced screens. Geometry runs in a Web Worker on manifold-3d; the worker frees every kernel object after each job ([ADR 0013](../docs/adr/0013-kernel-memory-and-linear-builds.md)). Nothing leaves the Mac, except a picture you choose to send for the AI cartoon step.

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
| Fluted chain | One scalloped Base per key, linked with 6–8 mm metal jump rings through a small loop on each side, or with H-connectors (below). |
| 3D model | An STL/OBJ is rotated, scaled, cut flat and fused onto a standard cap pedestal. The model must be watertight. |
| Split a model | An STL/OBJ is cut level into two halves with a switch inside (below). The whole top half presses. |

"Parts to print" switches between Cap + Base, Caps only, the A–Z set (26 keycaps) and Base only.

## Switches under a large cap

A big cap on one switch binds when pressed off-centre and lets its far edge droop, so a shared cap (Single key, Picture, 3D model, and a split model's top half) gets as many switches as its size needs, placed automatically ([ADR 0009](../docs/adr/0009-multi-switch-shared-caps.md)). The rule follows keyboards, which stabilise any key from 2u (38 mm) up: every point of the cap must lie within the **reach** (22 mm) of a switch. A 40 mm round cap keeps one switch, a 60 × 20 mm bar gets two, a 45 mm round cap three, a 50 mm square four. Positions come from the cap's shape (`src/geometry/switches.ts`): two go on the long axis, three or four balance the area, and every spot keeps the housing inside the cap wall and the pocket inside the Base, at least the **pitch** (18 mm) apart. The first switch sits where it always did; the others get a little extra stem fit so the cap never binds on print tolerance. Simple mode shows the count; Advanced mode can force 1–4 (it falls back to as many as fit and says so) and tunes reach, pitch and extra stem fit in the Fit panel. A cap that even four switches can't cover warns. Note that each extra switch adds its actuation force: two 45 g switches press at about 90 g.

## Split a model

Upload any watertight STL or OBJ, standing the way it is pressed, and it is cut level into a working clicker, like PrintPal's "Cut Into a Model" ([research](../docs/research/printpal-fidget-clicker-maker.md), [ADR 0015](../docs/adr/0015-split-a-model.md)). The bottom half holds the switch. The top half carries the stem socket and rests 4.6 mm (one travel plus the bottom gap) above the bottom half, so none of the model is lost, and fully pressed the halves close to 0.6 mm.

- **Plug** (the default): the top half hangs a plug into a well in the bottom half, so it can't wobble and the switch is hidden. **Plain**: a flat seam, for smaller models.
- The seam goes at the best spot automatically: the height nearest the middle with room for a switch. Drag Seam height, or tap the model in the assembled view, to move it. **Best spot** puts it back.
- Switches are placed automatically under the top half, with the shared-cap rule (one, or up to four on a long model). Advanced mode can move them all in 0.5 mm steps, change the wall (1.6 mm) and force a count.
- **Flat bottom** cuts the model's bottom off so the bottom half stands on the bed. A round bottom warns.
- **Size** is the model's widest side, 25–150 mm. The card shows "Fits a switch from N mm", and **Make it fit** goes to that size. A fresh upload that is too small grows to it once.
- The halves print as built: the top half stands on its face or plug. In the Plug style the face sticks out 2.4 mm past the plug, a short ledge printed without support.
- Warnings say when no switch fits, when a pocket breaks through the bottom half, when the top half is too thin over a switch, and when the seam misses the model.

Smallest warning-free blocks with the defaults (`bun scripts/min-sizes.ts`): Plain needs a 20 mm square section and 21 mm of height, Plug a 24.5 mm section and 20.5 mm. A round model needs a little more.

## H-connector

Any Base can link to the next one with the joint from Justi-Fy Studio's *Modular Clicker (Bubbly)*, at Bubbly's exact sizes, so it also links with printed Bubbly blocks ([ADR 0011](../docs/adr/0011-h-connector.md)). A tab with a hole slides into the next Base's socket, and a pin on a sprung floor tongue snaps up through the hole. Joined pieces sit 2 mm apart and bend side to side.

- **H-connector** (Base card): ← Left, Right →, ↑ Top and ↓ Bottom each take nothing, a **Tab** or a **Socket**. Tab + socket on opposite sides makes a chain piece, a tab alone ends a chain, and a tab on one side with a socket on the next side turns a corner. The tab's hole takes a keyring, and a keyring loop on a connector side is left out.
- **Fluted chain → Join with: H-connector** builds the linked chain from one Design. The first piece's tab takes the keyring and the last piece has no socket.
- Each joint sits at the Base's outermost point on its side. Where a shape bulges past the wall there (a heart's lobes), a low housing carries the socket out to it and the tab gets an arm on the bed, so any two pieces link.
- To link, push the tongue down from inside the pocket (or just press the tab in), slide the tab in, and let go. Put the switch in with its pins toward the side the hint names, away from the sockets. A 5-pin switch's side posts must not point at a socket.
- One socket per Base is the safe choice. Two sockets on a small Base meet under the switch, so their tongues come out too short to bend, and the Base warns.
- The tab prints 2 mm above the bed. The 3MF puts slicer support under each tab only.

## Layer heights

In the Raised style, a picture (the Picture kind, or a picture on a key) can stand in layers ([ADR 0007](../docs/adr/0007-per-patch-layer-heights.md)). Each traced colour gets a height slider (0–8 mm; 0 is flush). Click a patch in the 3D preview to give that patch its own height, and Shift-click to pick several. **Make it pop** raises what sits inside other patches (pupils on eyes, eyes on the face). **Flatten** resets everything. Above 4 mm the slider turns amber and a warning shows. Heights stay with their spot on the picture through a retrace or a re-crop.

## Part colours

A picture's patches can each have their own filament, in Raised and Inlay ([ADR 0010](../docs/adr/0010-per-patch-colours.md)). Click or tap a patch in the 3D preview and a colour bar opens over it. Choose a filament and only that patch changes. Use Shift-click or **Pick several** to pick more, and **Reset colour** to go back to the patch's colour. Colours stay with their spot on the picture through a retrace or a re-crop. On an iPad the bar stays over the preview and its swatches swipe sideways.

## Your own fonts

In the key's text options, press **Import font (TTF/OTF)** and pick a font file. It joins the picker under "Your fonts", named after the file, and becomes that key's font. Letter rows, grids and the A to Z set can use it too.

The font is stored inside the Design file, so Save and Open keep it. Characters the font lacks (Thai, Korean, Chinese, emoji) still use the bundled fonts for those scripts. A font over 3 MB is saved in the Design file but is too big to be remembered after a reload, and a note says so.

You are responsible for an imported font's licence when you sell prints. The 29 bundled fonts are all SIL OFL.

## Your settings files

- `filaments.json`: the filament colours you stock (hex plus Thai and English names). Swatches, colour pairs and the order sheet use it.
- `pricing.json`: **placeholder prices**. Replace them with yours. Price = the kind's base price, plus extra keys, plus extra switches under a shared cap, plus extras (cord, texture, AI cartoon, colours beyond 4).
- The print profile is Model Maker's: `../model-maker/profiles/project-template.json` if you made one (ticket 04), else the stock A1 / Generic PLA one.

## Fit

The Fit panel (Advanced mode) holds every dimension that touches the switch. The defaults come from the public MX spec: pocket 14.0, plate 1.5, stem top 11.6 above the plate, travel 4.0, cross 4.1 × 1.35. **Measure your switches and check these**, especially the top-housing size (15.4 mm at the plate, 11.6 mm at its top, 6.6 mm tall). Every cap removes that housing swept through the travel, so caps never hit the switch. A cap that is too small shows a warning instead. Smallest warning-free sizes with the defaults (`bun scripts/min-sizes.ts`): square, capsule and keyboard key 18 mm, hexagon 21, circle and octagon 21.5, flower 23, bear and cat 24, cloud 30, heart 36.5.

Raised Decorations print the cap face up. Flush inlays print it face down, so the coloured top sits on the bed.

## Exports

One 3MF per Design (the header button) or per Order. Parts are packed onto 256 mm A1 plates with the top-right corner left free for the prime tower. "Group plates by colour" (on the Order panel) puts one-colour pieces on their own colour's plates, which cuts filament swaps a lot (a 4-colour fluted chain: 11.6 h on one plate → about 30 min per plate).

"STL (zip)" (next to the 3MF button, and on the Order panel) gives plain STLs for other slicers. There is one file per printed part, named `<group> - <part>.stl`, so each colour can get its own filament. Every piece stands on z = 0 in its own frame and nothing is packed onto a plate. Support volumes are left out. An Order puts each Design in its own folder, and a Design ordered more than once repeats as `#1`, `#2`.

## Command line

```sh
bun test                              # geometry, text, picture, switch placement and kind tests
bun scripts/check-kinds.ts            # build one fixture per kind, slice each with the Bambu Studio CLI
bun run make --text MAA --validate    # quick Design → out/*.3mf, sliced
bun run make out/x.clicker.json       # a saved Design
bun run make --kind split --model egg.stl --split plain --validate   # split an STL
bun scripts/min-sizes.ts              # smallest warning-free cap size per shape, and per split style
```

## Layout

```
src/design/     types.ts (Design), palette.ts, price.ts, order.ts, heights.ts (layer height and part colour edits, picking)
src/geometry/   kernel, switch (Fit), switches (where the switches go under a shared cap), outline,
                cap, base, texture, layout, chain, model-cap, split (Split a model), decoration,
                patches (picture islands + heights), symbols, path (SVG paths), build.ts (Design → parts, plate packing)
src/text/       shape.ts: HarfBuzz text shaping with per-character font fallback
src/picture/    process.ts: background removal, holes, Lab k-means colour split, tracing
src/export/     bambu.ts (→ Model Maker's 3MF writer), stl.ts (STL zip), template.ts
src/ui/         main, panels, colour-bar (part colours), picture-ui (crop dialog, AI), order-ui (order sheet), viewport, state
src/i18n/       strings.ts: every Thai and English string
scripts/        fetch-assets, make, check-kinds, min-sizes, cartoon (OpenRouter call), cartoon-api (dev-server endpoint)
```

## Licences

manifold-3d Apache-2, three.js MIT, HarfBuzz (harfbuzzjs) MIT, imagetracerjs Unlicense, Phosphor Icons MIT, and all fonts SIL OFL, so prints made with them can be sold. Every symbol and cap shape is drawn from scratch. Nothing is copied from Maaprint.
