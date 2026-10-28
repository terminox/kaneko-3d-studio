# Tag Studio: picture name tags as a third app on Clicker Studio's modules

The owner wanted to upload a picture and turn it into a styled name tag: the picture handling of Clicker Studio, with the look and options of Model Maker's name keychain. We built it as a **separate app**, `tag-studio/`, served at `/tag-studio/` next to the other two tools ([ADR 0005](0005-vercel-hosting-behind-team-password.md)).

It imports Clicker Studio's pure modules through an `@cs` alias, the same way Clicker Studio imports Model Maker through `@mm`:
- the manifold kernel and outline helpers
- picture tracing (background removal, Lab k-means colour split, tracing)
- HarfBuzz text shaping with Thai, Korean, Chinese and emoji fallbacks
- the plate packer that keeps the prime-tower corner free
- the 3MF export, which goes through Model Maker's writer

UI pieces bound to Clicker Studio's state (the crop dialog, the DOM helpers and the viewport) are copied and trimmed instead. Importing them would pull in Clicker Studio's state module and its side effects.

The owner's decisions:
- The plate follows the outline of the picture plus the name, grown by a border and closed until it is one piece.
- The artwork is raised, the back is flat, and the tag hangs from a keyring loop only.
- The name goes below, above, left or right of the picture.
- The picture splits into 1–5 colours, plus the plate and name colours and optional sticker rings. There's a warning past 4 colours, the AMS Lite limit.
- A names list makes one tag per name, packed onto A1 plates.
- The app reuses the AI cartoon endpoint and its daily cap, and has a Thai/English toggle.
- It exports a 3MF and a `.tag.json` Design. There's no price or order sheet.

## Considered options

- **A "Name tag" kind inside Clicker Studio.** Less code, but it mixes switch and Base concepts into a part that has neither, and the owner asked for a separate tool.
- **An OpenSCAD model in Model Maker.** Rejected: OpenSCAD can't colour-split a photo. `logo-tag.scad` already shows the limit, since it takes a one-colour SVG.

## Consequences

- `textRings` in `clicker-studio/src/text/shape.ts` gained an optional `spacing` argument (default 1, so Clicker Studio is unchanged).
- Rings and plate offsets are measured from a simplified outline (`simplify(0.05)`). Round offsets of raw traced outlines made a ringed tag take about 350 ms; now it takes about 100 ms.
- Tag Studio has no fonts of its own. `bun run setup` copies Clicker Studio's (same `fonts.config.json`), so Clicker Studio must be set up first, which `scripts/build-site.sh` already does.
