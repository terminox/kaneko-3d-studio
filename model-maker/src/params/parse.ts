// Reads the parameter block of a .scad file into a form schema, following the
// OpenSCAD Customizer comment syntax plus MakerWorld's additions
// (`// color`, `// font`, and "default.png|svg|stl" file uploads).

type Base = { name: string; label: string; description?: string };

export type ParamKind =
    | { type: "number"; default: number; step: number }
    | { type: "slider"; default: number; min: number; max: number; step: number }
    | { type: "dropdown"; default: number | string; options: { value: number | string; label: string }[] }
    | { type: "boolean"; default: boolean }
    | { type: "string"; default: string; maxLength?: number }
    | { type: "vector"; default: number[]; min?: number; max?: number; step: number }
    | { type: "color"; default: string }
    | { type: "font"; default: string }
    | { type: "file"; default: string; accept: "png" | "svg" | "stl" };

export type Param = Base & ParamKind;

export type ParamValue = number | string | boolean | number[];
export type ParamValues = Record<string, ParamValue>;
export type ParamGroup = { name: string; params: Param[] };
export type ParamSchema = { groups: ParamGroup[] };

type Literal = { value: number | string | boolean | number[]; raw: string; end: number };

export function parseParams(source: string): ParamSchema {
  const groups: ParamGroup[] = [];
  let group: ParamGroup | null = null;
  let hidden = false;
  let inBlock = false;
  let comment: string | undefined;

  const currentGroup = (): ParamGroup => {
    if (!group) {
      group = { name: "", params: [] };
      groups.push(group);
    }
    return group;
  };

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (inBlock) {
      if (line.includes("*/")) inBlock = false;
      continue;
    }

    const marker = line.match(/^\/\*\s*\[([^\]]*)\]\s*\*\/$/);
    if (marker) {
      const name = marker[1].trim();
      hidden = name.toLowerCase() === "hidden";
      group = groups.find((g) => g.name === name) ?? null;
      if (!group && !hidden) {
        group = { name, params: [] };
        groups.push(group);
      }
      comment = undefined;
      continue;
    }
    if (line.startsWith("/*")) {
      if (!line.includes("*/")) inBlock = true;
      comment = undefined;
      continue;
    }
    if (line.startsWith("//")) {
      const text = line.replace(/^\/+/, "").trim();
      comment = text || undefined;
      continue;
    }
    if (line === "") {
      comment = undefined;
      continue;
    }
    if (/^(module|function)\b/.test(line)) break;

    const param = parseAssignment(line, comment);
    comment = undefined;
    if (!param || hidden) continue;

    for (const g of groups) g.params = g.params.filter((p) => p.name !== param.name);
    currentGroup().params.push(param);
  }

  return { groups: groups.filter((g) => g.params.length > 0) };
}

function parseAssignment(line: string, description: string | undefined): Param | null {
  const m = line.match(/^([A-Za-z_][\w]*)\s*=\s*/);
  if (!m) return null;
  const literal = parseLiteral(line, m[0].length);
  if (!literal) return null;
  const rest = line.slice(literal.end).trimStart();
  if (!rest.startsWith(";")) return null;
  const after = rest.slice(1).trim();
  const annotation = after.startsWith("//") ? after.replace(/^\/+/, "").trim() : "";

  const name = m[1];
  return { ...typed(literal, annotation), name, label: name.replace(/_/g, " "), description } as Param;
}

function typed(lit: Literal, annotation: string): ParamKind {
  const { value } = lit;

  if (typeof value === "boolean") return { type: "boolean", default: value };

  if (typeof value === "string") {
    if (/^color$/i.test(annotation)) return { type: "color", default: value };
    if (/^font$/i.test(annotation)) return { type: "font", default: value };
    const file = value.match(/^default\.(png|svg|stl)$/i);
    if (file) return { type: "file", default: value, accept: file[1].toLowerCase() as "png" | "svg" | "stl" };
  }

  const bracket = annotation.match(/^\[(.*)\]$/);

  if (Array.isArray(value)) {
    const range = bracket ? bracket[1].split(":").map((s) => s.trim()) : [];
    const num = (s: string | undefined) => (s === undefined || s === "" ? undefined : Number(s));
    const step = range.length === 3 ? num(range[1]) : undefined;
    return {
      type: "vector",
      default: value,
      min: range.length >= 2 ? num(range[0]) : undefined,
      max: range.length >= 2 ? num(range[range.length - 1]) : undefined,
      step: step ?? stepFor(lit.raw.split(/[\[\],]/).filter((s) => s.trim())),
    };
  }

  if (bracket) {
    const body = bracket[1];
    const numeric = typeof value === "number";
    if (body.includes(",") || !numeric) {
      const options = body.split(",").map((item) => {
        const t = item.trim();
        const colon = t.indexOf(":");
        const v = colon >= 0 && !/^\w+:\/\//.test(t) ? t.slice(0, colon).trim() : t;
        const label = colon >= 0 && v !== t ? t.slice(colon + 1).trim() : v;
        return { value: numeric ? Number(v) : v, label };
      });
      return { type: "dropdown", default: value, options };
    }
    const parts = body.split(":").map((s) => s.trim());
    if (parts.every((p) => p !== "" && !Number.isNaN(Number(p)))) {
      const [min, step, max] =
        parts.length === 1 ? ["0", undefined, parts[0]] : parts.length === 2 ? [parts[0], undefined, parts[1]] : parts;
      return {
        type: "slider",
        default: value,
        min: Number(min),
        max: Number(max),
        step: step !== undefined ? Number(step) : stepFor([min, max, lit.raw]),
      };
    }
  }

  if (typeof value === "string") {
    const max = annotation.match(/^\d+$/);
    return max ? { type: "string", default: value, maxLength: Number(max[0]) } : { type: "string", default: value };
  }

  return { type: "number", default: value, step: stepFor([lit.raw]) };
}

// The finest decimal place written in any of the given numbers: "5.0" -> 0.1.
function stepFor(raws: string[]): number {
  const decimals = Math.max(0, ...raws.map((r) => r.trim().split(".")[1]?.replace(/[eE].*$/, "").length ?? 0));
  return decimals === 0 ? 1 : Number((10 ** -decimals).toFixed(decimals));
}

function parseLiteral(s: string, start: number): Literal | null {
  let i = start;
  const skipWs = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };
  skipWs();

  const num = s.slice(i).match(/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/);
  if (num) {
    i += num[0].length;
    return { value: Number(num[0]), raw: num[0], end: i };
  }
  for (const word of ["true", "false"]) {
    if (s.startsWith(word, i) && !/\w/.test(s[i + word.length] ?? "")) {
      return { value: word === "true", raw: word, end: i + word.length };
    }
  }
  if (s[i] === '"') {
    let out = "";
    i++;
    while (i < s.length && s[i] !== '"') {
      if (s[i] === "\\" && i + 1 < s.length) {
        const c = s[++i];
        out += c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "\r" : c;
      } else {
        out += s[i];
      }
      i++;
    }
    if (s[i] !== '"') return null;
    i++;
    return { value: out, raw: s.slice(start, i).trim(), end: i };
  }
  if (s[i] === "[") {
    const open = i;
    const items: number[] = [];
    i++;
    skipWs();
    while (s[i] !== "]") {
      const item = parseLiteral(s, i);
      if (!item || typeof item.value !== "number") return null;
      items.push(item.value);
      i = item.end;
      skipWs();
      if (s[i] === ",") {
        i++;
        skipWs();
      } else if (s[i] !== "]") {
        return null;
      }
    }
    i++;
    return { value: items, raw: s.slice(open, i), end: i };
  }
  return null;
}
