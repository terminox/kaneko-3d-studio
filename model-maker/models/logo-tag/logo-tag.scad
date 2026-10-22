// Logo tag: a rounded tag with an uploaded SVG logo and a label, both raised in
// a second colour. Kaneko 3D Printing. Written for the model maker.

/* [Logo] */
// Upload an SVG logo (filled shapes; strokes are ignored)
Logo = "default.svg";
// Logo size along its longest side, in mm
Logo_Size = 22; // [8:1:60]

/* [Label] */
// Text under the logo (leave empty for none)
Label = "KANEKO";
Font = "Poppins:style=Bold"; // font
Label_Size = 6; // [3:0.5:16]

/* [Tag] */
Width = 40; // [20:1:120]
Height = 46; // [20:1:120]
Corner_Radius = 6; // [0:0.5:20]
Thickness = 2.4; // [1.2:0.2:6]
// Height of the logo and label above the tag
Relief = 1; // [0.4:0.2:3]
// Hole for a keyring or lanyard
Hole = true;
Hole_Diameter = 5; // [3:0.5:10]

/* [Colors] */
Tag_Color = "#202020"; // color
Logo_Color = "#F2C230"; // color

/* [Hidden] */
$fn = 48;
hole_y = Height / 2 - Hole_Diameter / 2 - 3;
label_y = Label == "" ? 0 : -Height / 2 + Label_Size / 2 + 4;
logo_y = (Hole ? hole_y - Hole_Diameter / 2 : Height / 2) / 2 + (Label == "" ? -Height / 2 : label_y + Label_Size / 2) / 2;

module rounded(w, h, r) {
  offset(r = r) square([max(w - 2 * r, 0.01), max(h - 2 * r, 0.01)], center = true);
}

module logo2d() {
  resize([Logo_Size, 0], auto = true) import(Logo, center = true);
}

module tag() {
  linear_extrude(Thickness) difference() {
    rounded(Width, Height, Corner_Radius);
    if (Hole) translate([0, hole_y]) circle(d = Hole_Diameter);
  }
}

color(Tag_Color) tag();
color(Logo_Color) translate([0, 0, Thickness]) linear_extrude(Relief) {
  translate([0, logo_y]) logo2d();
  if (Label != "")
    translate([0, label_y]) text(Label, font = Font, size = Label_Size, halign = "center", valign = "center");
}
