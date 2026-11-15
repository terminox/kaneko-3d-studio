// Fonts the owner imports (TTF/OTF): stored in the Design, shown in the picker through a FontFace.
import type { Design } from "../design/types.ts";
import { USER_FONT_PREFIX } from "../text/font-source.ts";
import { readDataUrl } from "./dom.ts";

/** Past this, localStorage (about 5 MB, shared with the rest of the Design) tends to refuse the save. */
export const BIG_FONT = 3_000_000;

const registered = new Set<string>();

function register(id: string, dataUrl: string) {
  if (registered.has(id)) return;
  registered.add(id);
  const face = new FontFace(`cs-${id}`, `url(${dataUrl})`);
  face.load().then(
    (f) => document.fonts.add(f),
    () => registered.delete(id),
  );
}

export function registerDesignFonts(design: Design) {
  for (const f of design.userFonts ?? []) if (design.files[f.id]) register(f.id, design.files[f.id]);
}

export async function importFont(design: Design, file: File): Promise<string> {
  const id = `${USER_FONT_PREFIX}${Date.now().toString(36)}`;
  design.files[id] = await readDataUrl(file);
  design.userFonts = [...(design.userFonts ?? []), { id, name: file.name.replace(/\.[^.]+$/, "") }];
  register(id, design.files[id]);
  return id;
}

export function hasBigFont(design: Design): boolean {
  return (design.userFonts ?? []).some((f) => (design.files[f.id]?.length ?? 0) > BIG_FONT);
}
