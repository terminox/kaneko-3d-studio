# One-layer Name Tags: a flat cut-out with no plate

A Name Tag ([ADR 0006](0006-standalone-tag-studio.md)) had two layers: a plate in one colour, and the picture, name and rings raised on top. On 2026-11-09 the owner asked for an option to remove the plate, so a tag is a single layer.

The owner's decisions:
- **A flat cut-out.** With one layer, every colour runs from the bed to the tag thickness (the Plate thickness slider), with a flat top, like an inlay with nothing underneath. Raised height and Layer heights ([ADR 0007](0007-per-patch-layer-heights.md)) don't apply; part colours ([ADR 0010](0010-per-patch-colours.md)) still do.
- **A border above 0 mm is a flat frame** in the plate colour, at the same height. It joins letters and a name that don't touch (the plate's closing already did that), and the keyring loop attaches to it.
- **A border of 0 mm means no frame at all.** The first version kept the closing joins at 0 mm, and to the owner that still looked like a plate. Now nothing is added: the loop grips the artwork itself, and pieces that don't touch stay loose with a warning. The name's gap can go negative so it can lie over the picture and hold on.

## How it works

- `TagDesign.plate.layers` is `2` (the old tag) or `1`. Saved Designs without it load as `2`.
- `buildTag` builds the artwork, the plate outline and the loop exactly as before. With one layer it extrudes every colour from 0 to the thickness, and the plate colour gets the plate minus the artwork.
- The plate outline comes from a simplified artwork outline, so the plate minus the exact artwork leaves hairline slivers along every edge and between traced colours. `withoutSlivers` drops the pieces thinner than 0.2 mm and keeps the rest exactly, so the frame and the artwork still share their boundaries. Opening the frame with offsets instead moved the boundaries and left the parts not quite touching.
- With no border, the loop is the ring plus the convex hull of the ring and the artwork within 1.5 mm of it (`loopTab`), so even a thin spike at the edge gets a solid tab, and the hole is cut from the artwork too. The loop's probe looks for the artwork's edge at the chosen position; when that misses (a gap between letters), it takes the nearby column whose edge reaches furthest out, so the loop lands on top of the B rather than in the notch between its bowls.
- A colour whose part comes out empty is dropped, so a flat tag with no border and no loop costs no plate-colour filament, and the panel's colour count says so.
- A crash inside the WASM kernel kills the worker without a reply. `engine.ts` now reports it as an error instead of leaving the preview blank.

## Considered options

- **Stepped, no backing:** pieces keep their heights but stand on the bed. The name would be 1.2 mm thick by default and thin pieces would be loose.
- **Rings as the only frame:** with no ring, letters that don't touch are loose objects. The owner preferred the border, which already knows how to join pieces.
- **Pieces must touch:** no joins at all. Too fiddly for names.
