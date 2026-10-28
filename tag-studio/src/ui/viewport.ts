// three.js preview of one Name Tag or the first print plate. Z is up, as in
// Bambu Studio. Trimmed from Clicker Studio's viewport (no switch or chain);
// patch picking and highlights follow it.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Part } from "@cs/geometry/build.ts";
import type { Ring } from "@cs/geometry/path.ts";
import { pointInRings, signedArea } from "@cs/design/heights.ts";

export class Viewport {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.5, 5000);
  private controls: OrbitControls;
  private model = new THREE.Group();
  /** Highlights over picked patches. */
  private marks = new THREE.Group();
  // Drawn just above each top, depth-tested so taller patches in front hide them.
  private markFill = new THREE.MeshBasicMaterial({ color: 0x7c4dff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  private markLine = new THREE.LineBasicMaterial({ color: 0xffffff, depthWrite: false });
  private raycaster = new THREE.Raycaster();
  private grid: THREE.Group;
  private framedSize = 0;
  private lastPlate: boolean | null = null;
  /** Called on a click (not a drag) with the point hit on the model (model frame), or null. */
  onPick: ((hit: [number, number, number] | null, shift: boolean) => void) | null = null;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    host.appendChild(this.renderer.domElement);

    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(40, -110, 120);
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
    this.scene.add(this.grid, this.model, this.marks);

    // A click picks; a drag orbits.
    const el = this.renderer.domElement;
    let down: { x: number; y: number } | null = null;
    el.addEventListener("pointerdown", (e) => (down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null));
    el.addEventListener("pointerup", (e) => {
      if (!down || !this.onPick || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      down = null;
      this.onPick(this.hit(e), e.shiftKey);
    });

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.setAnimationLoop((ms) => {
      // Picked patches pulse gently, so they show on any colour.
      if (this.marks.children.length) this.markFill.opacity = 0.45 + 0.25 * Math.sin(ms / 220);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  setTheme(dark: boolean) {
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

  private clear(g: THREE.Group = this.model) {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
    g.clear();
  }

  show(parts: Part[], plateView: boolean, frame = false) {
    this.clear();
    for (const { color, mesh } of parts) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
      geo.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
      const flat = geo.toNonIndexed();
      flat.computeVertexNormals();
      geo.dispose();
      this.model.add(new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, side: THREE.DoubleSide })));
    }
    this.model.position.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(this.model);
    if (box.isEmpty()) return;
    // A plate is shown in bed coordinates, centred on the grid; a tag sits centred.
    const c = plateView ? new THREE.Vector3(128, 128, 0) : box.getCenter(new THREE.Vector3());
    this.model.position.set(-c.x, -c.y, -box.min.z);
    const placed = new THREE.Box3().setFromObject(this.model);
    const extent = placed.getSize(new THREE.Vector3()).length();
    const modeChanged = this.lastPlate !== plateView;
    this.lastPlate = plateView;
    if (frame || modeChanged || !this.framedSize || extent > this.framedSize * 1.35 || extent < this.framedSize * 0.5) this.frame(placed);
  }

  /** The first point of the model under the pointer, in model frame. */
  private hit(e: PointerEvent): [number, number, number] | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const [first] = this.raycaster.intersectObjects(this.model.children, false);
    if (!first) return null;
    const p = first.point.sub(this.model.position);
    return [p.x, p.y, p.z];
  }

  /** Tints picked patches: a see-through fill and an outline on each one's top. */
  highlight(patches: { rings: Ring[]; top: number }[]) {
    // The materials are shared, so only the geometry is disposed.
    this.marks.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.marks.clear();
    this.marks.position.copy(this.model.position);
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

  size(): THREE.Vector3 | null {
    const box = new THREE.Box3().setFromObject(this.model);
    return box.isEmpty() ? null : box.getSize(new THREE.Vector3());
  }

  resetView() {
    const box = new THREE.Box3().setFromObject(this.model);
    if (!box.isEmpty()) this.frame(box);
  }

  private frame(box: THREE.Box3) {
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z * 1.4, 24);
    const target = box.getCenter(new THREE.Vector3());
    this.controls.target.copy(target);
    // Mostly from the front and above: a tag is read face on.
    this.camera.position.copy(target).add(new THREE.Vector3(0.35 * r, -1.5 * r, 2.2 * r));
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
