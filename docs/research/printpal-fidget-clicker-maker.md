# How PrintPal's Fidget Clicker Maker works

Observed on 2026-11-15 at `https://printpal.io/tools/fidget-clicker-maker`. The tool needs WebGL, so it was driven in headless Chromium with SwiftShader (Playwright). Behaviour was recorded **from the UI only**. Its scripts were not read and nothing was copied (see [ADR 0001](../adr/0001-clean-room-generator.md)). Our build of the idea is Clicker Studio's Split a model kind ([ADR 0015](../adr/0015-split-a-model.md)).

## What the tool is

A free, in-browser designer on PrintPal, a site selling AI 3D-model generation. Designing and previewing are free. Downloads need a Pro ($10/month) or Studio ($25/month) subscription. The page says geometry is built locally with Manifold WASM and three.js, so models never leave the computer. It has two modes, picked by a tab: **Build from Scratch** and **Cut Into a Model**.

## Build from Scratch

| Finding | Evidence |
|---|---|
| **Cap on a cup.** Artwork becomes a coloured lid. The lid sits inside a deep housing that follows the outline, with one MX switch between them. "Snap a standard MX switch between the printed halves." | The default word PRINT, in the Apart view: a cream lid with grey letters, over a dark cup with the switch pocket and a reference switch in the floor. |
| **Artwork** | Image or SVG (PNG, JPG, WEBP, SVG), with "Strip light backdrop". Or text, in 20 fonts plus "Import Font (TTF / OTF)", with "Color each letter separately". Advice: bold, flat art converts cleanly, while soft photos do not. |
| **Colours** | A colour count from 1 to 12, chips for the lid, each art colour and the housing. Clicking a colour on the 3D model recolours it, and matching pieces follow. A selected colour can be raised or lowered in 0.8 mm steps, and Shift-click selects several. |
| **Outline and size** | Border (hugs the art), disk, round square, six-sided, heart, pill. Longest side 24–90 mm, default 38. The switch seat can be nudged and turned, and the tool keeps it inside the cap. |
| **Hang tab** | Optional. Steered around the rim by an angle (⟲/⟳, default 90°), slid along the edge (mm), with a hole size (default 6 mm). |
| **Preview** | Together, Apart (split distance, default 40 %) and Slice (X, Y or Z with a position slider). "Show reference MX switch". |
| **Export** | A multi-colour 3MF with filament slots set for Bambu Studio and OrcaSlicer, a zip of cap and housing STLs, a PNG, an "AI Prompt" copy button, and Save/Load of the session as JSON. A guided tour of seven steps. |

## Cut Into a Model

| Finding | Evidence |
|---|---|
| **The idea.** An STL or OBJ is split by a horizontal plane into two parts around an MX "clicker negative". The bottom part gets the switch pocket, a 14 mm square plate cutout over a wider clip room. The top part gets a round room for the switch's top housing with a stem post and cross socket inside. | A 40 × 34 × 50 mm egg. The cutter preview showed an orange slab and box (bottom) and a red rounded room with a cross post (top), on a blue cut plane. After the cut, the bottom half's face showed the square pocket. |
| **Placement** | The cutter is auto-placed "at the most-interior point of the cross-section at mid-height", and the model is scaled up if needed. The console logged "Auto-place: clearance at chosen point ~17.0 mm vs. required ~16.0 mm — no scale change." It can then be moved by clicking the model, by a drag gizmo, by X/Y/Z fields, or by nudge arrows with a step, and turned around Z in 5° steps. |
| **Model controls** | Rotate X/Y/Z (0–360°), scale 1–2000 %, size and triangle count shown, Reset. "Z is up. Rotate so the click axis is vertical. The cutter is fixed mm, scale the model so it fits." |
| **Styles** | **Regular**: a flat seam. **Embedded**: an inner pillar (5 mm inset) on the top half nests in a 4 mm well (1.5 mm wall) in the bottom half. **In a Box**: the model is scaled to about 40 × 40 mm, the bottom half becomes a 40 × 40 × 22 mm box (36 × 36 × 10 cavity), and the top is trimmed to 34 × 34 for 13 mm so it slots in with 1 mm clearance. Up to 8 characters of front text on the box, 1 mm proud, as a separate part. |
| **Preview and export** | Exploded view with a distance, show or hide each part, an assembly animation. Bottom STL, Top STL, or both as a zip. The two halves show flush in the together view. |
| **Claims to treat with care** | The FAQ says cut models need "no metal switch, no spring", yet the cutter is an MX switch pocket and stem socket, and the Build mode says to fit a switch. The flush together view leaves no room for key travel. |

## What we kept and changed

The owner asked for Cut Into a Model and every extra above that Clicker Studio lacked: the Apart and Slice preview, STL download, a hang tab at any angle, SVG art traced from its paths, and imported fonts. Build from Scratch was already covered by the Picture kind, layer heights, part colours and keyring loops. Changes from PrintPal:

- **The switch is real, and the halves leave room to press it.** The top half rests one key travel plus 0.6 mm above the bottom, so fully pressed the model is whole again.
- **Switches are placed automatically.** The cut height and the switch spots come from the model's cross-section with the same reach rule shared caps use (up to four switches). Then they can be nudged in Advanced mode.
- **Plug and Plain** replace Embedded and Regular. In a Box is the existing 3D model kind.
