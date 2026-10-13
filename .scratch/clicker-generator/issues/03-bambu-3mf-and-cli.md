# Bambu 3MF and CLI

Type: research
Status: open
Blocked by: none
Map: [Clicker Generator](../map.md)

## Question

Using primary sources (the BambuStudio source code on GitHub, the 3MF spec, Bambu wiki):

1. What must a 3MF contain for Bambu Studio to open it as a *project*, not a bare model? Cover per-object and per-part filament/AMS slot assignment (`Metadata/model_settings.config`), embedded process, filament and printer settings (`Metadata/project_settings.config`), plate definitions, part placement and orientation, and thumbnails if they're required.
2. How to put several Designs on one plate, and how to use several plates in one file.
3. The Bambu Studio command-line interface on macOS: how to headless-slice a 3MF with its embedded settings, what output or exit codes show success or failure, and whether it reports print time and filament use. This is how we'll validate generated files automatically.
4. Which version-specific quirks matter (the owner used Bambu Studio 2.07).
