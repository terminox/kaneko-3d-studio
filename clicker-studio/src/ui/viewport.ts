// three.js preview: assembled Clicker or the print layout, with an optional
// cut-away, switch ghosts and a keychain prop. Z is up, as in Bambu Studio.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Part } from "../geometry/build.ts";

export type Scene = {
  parts: Part[];
  switches: [number, number][];
  loops: [number, number][];
  bottom: number;
  chain: "ball" | "cord" | "none";
  /** True for the print layout (parts already on the bed). */
  printLayout: boolean;
};

export class Viewport {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.5, 5000);
  private controls: OrbitControls;
  private model = new THREE.Group();
  private extras = new THREE.Group();
  private grid: THREE.Group;
  private clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private framedSize = 0;
  private lastPrint: boolean | null = null;
  section = false;
  showSwitch = false;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.localClippingEnabled = true;
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
    this.scene.add(this.grid, this.model, this.extras);

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => {
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
      side: THREE.DoubleSide,
      clippingPlanes: this.section ? [this.clip] : [],
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
    for (const { color, mesh } of s.parts) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
      geo.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
      const flat = geo.toNonIndexed();
      flat.computeVertexNormals();
      geo.dispose();
      this.model.add(new THREE.Mesh(flat, this.material(color)));
    }
    this.model.position.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(this.model);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    // Sit on the grid, centred.
    const shift = new THREE.Vector3(-c.x, -c.y, -box.min.z);
    this.model.position.copy(shift);
    this.extras.position.copy(shift);
    this.clip.constant = 0;
    if (!s.printLayout) {
      if (this.showSwitch) for (const at of s.switches) this.extras.add(this.switchGhost(at));
      if (s.chain !== "none") for (const at of s.loops.slice(0, 1)) this.extras.add(this.chain(at, s.bottom, s.chain));
    }
    const placed = new THREE.Box3().setFromObject(this.model);
    const extent = placed.getSize(new THREE.Vector3()).length();
    const modeChanged = this.lastPrint !== s.printLayout;
    this.lastPrint = s.printLayout;
    if (frame || modeChanged || !this.framedSize || extent > this.framedSize * 1.35 || extent < this.framedSize * 0.5) this.frame(placed);
  }

  /** A simplified MX switch: housings and stem, see-through. */
  private switchGhost(at: [number, number]): THREE.Group {
    const g = new THREE.Group();
    const mat = this.material(0x8fd3c8, { transparent: true, opacity: 0.55 });
    const stemMat = this.material(0xd94b4b, { transparent: true, opacity: 0.85 });
    const add = (w: number, d: number, h: number, z: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), m);
      mesh.position.set(at[0], at[1], z + h / 2);
      g.add(mesh);
    };
    add(14, 14, 5, -6.5, mat); // bottom housing below the plate
    add(15.2, 15.2, 1, 0, mat);
    add(13, 13, 5.6, 1, mat);
    add(4, 1.2, 5, 6.6, stemMat);
    add(1.2, 4, 5, 6.6, stemMat);
    return g;
  }

  /** A short keychain hanging from the loop: ball chain or cord. */
  private chain(at: [number, number], bottom: number, kind: "ball" | "cord"): THREE.Group {
    const g = new THREE.Group();
    const pts: THREE.Vector3[] = [];
    const len = 70;
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      // A loop that drops below and to the side of the Clicker.
      const a = t * Math.PI * 2;
      pts.push(new THREE.Vector3(at[0] + 14 + Math.sin(a) * 6, at[1] - Math.sin(a / 2) * len * 0.5, bottom + 1.5 + (1 - Math.cos(a)) * 1.5));
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

  size(): THREE.Vector3 | null {
    const box = new THREE.Box3().setFromObject(this.model);
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
