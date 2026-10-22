// Every parameter type the model maker understands, plus multi-plate output.
// Used as a test fixture and as a reference when writing new models.

/* [Numbers] */
// Spinbox: whole numbers step by 1
Count = 3;
// Spinbox: one decimal place steps by 0.1
Gap = 1.5;
// Slider from min to max
Width = 30; // [10:80]
// Slider with a step
Depth = 20; // [10:5:60]
// Slider with a decimal step
Height = 2.4; // [1:0.2:6]

/* [Choices] */
// Dropdown of numbers
Sides = 6; // [3, 4, 5, 6, 8]
// Dropdown with labels
Size = 1; // [0.75:Small, 1:Medium, 1.5:Large]
// Dropdown of strings with labels
Shape = "round"; // [round:Round, square:Square]
// Checkbox
Show_Label = true;

/* [Text] */
// Free text
Label = "Demo";
// Text limited to 8 characters
Short = "ABC"; // 8
Font = "Roboto:style=Bold"; // font

/* [Vectors] */
// Each number gets its own spinbox
Offset = [0, 0];
// A vector with a range
Scale = [1, 1, 1]; // [0.5:0.1:2]

/* [Colors] */
Body_Color = "#3A7BD5"; // color
Label_Color = "#FFFFFF"; // color

/* [Hidden] */
$fn = 40;

module body() {
  scale(Scale) translate([Offset.x, Offset.y, 0]) color(Body_Color)
    if (Shape == "round") cylinder(d = Width * Size, h = Height, $fn = Sides);
    else translate([-Width * Size / 2, -Depth * Size / 2, 0]) cube([Width * Size, Depth * Size, Height]);
}

module label() {
  if (Show_Label) color(Label_Color)
    translate([Offset.x, Offset.y, Height * Scale.z])
      linear_extrude(0.8) text(Label, font = Font, size = Width * Size / 6, halign = "center", valign = "center");
}

module pegs() {
  for (i = [0 : Count - 1]) translate([i * (6 + Gap), 0, 0]) color(Body_Color) cylinder(d = 6, h = 8);
}

// Plate 1: the body with its label. Plate 2: the pegs, printed separately.
module mw_plate_1() { body(); label(); }
module mw_plate_2() { pegs(); }

// Shown in the preview only, never exported.
module mw_assembly_view() {
  mw_plate_1();
  translate([-(Count - 1) * (6 + Gap) / 2, Depth, 0]) mw_plate_2();
}
