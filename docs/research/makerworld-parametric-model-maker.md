# How MakerWorld's Parametric Model Maker works

Observed on 2026-10-23 in a signed-in browser. The example was the "Customizable Name Keychain/Tag" by Kong 3D (`Nunito.scad`, designId 3432085), plus public sources. Only behaviour was recorded. No MakerWorld code or model geometry was copied (see [ADR 0001](../adr/0001-clean-room-generator.md) for the rule). Our build of the same idea is `model-maker/` ([ADR 0003](../adr/0003-standalone-openscad-model-maker.md)).

## What the page does

| Finding | Evidence |
|---|---|
| **The geometry is built on MakerWorld's servers.** The browser sends parameter values. A server runs OpenSCAD and returns a preview mesh. | Network log: `POST makerworld.com/api/v1/creation-executor-service/scad/modelv2` returns 883 B of JSON. The page then loads `…/makerlab/creation/…/openscadObj/<timestamp>/Parametric_Model_Maker.obj` and `.mtl` from S3 with pre-signed URLs. Colours arrive as OBJ materials. |
| **"Protected" models never send their geometry code to the browser.** | `__NEXT_DATA__.props.pageProps` has `isProtected: true` and a 2,130-character `protectedScadContent`. That field holds only the parameter header, from `/* [Text] */` to the last ring-offset variable, with no modules. |
| **The form comes from the Customizer comments.** | Each line of the header maps to a control on screen. `Text_Size = 15; // [1:1:100]` is a slider. `Ripple_Text = false;` is a toggle. `Base_Color = "#FFFFFF"; // color` is a colour picker. `Font = "Nunito:style=Bold"; // font` is a font picker with a "…" browser. The groups are Text, Border and Thickness, Preview Colors, Keychain Ring. Underscores show as spaces. |
| **Generating costs MakerLab Credits.** | A "MakerLab Terms of Use Update" modal says some generation services now consume credits. We did not accept it. |
| **Other page assets** | Monaco 0.43 for the code view. A bed model per printer (`bbl-3dp-X1.stl`; the page chunk maps A1M/X1/H2D/H2S/A2L to bed files). A Go `wasm_exec.js`, purpose unconfirmed. Font and library lists come from `makerworld.bblmw.com/makerworld/makerlab/content-generator/openscad/` (`fonts-0.8.0.json`, `fonts-show-0.0.1.json`, `libraries-0.8.0.json`). |

## The authoring contract

MakerWorld follows the OpenSCAD Customizer (employee-confirmed) and adds the following. Sources: Bambu's sample code shown in the editor, and the release notes.

- Dropdowns `// [a, b]` and labelled `// [10:S, 20:M]`. Sliders `// [min:max]` and `// [min:step:max]`. Vectors with a range. `/* [Hidden] */`.
- `// color` on a hex string (v0.9.0) and `// font` on a font name (v0.10.0). Over 500 Google Fonts.
- File uploads, written as values `"default.png"`, `"default.svg"` or `"default.stl"` (v0.8.0).
- `module mw_plate_N()` for each 3MF plate and `module mw_assembly_view()` for the preview only (v0.10.0). Scripts that use plates can't download STL. Empty plates are dropped.
- OpenSCAD dev snapshot with manifold (an employee named commit `b550957`; v1.1.0 documents `c8fbef0`). BOSL2 at `99fcfc6` and other bundled libraries. Local `include` trees don't work.
- Export: a Bambu 3MF with each colour on its own filament and a profile the creator sets. Auto-arrange runs, and models over about 240 × 235 mm fail.

## Sources

- The live page (network log, page data, screenshot), 2026-10-23.
- [Unofficial PMM OpenSCAD reference](https://github.com/nelsonjchen/unofficial-makerworld-parametric-model-maker-openscad-docs) (community, AI-assisted; cites the release notes below).
- [PMM v0.10.0: multi-plate 3MF](https://forum.bambulab.com/t/parametric-model-maker-v0-10-0-multi-plate-3mf-generation/144618)
- [PMM v0.9.0: multi-colour](https://forum.bambulab.com/t/paramatric-model-maker-v0-9-0-support-multi-color-modeling/100160), [v0.8.0: uploads](https://forum.bambulab.com/t/paramatric-model-maker-v0-8-0-support-uploading-files/91853), [v1.1.0: UI refresh](https://forum.bambulab.com/t/parametric-model-maker-v1-1-0-major-ui-refresh/203564)
- [Makerhacks: OpenSCAD on MakerWorld](https://www.makerhacks.com/openscad-makerworld-customizer/)
- [All3DP launch coverage](https://all3dp.com/4/bambu-labs-parametric-model-maker-brings-openscad-to-makerworld/)
