// Slice 3MFs headless with Bambu Studio and check the result.
//   bun scripts/validate-3mf.ts out/a.3mf [out/b.3mf ...]
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { checkSlice, slice } from "./bambu-cli.ts";

let failed = 0;
for (const file of process.argv.slice(2)) {
  const zip = unzipSync(readFileSync(file));
  const settings = strFromU8(zip["Metadata/model_settings.config"] ?? new Uint8Array());
  // Expected filaments per plate: the distinct extruders of the parts in each plate's object.
  const objects = [...settings.matchAll(/<object id="(\d+)">([\s\S]*?)<\/object>/g)].map(([, id, body]) => ({
    id,
    filaments: new Set([...body.matchAll(/<part[\s\S]*?key="extruder" value="(\d+)"/g)].map((m) => m[1])).size,
  }));
  const plateObjects = [...settings.matchAll(/<plate>[\s\S]*?key="object_id" value="(\d+)"[\s\S]*?<\/plate>/g)].map((m) => m[1]);
  const { result } = slice(file, join(dirname(resolve(file)), `${basename(file, ".3mf")}-slice`));
  const problems = checkSlice(result, {
    plates: plateObjects.length,
    filamentsPerPlate: plateObjects.map((id) => objects.find((o) => o.id === id)?.filaments ?? 1),
  });
  console.log(`${file}:`);
  for (const p of result?.sliced_plates ?? []) {
    console.log(`  plate ${p.id}: ${(p.total_predication / 60).toFixed(1)} min, ${p.filaments.map((f) => `F${f.id} ${f.total_used_g.toFixed(2)} g`).join(", ")}`);
  }
  if (problems.length) {
    failed++;
    console.log(`  FAILED: ${problems.join("; ")}`);
  } else console.log("  OK");
}
process.exit(failed ? 1 : 0);
