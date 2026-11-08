// H-connector ends per side (ADR 0011): pure rules shared by the geometry and the panels.
import type { Connectors, Side } from "./types.ts";

export const SIDES: Side[] = ["left", "right", "top", "bottom"];
export const OPPOSITE: Record<Side, Side> = { left: "right", right: "left", top: "bottom", bottom: "top" };
export const NO_CONNECTORS: Connectors = { left: "none", right: "none", top: "none", bottom: "none" };

/**
 * Which way the Switch's pins should point so no inserted tab reaches them: the
 * side opposite a lone socket, else a side without one (preferring one opposite a
 * socket). Null when every side has a socket.
 */
export function pinSide(c: Connectors): Side | null {
  const sockets = SIDES.filter((s) => c[s] === "socket");
  if (sockets.length === 1) return OPPOSITE[sockets[0]];
  const free = (["bottom", "top", "right", "left"] as Side[]).filter((s) => c[s] !== "socket");
  return free.find((s) => c[OPPOSITE[s]] === "socket") ?? free[0] ?? null;
}
