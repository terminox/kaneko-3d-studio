# Part colours: each picture patch can have its own filament

The owner wanted to pick one part of a picture and change its colour, the same way layer heights ([ADR 0007](0007-per-patch-layer-heights.md)) change its height: the left eye turns blue and the right eye stays black. It applies to Clicker Studio's Picture kind, to pictures on keys, and to Tag Studio's pictures, and it has to work on an iPad.

A patch takes its filament from the first match in this list:
1. Its own filament, a paint set by picking it in the 3D preview.
2. Its colour's filament.

The owner's decisions:
- Only picture patches can be picked. The cap, Base, outline rings and text keep their swatches in the panel.
- Both apps get it, because the code is shared.
- It works on a tablet, which has no Shift key and no hover.

## How it works

- A paint is stored like a pin: a point 0–1 across the traced picture, kept in `LayerHeights.paints`. So a retrace gives each paint to whatever patch covers its spot, a re-crop moves it (`remapHeights`), and a new picture clears it. Make it pop and Flatten leave paints alone. Old saved Designs have no `paints` and load as they are.
- Swatches offer stocked filaments only. Going over 4 filaments warns and doesn't block, like the other colour controls.
- Part colours work in Inlay as well as Raised. Inlay is the default for pictures, so builds now report patches in Inlay too, with heights at 0.
- `partsOf` groups patches by filament, not by traced colour, so a repainted patch joins the part of its new filament and the 3MF still has one part per filament.

## Tablets

- The controls are a bar over the 3D preview (`clicker-studio/src/ui/colour-bar.ts`), not a block in the panel. On a tablet the panel can be a long scroll from the preview.
- **Pick several** makes each tap act like Shift-click. It ends when nothing is picked.
- The bar names the filament, because swatch tooltips don't exist on touch.
- Under `pointer: coarse` the swatches grow to 40 px and sit in one row to swipe. With a mouse they wrap, because a mouse can't swipe.
- A tap allows 10 px of finger movement (4 px for a mouse), and a second finger cancels it, so a pinch can't pick a patch.
- The highlight over picked patches is much fainter than before, so the chosen colour shows through.

## Consequences

- The bar is shared with Tag Studio through `@cs`, an exception to ADR 0006's copied UI: two copies would drift, and everything app-specific comes in as options. The CSS is still copied.
- The tracer fits each colour on its own, which leaves hairlines between neighbours (up to about 0.17 mm² at 40 mm wide). When traced colours merge into one filament, `mergeAreas` closes gaps under 0.16 mm so the cap doesn't show through. It only runs on merged areas, because offsets are slow.
- `PictureOptions.emptied` lists the traced colours with every patch repainted, so their filament stops counting towards the price and the colour total. It's derived from the last build, like `placedSwitches`. A Design added to an order within a moment of a repaint can keep the old count until it's edited again. Tag Studio has no price, and its colour summary can read one high in this case.

## Considered options

- **Controls in the side panel, beside the height slider.** Simpler, but on a tablet the panel is far from the preview, and Inlay hides the height block.
- **Storing paints on pins.** One list, but resetting a height would have to keep the colour, and the reverse.
- **Counting colours only from the built parts.** Exact, but the price would depend on a live build, which an order's saved Designs don't have.
