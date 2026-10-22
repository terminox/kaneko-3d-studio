// Name keychain: raised letters on a matching outline, with a keyring loop.
// Kaneko 3D Printing. Written for the model maker; MakerWorld PMM syntax.

/* [Text] */
// Name shown on the keychain
Name = "Kaneko";
// Font and style
Font = "Nunito:style=Black"; // font
// Letter height in mm (capital letters come out about this tall)
Text_Size = 14; // [6:0.5:40]
// Stroke weight: 1 = the font as drawn, higher = bolder
Text_Weight = 1; // [0.6:0.05:1.6]
// Letter spacing: below 1 squeezes the letters together
Letter_Spacing = 1; // [0.7:0.05:1.5]

/* [Base] */
// Thickness of the outline plate under the letters
Base_Thickness = 3; // [1:0.2:8]
// Height of the letters above the plate
Text_Height = 1.2; // [0.4:0.2:5]
// How far the plate reaches past the letters
Border = 2.5; // [1:0.25:8]
// Fill the holes inside letters like O and A
Fill_Holes = true;

/* [Colors] */
// Plate and ring colour
Base_Color = "#FFFFFF"; // color
// Letter colour
Text_Color = "#1E6BFF"; // color

/* [Keyring] */
// Where the keyring loop goes
Ring_Side = "left"; // [left:Left, right:Right, none:No ring]
// Hole diameter for the split ring
Ring_Hole = 4; // [2:0.5:10]
// Wall width around the hole
Ring_Wall = 2.5; // [1.5:0.5:6]
// Move the loop up (+) or down (-) from the text centre
Ring_Offset = 0; // [-20:0.5:20]

/* [Hidden] */
$fn = 48;
weight_offset = (Text_Weight - 1) * Text_Size * 0.06;
metrics = textmetrics(Name, font = Font, size = Text_Size, spacing = Letter_Spacing, halign = "center", valign = "center");
text_left = metrics.position.x - weight_offset;
text_right = metrics.position.x + metrics.size.x + weight_offset;
ring_r = Ring_Hole / 2 + Ring_Wall;
// Centre the hole just outside the border, so the wall overlaps the plate.
ring_x = Ring_Side == "left" ? text_left - Border - Ring_Hole / 2
       : text_right + Border + Ring_Hole / 2;

module letters() {
  offset(delta = weight_offset)
    text(Name, font = Font, size = Text_Size, spacing = Letter_Spacing, halign = "center", valign = "center");
}

module plate_outline() {
  if (Fill_Holes) fill() offset(r = Border) letters();
  else offset(r = Border) letters();
}

module plate() {
  linear_extrude(Base_Thickness) difference() {
    union() {
      plate_outline();
      if (Ring_Side != "none") translate([ring_x, Ring_Offset]) circle(r = ring_r);
    }
    if (Ring_Side != "none") translate([ring_x, Ring_Offset]) circle(d = Ring_Hole);
  }
}

color(Base_Color) plate();
color(Text_Color) translate([0, 0, Base_Thickness]) linear_extrude(Text_Height) letters();
