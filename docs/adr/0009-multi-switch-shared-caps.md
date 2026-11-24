# Large caps sit on several switches, placed automatically

Large clickers wobble on one MX switch. The cap is a lever on its stem: a press far from the switch creates a moment that pushes the stem rails against the housing, so the key binds, and the stem's one or two degrees of play lets a far edge droop about a millimetre. Keyboards solve this with a stabiliser on any key 2u (38 mm) or wider. Clickers have no stabilisers, so a shared cap (Clicker Studio's Single key, Picture and 3D model kinds) now gets more switches instead. This is in `clicker-studio/src/geometry/switches.ts`.

The owner's decisions (2026-11-04):
- The count is automatic, with an override (Auto / 1–4) in Advanced mode. Positions are never set by hand (superseded by [ADR 0016](0016-manual-switch-positions.md): automatic stays the default, and the owner can move them).
- **The rule:** every point of the cap must lie within the *reach* of some switch. Reach is a Fit field, default 22 mm. A 2u keycap is 38 × 19 mm, so its corner is 21.3 mm from the stem; 22 keeps the default 40 mm picture (42.4 mm with its border) on one switch. A 60 × 20 mm bar gets two, a 45 mm round cap three, a 50 mm square four.
- Switches stay at least the *pitch* apart (Fit field, 18 mm: two 15.8 mm clip rooms plus a plate web). The housing keep-out must fit inside the cap wall and the clip room inside the Base, the same tests that already warned for one switch.
- The first switch sits where it always did (the deepest point of the shape, or the picture's anchor) with the tight socket. The others get *extra stem fit* (Fit field, 0.1 mm), so one socket locates and the rest float, and print tolerance can't make the cap bind.
- Simple mode shows only a note ("2 switches, placed automatically"). Advanced mode has the override and the three Fit fields.
- `pricing.json` gained `extras.perExtraSwitch` (placeholder 0). The order sheet counts every switch.
- Only switches this round: no thin-detail, auto-size or auto-colour work.

## How the spots are chosen

The cap and Base outlines are rasterised at 0.5 mm and eroded by the keep-out and clip-room squares, which gives the ground a switch centre may stand on. Two switches go on the shape's principal axis, as far apart as helps. Three or four start from farthest-point seeds and settle by k-means over the cap's area, kept on feasible ground, then pushed apart to the pitch. Auto takes the smallest count whose reach is within the limit. When nothing reaches every edge it takes the best that fits, and warns only when the miss is more than a quarter of the reach, so a 36.5 mm heart (which can hold only one switch) or a cat face whose ear tips miss by a fraction stay quiet. The whole search costs a few milliseconds.

## Considered options

- **Manual switch positions.** The most control, but the owner wanted the system to do the work, and a hand-placed switch can break through the Base wall unnoticed.
- **A size threshold alone** (for example "over 40 mm, two switches"). Ignores shape: a 60 × 20 bar and a 40 × 40 square need different counts and spots.
- **Reach 19 mm** (half of 2u). The corner of a 2u key is 21.3 mm out, and 19 would have put the default picture on three switches.
- **Stabilisers.** Not a printed part, and not stocked.
