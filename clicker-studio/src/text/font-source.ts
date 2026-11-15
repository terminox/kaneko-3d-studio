// Fonts the owner imported live in design.files as data URLs; every other name is a bundled font.
import type { FontSource } from "./shape.ts";

export const USER_FONT_PREFIX = "font-";

export function isUserFont(name: string): boolean {
  return name.startsWith(USER_FONT_PREFIX);
}

export function dataUrlBytes(url: string): ArrayBuffer {
  const bin = atob(url.slice(url.indexOf(",") + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function fontSource(files: Record<string, string>, bundled: FontSource): FontSource {
  return async (name) => {
    if (!isUserFont(name)) return bundled(name);
    const url = files[name];
    if (!url) throw new Error(`Imported font ${name} is missing from the Design files`);
    return dataUrlBytes(url);
  };
}
