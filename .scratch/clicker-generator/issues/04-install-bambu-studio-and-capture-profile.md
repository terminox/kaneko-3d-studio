# Install Bambu Studio and capture the print profile

Type: task
Status: claimed
Blocked by: none
Map: [Clicker Generator](../map.md)

## Question

This is a HITL task that later tickets depend on. Nothing to decide; it just has to be done.

Owner checklist:
- [ ] Install Bambu Studio on this Mac (latest stable).
- [ ] **Preferred:** in Bambu Studio *on this Mac* (02.08.02.61), set up an A1 project with the Textured PEI plate, your tuned **R3D PLA Matte** filament and the process you print clickers with. Add any small object and save the project as `profiles/template.3mf`. Per [Bambu 3MF and CLI](03-bambu-3mf-and-cli.md), a GUI-saved project is the only reliable template: tuned values survive reopening and the CLI reads them fully resolved. Don't use a 3MF exported by the CLI.
- [ ] Also export the tuned filament and process presets into `profiles/` as a backup.
- [ ] List the filament colors on hand (brand, color name, hex if known) in `profiles/filaments.md`.

Agent checklist (after the owner is done):
- [ ] Confirm the Bambu Studio CLI runs from the terminal, and record the exact binary path and version.
- [ ] Record the resulting facts (paths, versions, profile names) in this ticket's answer.
- [ ] Record which wall generator (classic or Arachne) and thin-wall setting the tuned process profile uses. This feeds the Fit Test design.

## Comments

**2026-10-13, agent:** the owner installed Bambu Studio. Verified:

- App `/Applications/BambuStudio.app`, version **02.08.02.61** (newer than the 2.07 used before), bundle id `com.bambulab.bambu-studio`.
- CLI binary: `/Applications/BambuStudio.app/Contents/MacOS/BambuStudio`. `--help` runs headless and exits 0.
- **Headless slicing works on macOS.** A 20 mm cube STL sliced with `--slice 0 --arrange 1 --outputdir out --load-settings "<machine>.json;<process>.json" --load-filaments "<filament>.json"` and the stock presets from `Contents/Resources/profiles/BBL/` (`Bambu Lab A1 0.4 nozzle`, `0.20mm Standard @BBL A1`, `Generic PLA @BBL A1`). It wrote `plate_1.gcode` plus `result.json` (`return_code: 0`, `"error_string": "Success."`, per-feature times, total estimate 28m 28s).
- **Caveats for the readiness checks:** loading the stock preset JSONs directly does not resolve their `inherits` chain. The log warns that `machine_max_*` keys are missing, filament weight reports 0.00 g (no density), and the bed type defaults to Cool Plate instead of Textured PEI. Validation slices therefore need **fully resolved presets**, either embedded in the 3MF or exported flattened.
- `~/Library/Application Support/BambuStudio` doesn't exist yet. The app has never been launched, so no user or cloud presets are on this Mac.

Still to do (owner): launch Bambu Studio and sign in so cloud presets sync. Then export the tuned R3D PLA Matte filament and process presets (or the earlier tuned 3MF) into `profiles/`, and list the filaments on hand in `profiles/filaments.md`.
