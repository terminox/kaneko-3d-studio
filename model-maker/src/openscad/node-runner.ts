// Runs the OpenSCAD WebAssembly Node build in a temporary directory. The Node
// build reads the real filesystem, so fonts and libraries are symlinked in.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { unzipSync } from "fflate";
import type { OpenScadRunner, RunRequest, RunResult } from "./runner.ts";

const ROOT = resolve(import.meta.dir, "../..");
const OPENSCAD_JS = join(ROOT, ".cache/openscad-node/openscad.cjs");
const FONTS = join(ROOT, "public/fonts");
const LIBRARIES = join(ROOT, ".cache/libraries");

function ensureLibraries() {
  if (existsSync(join(LIBRARIES, "BOSL2"))) return;
  const zip = unzipSync(readFileSync(join(ROOT, "public/libs/BOSL2.zip")));
  for (const [name, data] of Object.entries(zip)) {
    const path = join(LIBRARIES, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
  }
}

export function createNodeRunner(): OpenScadRunner {
  if (!existsSync(OPENSCAD_JS)) throw new Error("OpenSCAD node build missing: run `bun run setup`");
  ensureLibraries();

  return {
    async run({ files, args, outputs }: RunRequest): Promise<RunResult> {
      const work = mkdtempSync(join(tmpdir(), "model-maker-"));
      try {
        symlinkSync(FONTS, join(work, "fonts"));
        symlinkSync(LIBRARIES, join(work, "libraries"));
        for (const [path, data] of Object.entries(files)) {
          mkdirSync(dirname(join(work, path)), { recursive: true });
          writeFileSync(join(work, path), data);
        }
        const { code, text } = await new Promise<{ code: number; text: string }>((done, fail) => {
          const child = spawn("node", [OPENSCAD_JS, ...args], { cwd: work });
          let text = "";
          child.stdout.on("data", (d) => (text += d));
          child.stderr.on("data", (d) => (text += d));
          child.on("error", fail);
          child.on("close", (code) => done({ code: code ?? -1, text }));
        });
        const read: RunResult["outputs"] = {};
        for (const out of outputs) {
          const path = join(work, out);
          const data = existsSync(path) ? new Uint8Array(readFileSync(path)) : undefined;
          read[out] = data && data.length > 0 ? data : undefined;
        }
        return { exitCode: code, outputs: read, log: text.split("\n").filter((l) => l.trim()) };
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    },
  };
}
