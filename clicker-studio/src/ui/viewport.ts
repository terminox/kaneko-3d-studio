// three.js preview: the Clicker assembled, pulled apart or laid out for print,
// with an optional slice, switch ghosts and a keychain prop. Z is up, as in Bambu Studio.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Keyring, Part } from "../geometry/build.ts";
import type { Fit } from "../geometry/switch.ts";
import type { Ring } from "../geometry/path.ts";
import { pointInRings, signedArea } from "../design/heights.ts";

/** "print": the parts as they lie on the bed. "apart": assembled, with the top parts lifted. */
export type View = "assembled" | "apart" | "print";
export type Axis = "x" | "y" | "z";
/** A cut across one axis, `at` 0–1 of the way across the shown model. */
export type Slice = { axis: Axis; at: number };

export type Scene = {
  parts: Part[];
  switches: [number, number][];
  keyring: Keyring | null;
  bottom: number;
  chain: "ball" | "cord" | "none";
  fit: Fit;
  view: View;
};

/** MX sizes no Fit setting holds: the bottom housing under the plate, and the centre post below it. */
const MX = { body: 5, post: 4, postLength: 3.3 };

/** The normal of the half each slice keeps: it drops the half nearest the camera's starting spot, so the cut faces the viewer. */
const KEEP: Record<Axis, [number, number, number]> = { x: [-1, 0, 0], y: [0, 1, 0], z: [0, 0, -1] };

/** A cut face's flat colour: the part's colour, darker (lighter on dark parts) so it stands out from lit faces. */
function cutColour(color: string | number): THREE.Color {
  const c = new THREE.Color(color);
  const { h, s, l } = c.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  return c.setHSL(h, s, l < 0.3 ? l + 0.25 : l * 0.6, THREE.SRGBColorSpace);
}

