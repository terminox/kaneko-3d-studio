# H-connector: Bases link like Justi-Fy Studio's Modular Clicker

The owner has Justi-Fy Studio's *Modular Clicker (Bubbly)*. Its blocks link into a bendable keychain with an "H-connector", and the owner wanted the same connector on any Clicker Studio Base.

The owner's decisions (2026-11-08):
- **Match Bubbly exactly**, so Clicker Studio Bases link with printed Bubbly blocks. The tops don't line up: Clicker Studio Bases are 18.3 mm tall and Bubbly blocks 16 mm.
- **Every kind gets it.** Single key, Picture, 3D model, Letter row and Grid get a per-Base option. The Fluted chain can be joined with H-connectors instead of jump rings, which builds the whole linked chain from one Design.
- **The exported 3MF supports the tab**, and nothing else.

## The joint

It was measured from the Bubbly 3MF's Open block. No mesh is copied, because the file's licence is personal use only. The numbers live in `H` in `clicker-studio/src/geometry/connector.ts` and are not owner-tunable. z is measured from the Base bottom.

- **Tab:** 9 wide and 3 thick, at z 2–5. A Ø4.5 hole is centred 5 mm beyond the footprint edge, with a rounded end of r 4.5. A 45° lead-in sits under the tip. The hole also takes a keyring.
- **Socket:** a 10 mm window through the wall, from z 1.6 to z 5.4. A 1.6 mm floor tongue is cut free by two 0.2 mm slits and runs up to 18 mm inward. A Ø4 pin stands on it 3 mm inside the edge, up to z 4.6, with a 45° lead-in on its outer top. The tongue springs down while the next tab slides in, or can be pushed down from inside the pocket.
- **Joined:** a 2 mm edge-to-edge gap. Pitch = right edge − left edge + 2. The joint swings on the pin, and the Base corners are the stop.
- **Presets:**
  - Tab + socket: Bubbly's "Open".
  - Tab only: "Close", the last piece.
  - Two tabs: "Double".
  - A tab side is chosen for the first two, and the socket goes opposite.

A scratch check mated a Clicker Studio Base with the real Bubbly mesh both ways and found no overlap, each pin through the other's hole, and ±6° of swing clear.

## How it fits the Base

- **Axis:** the joint runs through the Switch nearest that side. For a Picture, that is the widest point.
- **Edges:** the gap edge is the footprint's outermost x across the window band. The tab root starts at the innermost edge across the tab, plus texture depth and 1 mm, so scallops and texture cuts can't detach it. Dots count 0.8 mm into the edge.
- **Tongue:** always 1.6 thick, whatever the Floor setting, so the tab keeps its clearance and stays compatible with Bubbly. The slits run up to the thicker of the floor and the tongue.
- **Keyring loops:** a loop on a connector side is left out. With no loop left, the preview chain hangs from the tab hole.
- **Warnings:**
  - `warn.connectorBulge`: a copy of the Base, joined, would overlap it.
  - `warn.connectorSwitch`: the next tab would reach a Switch's centre post, or the window would climb into the bottom housing. This depends on Fit and on Switch placement.

## Switch orientation

An inserted tab's tip reaches about 5.3 mm from the Switch centre on the default 18 mm cap, under the housing, where the pins are. An MX switch has all its pins on one half, so it clears when its pins point away from the socket. A 5-pin switch's side posts must not point at the socket. The hint under the control says this, and a test checks it against an MX underside model. Bubbly forces the orientation with pin-guide holes. Clicker Studio's floor is solid and its pocket square, so the owner turns the switch.

## Supports

The tab hangs 2 mm above the bed.
- Each tab exports a support-enforcer volume: a part with `subtype="support_enforcer"` in the Base's colour, so no filament is added.
- The plate's object gets `enable_support=1`, `support_type=normal(manual)` and `support_on_build_plate_only=1`.
- The writer emits one object per plate, so these settings cover caps too. Manual mode puts support only inside enforcers, so caps get none.
- `scripts/check-kinds.ts` slices the connector fixtures. It requires support moves on plates with tabs, all within 5 mm of a tab's enforcer (the slicer's first-layer support base reaches about 4 mm out), and none on other plates.

## Consequences

- A wide Base, whose edge is far from the pocket, puts the tongue's hinge under solid Base. The tab still snaps in through the lead-ins, but the tongue can't be pushed down from the pocket to undo it.
- The 0.2 mm slits match Bubbly. In the Bambu CLI they slice as two walls with a gap. If prints fuse them, widen `H.slit` to 0.3.

## Considered options

- **Own sizes, tuned to Clicker Studio's walls.** This would allow a shorter tab, farther from the pins, but it couldn't link with Bubbly blocks.
- **A left/right side picker with tab/socket/none each.** More general, but socket + socket strands the tongue in the middle and holds no keyring. The presets cover Bubbly's three variants.
- **Slicer auto supports, from the bed only.** This would also support textured walls and bumps. Enforcers keep support under the tab.
