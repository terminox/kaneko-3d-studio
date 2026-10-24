# How Maaprint3Dshop's keycap clicker tool works

Observed on 2026-10-24 at `https://maaprintshop.com/quote?kc=pic#clk`, in a headed browser (the tool needs WebGL). `#clk` opens the shop's Keycap Clicker tab (คลิกเกอร์) and `kc=pic` opens it in picture-shaped mode. The shop's `clicker.js` starts with a notice forbidding copying and reverse-engineering, so after its header comment, behaviour was recorded **from the UI only**: no code was read further, and nothing was copied (see [ADR 0001](../adr/0001-clean-room-generator.md)). Our build of the same idea is `clicker-studio/` ([ADR 0004](../adr/0004-standalone-clicker-studio.md)).

## What the tool is

A customer-facing configurator on a Thai print shop's quote page. Next to it are file-upload print quoting, an AI model generator, name keychains, Crocs charms, boxes, a shop and a design-service estimator. Customers design a clicker, see a price, and add it to a cart. The shop prints the parts, fits an MX switch and assembles it. The clicker header says it shares fonts, colours and icons with the keychain tool, and exports a colour-split 3MF with parts laid out separately.

## Evidence

| Finding | Evidence |
|---|---|
| **Picture-shaped clicker.** Uploading a PNG opens a crop dialog (rotate left/right, whole picture, fine rotation, brightness, contrast, saturation, an "AI cartoon" button). After that, the Top Cap and the Base both follow the picture's outline. | A yellow cat-face PNG became a cat-shaped cap with flush yellow and black areas, 39 × 52 × 29.2 mm assembled. In the exploded view, the Base shell (with the switch plate inside and a keyring loop) and the cap lie side by side. |
| **Picture options** | Remove background on/off. Punch enclosed gaps. Background-removal strength 70. A 1–7 colour split with "quick", "4-colour printer" and "7-colour printer" presets. Base shape: follow, circle, hexagon. "The MX switch goes in the middle of the picture automatically." |
| **Kinds** | Multi-key + Base. Grid / T layouts (row, column, grid, WASD, arrows, custom, T). Fluted Base per key that links into a chain ("press the tongue from inside, slide the plate in, the pin locks"). Single key + Base. Picture-shaped. Caps only / A–Z set. Base only. A Simple and an Advanced ("adjust everything") screen. |
| **Keycap options** | 11 shapes (square, capsule, circle, heart, cloud, bear, cat, flower, hexagon, octagon, keyboard key). Size 18 mm, height 9 mm, corner radius 2–4 mm. Decoration per key: letter, emoji, picture, flower, heart, star, sparkle, arrows. A two-layer outline "one step lower than the decoration". Per-key cap and decoration colours. "Random cute colours". |
| **Base options** | Rim around the cap 3.0 mm, clearance 0.8 mm, rim rising 2.0 mm around the cap. Wall textures: none, vertical ribs, sawtooth, horizontal grooves, diamond, diagonal wave, dots. Keyring loop left / top / right / both. Chain shown in the preview: ball chain (free) or cord (+10 ฿). |
| **Colours** | 20 preset colour pairs ("tap: Base and text take the first colour, the cap the second") plus per-part swatches. |
| **Preview** | Assembled, exploded "as printed", show switch, cut-away, live dimensions, reset view. |
| **Commerce** | 1 key 39 ฿, 3 keys 79 ฿, 9 keys 199 ฿; an extra fee past 3 keys. Add to cart, order now, download the file for credits (10, 5 for members; 50 for a commercial licence). A UV full-colour print upsell through LINE. Google sign-in and cloud "My files". |

## What we kept and dropped

The owner kept every clicker kind and extra, including the AI cartoon step (through OpenRouter), the 7-colour split, and Korean and Chinese text. Dropped: the cart, credits and licence downloads, the LINE UV upsell, and Google sign-in with cloud saves. In their place: a price per Design from the owner's own table, saved Design and Order files, and a printable order sheet. Icons come from a bundled set that can be used on prints that are sold, not an online search.
