// SVG path data -> closed polylines. Used for font glyphs, icons and traced images.
// Supports M L H V C S Q T A Z, absolute and relative.

export type Pt = [number, number];
export type Ring = Pt[];

/** Reads path data one token at a time; arc flags may be packed ("a1 1 0 011 1"). */
class Scanner {
  private i = 0;
  constructor(private d: string) {}
  private skip() {
    while (this.i < this.d.length && /[\s,]/.test(this.d[this.i])) this.i++;
  }
  done(): boolean {
    this.skip();
    return this.i >= this.d.length;
  }
  /** The next command letter, or null when a number follows (an implicit repeat). */
  command(): string | null {
    this.skip();
    const c = this.d[this.i];
    if (c && /[MmLlHhVvCcSsQqTtAaZz]/.test(c)) {
      this.i++;
      return c;
    }
    return null;
  }
  number(): number {
    this.skip();
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(this.d.slice(this.i));
    if (!m) throw new Error(`Bad path data near "${this.d.slice(this.i, this.i + 12)}"`);
    this.i += m[0].length;
    return Number(m[0]);
  }
  flag(): number {
    this.skip();
    const c = this.d[this.i++];
    if (c !== "0" && c !== "1") throw new Error("Bad arc flag in path data");
    return c === "1" ? 1 : 0;
  }
}

/**
 * Flattens path data into closed rings. `tol` is the max chord deviation in path units.
 */
export function pathToRings(d: string, tol = 0.05): Ring[] {
  const sc = new Scanner(d);
  const rings: Ring[] = [];
  let ring: Ring = [];
  let x = 0, y = 0, sx = 0, sy = 0;
  let lastCtrl: Pt | null = null;
  let lastCmd = "";
  let cmd = "";

  const close = () => {
    if (ring.length > 2) rings.push(ring);
    ring = [];
  };
  const lineTo = (nx: number, ny: number) => {
    ring.push([nx, ny]);
    x = nx;
    y = ny;
  };
  const steps = (len: number) => Math.max(2, Math.min(64, Math.ceil(Math.sqrt(len / Math.max(tol, 1e-6)))));
  const cubic = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    const n = steps(Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2));
    const x0 = x, y0 = y;
    for (let s = 1; s <= n; s++) {
      const u = s / n, v = 1 - u;
      ring.push([
        v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3,
        v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3,
      ]);
    }
    x = x3;
    y = y3;
  };
  const quad = (x1: number, y1: number, x2: number, y2: number) => {
    const n = steps(Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1));
    const x0 = x, y0 = y;
    for (let s = 1; s <= n; s++) {
      const u = s / n, v = 1 - u;
      ring.push([v * v * x0 + 2 * v * u * x1 + u * u * x2, v * v * y0 + 2 * v * u * y1 + u * u * y2]);
    }
    x = x2;
    y = y2;
  };
  const arc = (rx: number, ry: number, phiDeg: number, large: number, sweep: number, x2: number, y2: number) => {
    // Endpoint to centre parameterisation (SVG spec F.6.5).
    const x1 = x, y1 = y;
    if (rx === 0 || ry === 0) return lineTo(x2, y2);
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const phi = (phiDeg * Math.PI) / 180;
    const cos = Math.cos(phi), sin = Math.sin(phi);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    const xp = cos * dx + sin * dy, yp = -sin * dx + cos * dy;
    const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
    if (lam > 1) {
      rx *= Math.sqrt(lam);
      ry *= Math.sqrt(lam);
    }
    const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
    const den = rx * rx * yp * yp + ry * ry * xp * xp;
    let co = Math.sqrt(Math.max(0, num / den));
    if (large === sweep) co = -co;
    const cxp = (co * rx * yp) / ry, cyp = (-co * ry * xp) / rx;
    const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
    const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
    const ang = (ux: number, uy: number, vx: number, vy: number) => {
      const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      return a;
    };
    const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
    let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI;
    if (sweep && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(2, Math.min(96, Math.ceil(Math.abs(dt) * Math.sqrt(Math.max(rx, ry) / Math.max(tol, 1e-6)) / 2)));
    for (let s = 1; s <= n; s++) {
      const th = t1 + (dt * s) / n;
      const ex = rx * Math.cos(th), ey = ry * Math.sin(th);
      ring.push([cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
    }
    x = x2;
    y = y2;
  };

  const num = () => sc.number();
  while (!sc.done()) {
    const c = sc.command();
    if (c) cmd = c;
    else if (!cmd) throw new Error("Path data must start with a command");
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case "M": {
        close();
        x = num() + ox;
        y = num() + oy;
        sx = x;
        sy = y;
        ring.push([x, y]);
        cmd = rel ? "l" : "L"; // following pairs are implicit line-tos
        lastCtrl = null;
        break;
      }
      case "L":
        lineTo(num() + ox, num() + oy);
        lastCtrl = null;
        break;
      case "H":
        lineTo(num() + ox, y);
        lastCtrl = null;
        break;
      case "V":
        lineTo(x, num() + oy);
        lastCtrl = null;
        break;
      case "C": {
        const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy, x3 = num() + ox, y3 = num() + oy;
        cubic(x1, y1, x2, y2, x3, y3);
        lastCtrl = [x2, y2];
        break;
      }
      case "S": {
        const r: Pt = lastCtrl && /[CS]/i.test(lastCmd) ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
        const x2 = num() + ox, y2 = num() + oy, x3 = num() + ox, y3 = num() + oy;
        cubic(r[0], r[1], x2, y2, x3, y3);
        lastCtrl = [x2, y2];
        break;
      }
      case "Q": {
        const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy;
        quad(x1, y1, x2, y2);
        lastCtrl = [x1, y1];
        break;
      }
      case "T": {
        const r: Pt = lastCtrl && /[QT]/i.test(lastCmd) ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
        const x2 = num() + ox, y2 = num() + oy;
        quad(r[0], r[1], x2, y2);
        lastCtrl = r;
        break;
      }
      case "A": {
        const rx = num(), ry = num(), phi = num();
        const large = sc.flag(), sweep = sc.flag();
        arc(rx, ry, phi, large, sweep, num() + ox, num() + oy);
        lastCtrl = null;
        break;
      }
      case "Z":
        x = sx;
        y = sy;
        close();
        lastCtrl = null;
        break;
    }
    lastCmd = cmd;
  }
  close();
  // Drop a closing point that repeats the first.
  for (const r of rings) {
    const a = r[0], b = r[r.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) r.pop();
  }
  return rings.filter((r) => r.length > 2);
}

export function ringsBounds(rings: Ring[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rings)
    for (const [px, py] of r) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function mapRings(rings: Ring[], f: (p: Pt) => Pt): Ring[] {
  return rings.map((r) => r.map(f));
}
