# Kaneko 3D Printing

A small business selling 3D-printed fidget clickers. Each one is custom-made to an order, and the clicker generator turns an order's choices into a ready-to-print file.

## Language

### Product

**Clicker**:
A finished fidget product made of printed parts holding one or more Switches that click when pressed.
_Avoid_: fidget, keychain, toy

**Cap Clicker**:
A Clicker whose Switches sit under one shared Top Cap that is pressed as a whole; almost always a single Switch.
_Avoid_: single clicker, image clicker

**Block Clicker**:
A Clicker made of a row or grid of keys, each Switch with its own Keycap (for example, one letter per key).
_Avoid_: letter clicker, keyboard clicker

**Switch**:
An MX-style mechanical keyboard switch, bought rather than printed.
_Avoid_: button, key

### Parts

**Base**:
The printed body of a Clicker that holds its Switches.
_Avoid_: body, case, housing

**Top Cap**:
The single printed top of a Cap Clicker, covering all its Switches and pressed as one.
_Avoid_: lid, cap, top, cover

**Keycap**:
A printed cap that sits on one Switch of a Block Clicker.
_Avoid_: key, cap

**Switch Pocket**:
The cutout in a Base that a Switch clips into.
_Avoid_: switch hole, socket, cutout

### Customization

**Design**:
The complete set of choices that defines one Clicker, saved so it can be reprinted exactly.
_Avoid_: config, spec, model, order options

**Order**:
A customer purchase, fulfilled by printing one or more Designs.
_Avoid_: job, request

**Outline**:
The footprint shape of a Clicker seen from above.
_Avoid_: shape, silhouette

**Decoration**:
Text, an image, or an icon applied to a surface of a Clicker (Top Cap, Keycap, top surface, side, or underside).
_Avoid_: art, graphic, engraving, logo (a logo is one kind of Decoration)

### Printing

**Plate**:
One print job: the parts of one or more Designs laid out together on the printer's build plate.
_Avoid_: batch, build, job

**Print Profile**:
The tuned printer, process, and filament settings every Plate is printed with.
_Avoid_: preset, settings

**Fit Test**:
A printed set of small test pieces used to find which clearances and detail sizes work on this printer and filament.
_Avoid_: calibration print, tolerance test, coupon set

**Fit Calibration**:
The clearance and detail values chosen from a Fit Test, applied as defaults to every Design.
_Avoid_: tolerances, offsets, fit settings

### Model Maker

**Model Maker**:
The local tool that turns an OpenSCAD script into a form, a preview and a Bambu-ready 3MF, like MakerWorld's Parametric Model Maker. It is separate from the clicker generator.
_Avoid_: customizer, PMM (that is MakerWorld's tool)

**Parametric Model**:
An OpenSCAD script written for the Model Maker, whose Customizer comments define its Parameters (for example the name keychain).
_Avoid_: template, script, scad

**Parameter**:
One value a Parametric Model exposes in the form, such as a name, a size, a colour or a font.
_Avoid_: option, setting, variable

A Parametric Model's `mw_plate_N()` modules each become one Plate in the exported 3MF. Its colours become separate parts on separate filaments, as with Decorations.

### Clicker Studio

**Clicker Studio**:
The local Clicker designer modelled on Maaprint3Dshop's tool, with kinds, prices, Orders and order sheets. It is separate from the clicker generator.
_Avoid_: configurator, quote tool

**Picture Clicker**:
A Cap Clicker whose Top Cap and Base follow the Outline of an uploaded picture, with the picture's colours inlaid on top.
_Avoid_: image clicker, photo clicker

**Fluted Chain**:
Single-key Clickers with scalloped Bases, linked side by side with metal jump rings through small loops.
_Avoid_: cupcake clicker, linked base

**A–Z Set**:
26 loose Keycaps, one per letter, printed without Bases.
_Avoid_: alphabet set, letter pack

### Tag Studio

**Tag Studio**:
The local tool that turns an uploaded picture and one or more names into Name Tags. It reuses Clicker Studio's picture and text handling.
_Avoid_: tag maker, badge maker

**Name Tag**:
A flat keychain whose plate follows the Outline of a picture and a name, with the picture's colours and the name raised on top and a keyring loop. With one layer it has no plate: the colours sit side by side at the full thickness, held by a flat frame.
_Avoid_: badge, name keychain (that is the Model Maker's Parametric Model), label
