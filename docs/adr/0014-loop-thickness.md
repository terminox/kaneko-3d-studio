# The keyring loop's own thickness

The keyring loop on a Name Tag ([ADR 0006](0006-standalone-tag-studio.md)) was part of the plate outline, so it was always exactly as thick as the plate. One slider set both. On 2026-11-10 the owner asked to set the tag's thickness and the loop's thickness separately.

The owner's decisions:
- **Thickness means height off the bed.** The ring's width seen from above is still the Loop wall slider.
- **Only the part of the loop outside the tag changes.** Where the ring overlaps the tag's edge, the tag keeps its own thickness and its top stays flat. This applies whether the loop is thinner or taller than the tag.
- **Fully separate.** The Keyring loop card always shows a Loop thickness slider (1–10 mm). New Designs start at 3 mm, the same as the plate. A Design saved before this loads with its loop as thick as its plate, so it doesn't change. After that, moving one slider never moves the other.

## How it works

- `TagDesign.loop.thickness` holds the setting. `upgradeTag` fills it from `plate.thickness` when it is missing.
- `buildTag` keeps the loop's own area, `loopOnly`, apart from the tag. With a plate or a frame, it is the ring minus the plate outline and the hole. With one layer and no border, it is the tab that grips the artwork (`loopTab`) minus the artwork, with slivers dropped (`withoutSlivers`), because traced colours leave hairline gaps.
- The plate-colour solid is built as before, from 0 to the tag thickness T. Then, when the loop thickness L is different, a thinner loop has `loopOnly` cut away above L, and a taller one has it stacked from T up to L. This works the same way as the flush inlay. Artwork in one layer stays at T.

## Considered options

- **The whole ring stands up:** the full ring at the loop's thickness. A taller loop would put a raised crescent on top of the tag's edge. Rejected: the tag's top should stay clean.
- **Linked until unticked:** a "Same as tag" switch, on by default. Rejected: the owner wanted the two to be fully separate.
