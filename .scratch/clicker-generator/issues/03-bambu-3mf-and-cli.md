# Bambu 3MF and CLI

Type: research
Status: resolved
Blocked by: none
Map: [Clicker Generator](../map.md)

## Question

Using primary sources (the BambuStudio source code on GitHub, the 3MF spec, Bambu wiki):

1. What must a 3MF contain for Bambu Studio to open it as a *project*, not a bare model? Cover per-object and per-part filament/AMS slot assignment (`Metadata/model_settings.config`), embedded process, filament and printer settings (`Metadata/project_settings.config`), plate definitions, part placement and orientation, and thumbnails if they're required.
2. How to put several Designs on one plate, and how to use several plates in one file.
3. The Bambu Studio command-line interface on macOS: how to headless-slice a 3MF with its embedded settings, what output or exit codes show success or failure, and whether it reports print time and filament use. This is how we'll validate generated files automatically.
4. Which version-specific quirks matter (the owner used Bambu Studio 2.07).

## Answer

Full findings with sources and annotated skeletons: branch `research/bambu-3mf-and-cli` → `docs/research/bambu-3mf-and-cli.md`. Sources: the BambuStudio 2.07.01.62 and 2.08.02.61 source, plus hand-built 3MFs sliced on the installed 02.08.02.61 CLI.

- **Project vs bare model:** `3D/3dmodel.model` must carry `Application = BambuStudio-<version>`. Without it, embedded settings are ignored. Stamp the **exact installed version**: a newer stamp makes the CLI refuse the file (−24).
- **The minimum valid project is five files:** `[Content_Types].xml`, `_rels/.rels`, `3D/3dmodel.model` with inline meshes, `Metadata/project_settings.config` (the full Print Profile) and `Metadata/model_settings.config` (per-part filament plus `<plate>` blocks). A 2-Plate, 2-colour Top Cap test sliced correctly. Thumbnails, `slice_info` and `plate_N.json` are optional.
- **Modelling:** each printed piece is an object and each colour region is a part with its own filament index. A piece belongs to the Plate whose region it sits in (A1 Plates are 307.2 mm apart, at most 36). **Physical AMS slots can't be pinned in the file:** they are matched at send time by filament type and colour.
- **Settings trap:** when the GUI opens a project, any value not listed in `different_settings_to_system` is reset to the system preset. **Use a project the owner saved once in the GUI as the template**, not hand-flattened presets and not a CLI-exported 3MF (CLI loading lowers the A1 speed limits).
- **CLI validation:** `BambuStudio --slice 0 --outputdir <abs> <abs>.3mf`, with **absolute paths only** (relative paths fail once thumbnails render). The exit code is the error mod 256. `result.json` reports print time and grams per Plate. The CLI never resolves `inherits`; `--export-settings` doesn't flatten and `--datadir` doesn't apply. A project 3MF's embedded settings avoid all of this.
- **Exit 0 isn't proof:** a file missing the `Application` field, `<plate>` blocks or `model_settings.config` still exits 0, with wrong grams or missing objects. Checks must assert on `result.json` contents.
- **Untested or known bugs:** a generated file hasn't been opened in the GUI yet (human check). Open issues: #9968 (macOS CLI crash slicing STLs with auto-arrange) and #12091 (2.8.x crash when `filament_map` is shorter than the filament list).
