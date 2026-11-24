# The keyring loop's height up the Base wall

The keyring loop always sat flush with the Base's underside. On 2026-11-25 the owner asked to place it vertically: Bottom (0%), 25%, Center (50%), 75%, Top (100%), or by hand.

The owner's decisions:
- **Vertical means up the wall, off the bed.** It works on every side and at Any angle, and a pair of loops shares one height.
- **0% is today's loop, 100% puts its top flush with the rim.** Older Designs load at 0%.
- **By hand in percent or mm. The percent is what's kept**, so the mm follow when the Base's height changes and the loop never leaves the wall.
- **The loop stays flat, with slicer support under it.** The 3MF carries a support enforcer per raised loop, the way H-connector tabs do ([ADR 0011](0011-h-connector.md)). An STL can't, so the panel says to turn support on.
- Shown in Simple and Advanced. Fluted ring links have no loop picker, so their loops stay at the bottom.

## Considered options

- **A 45° sloped underside:** prints with no support, but looks heavier and makes a longer hole.
- **Only a warning:** easy to miss, and the loop then fails to print.
- **Keeping mm instead of percent:** the loop would drift from the place it was put when the Base's height changes.
- **Dragging in the 3D preview:** more to build and test; the owner chose the slider and boxes.
