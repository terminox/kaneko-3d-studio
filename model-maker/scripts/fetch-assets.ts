// Downloads everything the model maker needs at runtime but doesn't commit:
// the OpenSCAD WebAssembly builds, the bundled Google Fonts and BOSL2.
// Run with `bun run setup`. Safe to re-run; finished downloads are skipped.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { unzipSync, zipSync } from "fflate";
import opentype from "opentype.js";

const ROOT = resolve(import.meta.dir, "..");
const PUBLIC = join(ROOT, "public");
const CACHE = join(ROOT, ".cache");

// Same build the OpenSCAD Playground pins. The -web build runs in our worker;
// the -node build runs the identical engine in tests and the CLI scripts.
const OPENSCAD_VERSION = "2025.03.25";
const OPENSCAD_WEB = `https://files.openscad.org/playground/OpenSCAD-${OPENSCAD_VERSION}.wasm24456-WebAssembly-web.zip`;
const OPENSCAD_NODE = `https://files.openscad.org/playground/OpenSCAD-${OPENSCAD_VERSION}.wasm24455-WebAssembly-node.zip`;

// The BOSL2 revision MakerWorld documented for its v1.1.0 backend.
const BOSL2_COMMIT = "99fcfc6867e739aa1cd8ffc49fe39276036681f1";

// Google Fonts serves static TrueType instances to clients that can't take WOFF2.
const FONTS_UA = "Wget/1.21";

async function download(url: string, init?: RequestInit): Promise<Uint8Array> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function writeFiles(dir: string, files: Record<string, Uint8Array>, rename: (name: string) => string | null) {
  mkdirSync(dir, { recursive: true });
  for (const [name, data] of Object.entries(files)) {
    const out = rename(name.split("/").pop()!);
    if (out) writeFileSync(join(dir, out), data);
  }
}

async function fetchOpenScad() {
  const webDir = join(PUBLIC, "openscad");
  if (!existsSync(join(webDir, "openscad.wasm"))) {
    console.log("OpenSCAD web build…");
    writeFiles(webDir, unzipSync(await download(OPENSCAD_WEB)), (n) => (/^openscad\.(js|wasm)$/.test(n) ? n : null));
  }
  const nodeDir = join(CACHE, "openscad-node");
  if (!existsSync(join(nodeDir, "openscad.cjs"))) {
    console.log("OpenSCAD node build…");
    // CommonJS: .cjs so Node doesn't read it as ESM under our "type": "module".
    writeFiles(nodeDir, unzipSync(await download(OPENSCAD_NODE)), (n) =>
      n === "openscad.js" ? "openscad.cjs" : n === "openscad.wasm" ? n : null,
    );
  }
}

// `spec` is the exact OpenSCAD font string for the file, e.g. "Nunito:style=Bold".
// Some static instances carry the weight in the family name instead ("Poppins Black").
type FontFile = { label: string; weight: number; spec: string; file: string };
const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium",
  600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black",
};

type FontFamily = { family: string; styles: FontFile[] };

async function fetchFonts() {
  const dir = join(PUBLIC, "fonts");
  mkdirSync(dir, { recursive: true });
  const config = JSON.parse(readFileSync(join(import.meta.dir, "fonts.config.json"), "utf8")) as {
    families: { family: string; weights: number[] }[];
  };
  const manifest: FontFamily[] = [];

  for (const { family, weights } of config.families) {
    const query = `family=${encodeURIComponent(family)}:wght@${weights.join(";")}`;
    const css = new TextDecoder().decode(
      await download(`https://fonts.googleapis.com/css2?${query}`, { headers: { "User-Agent": FONTS_UA } }),
    );
    const faces = [...css.matchAll(/font-weight:\s*(\d+);[\s\S]*?url\((\S+?\.ttf)\)/g)];
    if (faces.length === 0) throw new Error(`No TTF faces for ${family}`);

    const styles: FontFile[] = [];
    for (const [, weight, url] of faces) {
      const file = `${family.replace(/\s+/g, "")}-${weight}.ttf`;
      const path = join(dir, file);
      if (!existsSync(path)) writeFileSync(path, await download(url));
      // Name the font the way fontconfig (and so OpenSCAD) will match it.
      const font = opentype.parse(readFileSync(path).buffer);
      const names = font.names as unknown as Record<string, { en?: string }>;
      const fcFamily = names.preferredFamily?.en ?? names.fontFamily?.en ?? family;
      const fcStyle = names.preferredSubfamily?.en ?? names.fontSubfamily?.en ?? "Regular";
      const spec = fcStyle === "Regular" ? fcFamily : `${fcFamily}:style=${fcStyle}`;
      styles.push({ label: WEIGHT_NAMES[Number(weight)] ?? weight, weight: Number(weight), spec, file });
    }
    manifest.push({ family, styles });
    console.log(`font ${family}: ${styles.map((s) => s.spec).join(", ")}`);
  }

  writeFileSync(join(dir, "fonts.json"), JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(
    join(dir, "fonts.conf"),
    `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig><dir>/fonts</dir></fontconfig>\n`,
  );
}

async function fetchBosl2() {
  const dest = join(PUBLIC, "libs", "BOSL2.zip");
  if (existsSync(dest)) return;
  console.log("BOSL2…");
  const zip = unzipSync(await download(`https://codeload.github.com/BelfrySCAD/BOSL2/zip/${BOSL2_COMMIT}`));
  const files: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(zip)) {
    const rel = name.split("/").slice(1).join("/");
    if (/^[^/]+\.scad$/.test(rel) || rel === "LICENSE") files[`BOSL2/${rel}`] = data;
  }
  mkdirSync(join(PUBLIC, "libs"), { recursive: true });
  writeFileSync(dest, zipSync(files));
}

await fetchOpenScad();
await fetchFonts();
await fetchBosl2();
console.log("assets ready");
