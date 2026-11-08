# H-connector: Bases link like Justi-Fy Studio's Modular Clicker

The owner has Justi-Fy Studio's *Modular Clicker (Bubbly)*. Its blocks link into a bendable keychain with an "H-connector", and the owner wanted the same connector on any Clicker Studio Base.

The owner's decisions (2026-11-08):
- **Match Bubbly exactly**, so Clicker Studio Bases link with printed Bubbly blocks. The tops don't line up: Clicker Studio Bases are 18.3 mm tall and Bubbly blocks 16 mm.
- **Every kind gets it.** Single key, Picture, 3D model, Letter row and Grid get a per-Base option. The Fluted chain can be joined with H-connectors instead of jump rings, which builds the whole linked chain from one Design.
- **The exported 3MF supports the tab**, and nothing else.

Later the same day, after trying it, the owner asked for more:
- **Each side on its own.** Left, Right, Top and Bottom each carry nothing, a tab or a socket. This allows a socket only, a vertical chain, and corner joints. It replaced the first presets (tab + socket, tab only, two tabs) and the tab-side picker.
- **Bases that bulge past the joint must still link.** A heart's lobes stuck out past the joint, so linked pieces would touch. The joint now extends out to the Base's outermost point instead of moving.

The next day (2026-11-09) the owner saw tabs and sockets off-centre on some models, and chose to centre every joint on the middle of the Base.

## The joint

It was measured from the Bubbly 3MF's Open block. No mesh is copied, because the file's licence is personal use only. The numbers live in `H` in `clicker-studio/src/geometry/connector.ts` and are not owner-tunable. z is measured from the Base bottom.

- **Tab:** 9 wide and 3 thick, at z 2–5. A Ø4.5 hole is centred 5 mm beyond the footprint edge, with a rounded end of r 4.5. A 45° lead-in sits under the tip. The hole also takes a keyring.
- **Socket:** a 10 mm window through the wall, from z 1.6 to z 5.4. A 1.6 mm floor tongue is cut free by two 0.2 mm slits and runs up to 18 mm inward. A Ø4 pin stands on it 3 mm inside the edge, up to z 4.6, with a 45° lead-in on its outer top. The tongue springs down while the next tab slides in, or can be pushed down from inside the pocket.
- **Joined:** a 2 mm edge-to-edge gap. Pitch = right edge − left edge + 2. The joint swings on the pin, and the Base corners are the stop.
- **Ends:** each side is `none`, `tab` or `socket` (`BaseOptions.connectors`). Bubbly's "Open" is a tab and a socket on opposite sides, "Close" is a tab only, and "Double" is two tabs. Designs saved with the first presets are mapped to the same ends (`upgradeBase`).

A scratch check mated a Clicker Studio Base with the real Bubbly mesh both ways and found no overlap, each pin through the other's hole, and ±6° of swing clear.

## How it fits the Base

- **Frame:** each joint is built facing +x and turned to its side (top is +y), so all four sides share one code path.
- **Axis:** the middle of the footprint on that side: left and right joints sit at its mid-height, top and bottom joints at its mid-width. Opposite joints always share one line, so a chain runs straight, and the joints line up with the keyring loops' centre lines. On a Letter row with an even count, the top joint sits between the middle keys; on a single-key heart it sits a little above the Switch.
- **Joint face:** the footprint's outermost point on that side, over the whole footprint. Dots add 0.8 mm. Nothing of the Base passes the face, so any two pieces, of any shape and Bubbly blocks too, keep the 2 mm gap when linked.
- **Reaching the face:** where the wall is farther in than the face, a pad fills the gap. It also gives a flat mating face over texture and scallops.
  - A socket gets a **housing**: 15 mm wide (the 10 mm window plus 2.5 mm walls) and 7.0 mm tall, so a 1.6 mm roof bridges the window.
  - A tab gets an **arm**: 9 mm wide, from the bed to the tab top. Only the part of the tab past the face overhangs, as on Bubbly.
  - The pad and tab root start at the innermost wall across the pad, plus texture depth and 1 mm, so scallops and texture cuts can't detach them. On the default rounded-square Base the pad sits inside the wall and nothing changes.
