# Reference generator teardown

Type: research
Status: resolved
Blocked by: none
Map: [Clicker Generator](../map.md)

## Question

Using a real browser (the `/browse` skill), open the MakerLab Clicker Generator (https://makerworld.com/en/makerlab/community/clicker-generator/edit) and the Vostok Labs Clicker Generator.

1. Who built the MakerLab tool, and what terms apply to *selling* Clickers made with it?
2. Write a **parity checklist** covering every option it offers, with its range and default and the UX behaviour around it: Cap and Block modes, Outlines, Switch count and placement, Decoration inputs (text and fonts, SVG, PNG, icons) and where they go, colors, the keyring loop, fit settings, the fit-test strip, and the export format and options.

The clean-room rule applies ([ADR 0001](../../../docs/adr/0001-clean-room-generator.md)): record behaviour only. Never copy code, and never download or store its meshes. If Cloudflare or a login blocks access, say so plainly so this ticket can become a HITL task.

## Answer

Full parity checklist with sources: branch `research/reference-generator-teardown` → `docs/research/reference-generator-teardown.md` (§4 is the checklist, §5 is where the reference stops short of our destination).

- **Access:** the MakerLab tool page redirects to Bambu Lab sign-in, so the checklist documents **Vostok Labs' standalone app**. That is almost certainly the same tool (MakerLab "From Partner" badge, near-identical description, the same three tools sold with a lifetime licence), but it's unconfirmed. Confirming is a HITL task: [Confirm the MakerLab tool matches the teardown](11-confirm-makerlab-tool.md).
- **Selling terms:** personal printing is free. Selling prints needs a Vostok membership ($15/mo, $40/quarter, $150/yr) or a one-off **$99 lifetime licence per generator**. Code and output are CC BY-NC-ND 4.0.
- **Design kinds:** Image, SVG, Icon, Text and 3D-model modes all make a **Cap Clicker** with 1–3 Switches. "Blocks" mode makes a **Block Clicker** of up to 24 keys (a row or up to a 6×6 grid) with Row, Column, Grid, WASD, Arrows or Custom layouts.
- **Decorations:** top surface only (Top Cap or each Keycap). No side or underside Decorations; Block walls get a texture only.
- **Fit settings:** top/base gap −0.30…+0.60 mm, stem fit ±0.40 mm, pocket fit ±5 %, all defaulting to 0. The **Fit Test** is 5 tiles around the current stem fit (0.05, 0.10 or 0.20 mm steps), and it tests **stem fit only**.
- **Export:** one click, no options. A 3MF with separate top and base objects, each colour on its own filament slot, and a **stock A1 / PLA Basic profile** embedded (not tunable).
- **Method note:** to learn the export structure, the agent read only the file names and small settings files of an export held in page memory. No mesh was opened or saved and nothing was written to disk; the clean-room rule held.
