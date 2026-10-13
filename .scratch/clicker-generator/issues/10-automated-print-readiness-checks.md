# Automated print-readiness checks

Type: grilling
Status: open
Blocked by: 02, 03, 04
Map: [Clicker Generator](../map.md)

## Question

How do we know automatically, before the owner prints, that an exported 3MF will print?

Decide the checks: manifold and watertight parts, every feature within Fit Calibration limits (e.g. text stroke above the minimum), parts placed within the A1's build volume, and a clean Bambu Studio CLI slice with time and filament reported. Decide where these run (the export step, a test suite, or both), the overall test strategy for geometry (TDD on Design → mesh measurements, golden 3MFs?), and the module seams that make this testable (use `codebase-design`).
