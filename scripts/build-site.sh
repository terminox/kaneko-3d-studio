#!/bin/sh
# Builds the hosted site into dist/: the launcher and login pages from site/,
# and each tool under its own path. Run by `vercel build` (see vercel.json).
set -eu
cd "$(dirname "$0")/.."
rm -rf dist

for app in model-maker clicker-studio; do
  echo "== $app"
  (
    cd "$app"
    bun install --frozen-lockfile
    bun run setup # downloads fonts, icons and WASM; skips what's already there
    bunx tsc --noEmit
    # An absolute base: the workers resolve asset URLs against it.
    VITE_HOME_URL=/ bunx vite build --base "/$app/" --outDir "../dist/$app" --emptyOutDir
  )
done

cp -R site/. dist/
