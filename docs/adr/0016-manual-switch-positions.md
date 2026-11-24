# Switches under a shared cap can be moved by hand

ADR 0009 placed switches automatically and ruled out setting them by hand, because a hand-placed switch could break through the Base wall unnoticed. On uploaded pictures the automatic spot sometimes looks wrong, so on 2026-11-24 the owner asked to adjust it. Automatic placement stays the default.

The owner's decisions:
- Drag on a flat map and in the 3D preview, move with the keyboard, and type exact numbers.
- A switch stops at the nearest spot where it fits. This answers ADR 0009's objection.
- Single key, Picture and 3D model, in Simple and Advanced mode. Split a model keeps its nudge.

How it works:
- `cap.spots` holds every switch's position as a share of the cap's bounds, so spots follow a change of width, border or crop. Without it, placement is automatic, and older Designs build as before.
- The build sends the page the mask that automatic placement uses. `geometry/spots.ts` has no kernel code, so the page clamps a drag exactly as the build does.
- Pinned spots fix the count. An edge more than 1.25 times the reach from every switch warns. If the switches can't all fit any more, the build places them automatically and warns.
- Changing the count, or uploading a new picture or model, clears the spots.

## Considered options

- **An offset from the automatic spot**, like Split a model's nudge. Automatic spots jump when the count or the trace changes, so an offset would jump too.
- **Millimetres.** A spot would drift off the picture's feature when the width changes.
- **Allowing any spot with a warning.** The owner chose to stop at the edge, so every export is printable.
