# Build the clicker generator clean-room instead of reusing or licensing the reference

The MakerLab Clicker Generator (most likely Vostok Labs') is the model we want to match. Its source is CC BY-NC-ND, and selling prints made with it needs a paid licence (a $99 lifetime licence for that one generator, or a membership). We also need things it doesn't offer: geometry we own, our tuned Print Profile embedded in the file, Decorations on sides and undersides, saved Designs, and several Designs per Plate. So we rebuild it ourselves. We may copy its *behaviour*, meaning the options, defaults and workflow recorded in a teardown checklist. We never copy its code or exported meshes, or those of any other unlicensed generator.

## Considered Options

- **Pay for the reference's commercial licence and use it as-is.** Cheap ($99 one-off), but we would depend on another seller's tool for every Order, and none of the missing features above would be ours to add.
- **Fork the published source.** Not allowed: the licence forbids derivatives and commercial use.