- **Tongue:** always 1.6 thick, whatever the Floor setting, so the tab keeps its clearance and stays compatible with Bubbly. The slits run up to the thicker of the floor and the tongue.
- **Two sockets:** their tongues must not cross, or the slits cut pieces of floor free. Opposite sockets on one line share the span with a 2 mm bridge in the middle. Otherwise the later socket's tongue stops 1.5 mm short of the earlier one's. A 1.6 mm PLA tongue must bend 2.6 mm at the pin, which keeps it near 3 % strain only from about 14 mm long (`H.tongueMin`). Shorter tongues warn. On a single-switch Base of the default size, two sockets always warn: they meet under the switch.
- **Keyring loops:** a loop on a connector side is left out. With no loop left, the preview chain hangs from the tab hole.
- **Warnings:**
  - `warn.connectorSwitch`: an inserted tab would reach the Switch's pins (see below), or a window would climb into the bottom housing. This depends on Fit and on Switch placement.
  - `warn.connectorTongue`: a tongue is shorter than 14 mm.
  - The first version's `warn.connectorBulge` is gone: the joint face makes it impossible.

## Switch orientation

An inserted tab's tip reaches about 5.3 mm from the Switch centre on the default 18 mm cap, under the housing, where the pins are. An MX switch has all its pins on one half: with the pins pointing +y, they sit at (−3.81, 2.54) and (2.54, 5.08), r 0.75, around a centre post of r 2.

`pinSide` picks the way the pins should point:
- With one socket, the opposite side.
- Otherwise a side with no socket, preferring one opposite a socket.
- With four sockets, none, which warns.

The tip must stay this far from the Switch centre:
- 6.1 mm for a socket on the pin side.
- 4.9 mm for a socket beside the pins.
- 2.5 mm for a socket opposite the pins.

A 5-pin switch's side posts must not point at a socket. The hint under the control names the side, and a test checks every single-socket side against an MX underside model. Bubbly forces the orientation with pin-guide holes. Clicker Studio's floor is solid and its pocket square, so the owner turns the switch.

## Supports

The tab hangs 2 mm above the bed.
- Each tab exports a support-enforcer volume under its part past the joint face (the arm inside the face stands on the bed): a part with `subtype="support_enforcer"` in the Base's colour, so no filament is added.
- The plate's object gets `enable_support=1`, `support_type=normal(manual)` and `support_on_build_plate_only=1`.
- The writer emits one object per plate, so these settings cover caps too. Manual mode puts support only inside enforcers, so caps get none.
- `scripts/check-kinds.ts` slices the connector fixtures. It requires support moves on plates with tabs, all within 5 mm of a tab's enforcer (the slicer's first-layer support base reaches about 4 mm out), and none on other plates.

## Consequences

- A wide Base, whose edge is far from the pocket, or a long housing puts the tongue's hinge under solid Base. The tab still snaps in through the lead-ins, but the tongue can't be pushed down from the pocket to undo it.
- A Base that bulges far past the joint gets a long housing or arm. That is the price of linking with anything.
- The 0.2 mm slits match Bubbly. In the Bambu CLI they slice as two walls with a gap. If prints fuse them, widen `H.slit` to 0.3.

## Considered options

- **Own sizes, tuned to Clicker Studio's walls.** This would allow a shorter tab, farther from the pins, but it couldn't link with Bubbly blocks.
- **Presets (tab + socket, tab only, two tabs) with a tab side.** The first version. They covered Bubbly's three variants, but not a socket only, a vertical chain or corner joints, so they were replaced by an end per side. Two sockets are allowed and warn when their tongues come out short.
- **Moving the joint to where the Base bulges.** No extra pad, but a chain would no longer run straight through the switches, and thin or curved bulges can't hold the 15 mm housing.
- **The joint through the Switch nearest its side** (the first two versions). It kept the tab tip in a known place relative to the pins, but rows with an even count, Grids and caps on several switches came out up to 12 mm off-centre, and a 2×2 Grid's left and right joints landed on different rows, so its chain zig-zagged. `switchClash` already treats every Switch within 10.5 mm of the joint line as dead ahead, so a centred joint is checked at least as strictly.
- **Checking only a joined copy of the same Base for overlap** (the first version's warning). It said nothing about linking to other shapes or Bubbly blocks, and it gave no fix.
- **Slicer auto supports, from the bed only.** This would also support textured walls and bumps. Enforcers keep support under the tab.
