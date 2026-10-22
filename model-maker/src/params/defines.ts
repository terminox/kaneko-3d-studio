// Turns form values into OpenSCAD `-D name=value` arguments. -D assignments run
// after the file's own top-level assignments, so they override the defaults.
import type { ParamValue, ParamValues } from "./parse.ts";

export function scadLiteral(value: ParamValue): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return scadNumber(value);
  if (Array.isArray(value)) return `[${value.map(scadNumber).join(", ")}]`;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t").replace(/\r/g, "\\r")}"`;
}

function scadNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Not a finite number: ${n}`);
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return n.toFixed(20).replace(/\.?0+$/, "");
}

export function toDefines(values: ParamValues): string[] {
  return Object.entries(values).flatMap(([name, value]) => {
    if (!/^[A-Za-z_$][\w]*$/.test(name)) throw new Error(`Invalid parameter name: ${name}`);
    return ["-D", `${name}=${scadLiteral(value)}`];
  });
}