export class Viewport {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.5, 5000);
  private controls: OrbitControls;
  private model = new THREE.Group();
  private extras = new THREE.Group();
  /** Highlights over picked patches. */
  private marks = new THREE.Group();
  private clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  // Drawn just above each top, depth-tested so taller patches in front hide them.
  private markFill = new THREE.MeshBasicMaterial({ color: 0x7c4dff, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: [this.clip] });
  private markLine = new THREE.LineBasicMaterial({ color: 0xffffff, depthWrite: false, clippingPlanes: [this.clip] });
  private raycaster = new THREE.Raycaster();
  private grid: THREE.Group;
  private framedSize = 0;
  private lastView: View | null = null;
  private slice: Slice | null = null;
  /** How far the Apart view lifts the top parts. */
  private lift = 0;
  showSwitch = false;
  /** Called on a click (not a drag) with the point hit on the model (model frame), or null. */
  onPick: ((hit: [number, number, number] | null, shift: boolean) => void) | null = null;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    host.appendChild(this.renderer.domElement);

    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(60, -120, 90);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8aa0, 1.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(80, -140, 220);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffffff, 0.5);
    rim.position.set(-120, 120, 80);
    this.scene.add(rim);
    this.grid = this.makeGrid();
    this.scene.add(this.grid, this.model, this.extras, this.marks);

    // A click picks; a drag orbits.
    const el = this.renderer.domElement;
    // A finger wobbles more than a mouse, and a second finger means a pinch, not a tap.
    let down: { x: number; y: number } | null = null;
    el.addEventListener("pointerdown", (e) => (down = e.button === 0 && e.isPrimary ? { x: e.clientX, y: e.clientY } : null));
    el.addEventListener("pointercancel", () => (down = null));
    el.addEventListener("pointerup", (e) => {
      const tap = down;
      down = null;
      if (!tap || !this.onPick || Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > (e.pointerType === "mouse" ? 4 : 10)) return;
      this.onPick(this.hit(e), e.shiftKey);
    });

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.setAnimationLoop((ms) => {
      // Picked patches pulse gently, faint enough to show the colour being chosen.
      if (this.marks.children.length) this.markFill.opacity = 0.14 + 0.1 * Math.sin(ms / 220);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  setTheme(dark: boolean) {
    this.scene.background = null;
    this.grid.traverse((o) => {
      const m = (o as THREE.LineSegments).material as THREE.LineBasicMaterial | undefined;
      if (m && "color" in m) m.color.set(dark ? 0x3a3a4a : 0xd9d6e6);
    });
  }

  private makeGrid(): THREE.Group {
    const g = new THREE.Group();
    const size = 256;
    const pts: number[] = [];
    for (let i = -size / 2; i <= size / 2; i += 4) pts.push(i, -size / 2, 0, i, size / 2, 0, -size / 2, i, 0, size / 2, i, 0);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xd9d6e6 })));
    return g;
  }

  private material(color: string | number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.82,
      metalness: 0,
      clippingPlanes: [this.clip],
      ...opts,
    });
  }

  private clear(g: THREE.Group) {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    g.clear();
  }

  show(s: Scene, frame = false) {
    this.clear(this.model);
    this.clear(this.extras);
    for (const { color, mesh, half } of s.parts) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
      geo.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
      const flat = geo.toNonIndexed();
      flat.computeVertexNormals();
      geo.dispose();
      const part = new THREE.Mesh(flat, this.material(color));
      // Through a slice the part's inside faces show; drawn flat, they read as the cut face.
      // Pulled forward so they win over a neighbour's faces that touch them (an inlay in its pocket).
      const cut = new THREE.Mesh(flat, new THREE.MeshBasicMaterial({ color: cutColour(color), side: THREE.BackSide, clippingPlanes: [this.clip], polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
      cut.userData.cut = true;
      part.userData.top = cut.userData.top = half === "top";
      part.add(cut);
      this.model.add(part);
    }
    this.model.position.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(this.model);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    // Sit on the grid, centred.
    const shift = new THREE.Vector3(-c.x, -c.y, -box.min.z);
    this.model.position.copy(shift);
    this.extras.position.copy(shift);
    if (s.view !== "print") {
      if (this.showSwitch) for (const at of s.switches) this.extras.add(this.switchGhost(at, s.fit));
      if (s.chain !== "none" && s.keyring) this.extras.add(this.chain(s.keyring, s.chain));
    }
    this.setApart(this.lift);
    const placed = new THREE.Box3().setFromObject(this.model);
    const extent = placed.getSize(new THREE.Vector3()).length();
    const viewChanged = this.lastView !== s.view;
    this.lastView = s.view;
    if (frame || viewChanged || !this.framedSize || extent > this.framedSize * 1.35 || extent < this.framedSize * 0.5) this.frame(placed);
  }

  /** Lifts the top parts (caps, a split model's top half) this far above the rest. The switch ghosts stay down. */
  setApart(mm: number) {
    this.lift = mm;
    for (const m of this.model.children) if (m.userData.top) m.position.z = mm;
    this.marks.position.set(this.model.position.x, this.model.position.y, this.model.position.z + mm);
    this.placeSlice();
  }

  setSlice(slice: Slice | null) {
    this.slice = slice;
    this.placeSlice();
  }

  /** Puts the slice plane across the model as shown, lifted parts included, and shows the cut faces. */
  private placeSlice() {
    const on = this.slice !== null;
    this.renderer.localClippingEnabled = on;
    this.model.traverse((o) => {
      if (o.userData.cut) o.visible = on;
    });
    const box = new THREE.Box3().setFromObject(this.model);
    if (!this.slice || box.isEmpty()) return;
    const { axis, at } = this.slice;
    const point = box.getCenter(new THREE.Vector3());
    point[axis] = box.min[axis] + at * (box.max[axis] - box.min[axis]);
    this.clip.setFromNormalAndCoplanarPoint(new THREE.Vector3(...KEEP[axis]), point);
  }

  /** The first point of the model under the pointer, in model frame as assembled (the Apart lift taken off). */
  private hit(e: PointerEvent): [number, number, number] | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    // The raycaster ignores clipping: skip what the slice hides.
    const first = this.raycaster
      .intersectObjects(this.model.children, true)
      .find((x) => x.object.visible && (!this.slice || this.clip.distanceToPoint(x.point) >= 0));
    if (!first) return null;
    // A cut face is drawn by the part's far inside faces; the point seen is on the plane.
    const seen = (first.object.userData.cut && this.raycaster.ray.intersectPlane(this.clip, new THREE.Vector3())) || first.point;
    const p = seen.sub(this.model.position);
    if (first.object.userData.top) p.z -= this.lift;
    return [p.x, p.y, p.z];
  }

  /** Tints picked patches: a see-through fill and an outline on each one's top. */
  highlight(patches: { rings: Ring[]; top: number }[]) {
    // The materials are shared, so only the geometry is disposed.
    this.marks.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.marks.clear();
    for (const p of patches) {
      const v = (r: Ring) => r.map(([x, y]) => new THREE.Vector2(x, y));
      const outers = p.rings.filter((r) => signedArea(r) > 0);
      const shapes = outers.map((r) => new THREE.Shape(v(r)));
      for (const hole of p.rings.filter((r) => signedArea(r) <= 0)) {
        const i = outers.findIndex((o) => pointInRings([o], hole[0]));
        if (i >= 0) shapes[i].holes.push(new THREE.Path(v(hole)));
      }
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(shapes), this.markFill);
      fill.position.z = p.top + 0.08;
      fill.renderOrder = 10;
      this.marks.add(fill);
      for (const r of p.rings) {
        const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(r.map(([x, y]) => new THREE.Vector3(x, y, p.top + 0.1))), this.markLine);
        line.renderOrder = 11;
        this.marks.add(line);
      }
    }
  }

  /** An MX switch at rest, see-through, sized by the Fit the cap and Base were built around. */
  private switchGhost(at: [number, number], fit: Fit): THREE.Group {
    const g = new THREE.Group();
    const mat = this.material(0x8fd3c8, { transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    const stemMat = this.material(0xd94b4b, { transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    /** Adds `geo` with its bottom at `z`. */
    const add = (geo: THREE.BufferGeometry, z: number, m: THREE.Material) => {
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(at[0], at[1], z - geo.boundingBox!.min.z);
      g.add(mesh);
    };
    const below = fit.plate + MX.body;
    add(new THREE.BoxGeometry(fit.pocket, fit.pocket, below), -below, mat);
    add(new THREE.CylinderGeometry(MX.post / 2, MX.post / 2, MX.postLength, 24).rotateX(Math.PI / 2), -below - MX.postLength, mat);
    // The top housing tapers from its plate seat to its top: a four-sided cylinder turned square to the axes.
    const housing = new THREE.CylinderGeometry(fit.housingTop / Math.SQRT2, fit.housingBottom / Math.SQRT2, fit.housingHeight, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).toNonIndexed();
    housing.computeVertexNormals();
    add(housing, 0, mat);
    const stem = fit.stemTop - fit.housingHeight;
    add(new THREE.BoxGeometry(fit.crossLength, fit.crossWidth, stem), fit.housingHeight, stemMat);
    add(new THREE.BoxGeometry(fit.crossWidth, fit.crossLength, stem), fit.housingHeight, stemMat);
    return g;
  }

  /** A short keychain hanging from the loop or tab hole: ball chain or cord. */
  private chain({ at, dir, z }: Keyring, kind: "ball" | "cord"): THREE.Group {
    const g = new THREE.Group();
    const pts: THREE.Vector3[] = [];
    const len = 70;
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      // A loop that leaves the Clicker along `dir`: from a side it drops below (-y),
      // from the top or bottom it runs straight out.
      const a = t * Math.PI * 2;
      const [dx, dy] = dir;
      const x = at[0] + dx * 14 + Math.sin(a) * 6;
      const y = at[1] + dy * 14 + (dy || -1) * Math.sin(a / 2) * len * 0.5;
      pts.push(new THREE.Vector3(x, y, z + (1 - Math.cos(a)) * 1.5));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    if (kind === "cord") {
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.8, 8, true), this.material(0xe46a8f)));
    } else {
      const mat = this.material(0xb9bcc4, { metalness: 0.8, roughness: 0.35 });
      const ball = new THREE.SphereGeometry(1.1, 12, 8);
      const n = Math.round(curve.getLength() / 2.6);
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(ball, mat);
        m.position.copy(curve.getPointAt(i / n));
        g.add(m);
      }
    }
    return g;
  }

  /** The model's size as built, without the Apart lift. */
  size(): THREE.Vector3 | null {
    const box = new THREE.Box3();
    for (const m of this.model.children as THREE.Mesh[]) {
      m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox!);
    }
    return box.isEmpty() ? null : box.getSize(new THREE.Vector3());
  }

  resetView() {
    const box = new THREE.Box3().setFromObject(this.model);
    if (!box.isEmpty()) this.frame(box);
  }

  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  private frame(box: THREE.Box3) {
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z * 1.4, 24);
    const target = box.getCenter(new THREE.Vector3());
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(new THREE.Vector3(0.75 * r, -2.1 * r, 1.65 * r));
    this.framedSize = size.length();
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
