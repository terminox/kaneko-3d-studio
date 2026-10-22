// three.js preview: the A1 bed with the coloured model centred on it. Z is up,
// as in OpenSCAD and Bambu Studio.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ColoredMesh } from "../pipeline/mesh.ts";

const BED = 256;

export class Viewport {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.5, 5000);
  private controls: OrbitControls;
  private model = new THREE.Group();
  private framedSize = 0;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    host.appendChild(this.renderer.domElement);

    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(0, -180, 140);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(120, -200, 300);
    this.scene.add(sun);
    this.scene.add(this.bed());
    this.scene.add(this.model);

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  setTheme(dark: boolean) {
    this.scene.background = new THREE.Color(dark ? 0x17191c : 0xe9ebee);
  }

  private bed(): THREE.Group {
    const g = new THREE.Group();
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(BED, BED),
      new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.9 }),
    );
    plate.position.z = -0.05;
    g.add(plate);
    const pts: number[] = [];
    for (let i = -BED / 2; i <= BED / 2; i += 16) pts.push(i, -BED / 2, 0, i, BED / 2, 0, -BED / 2, i, 0, BED / 2, i, 0);
    const grid = new THREE.BufferGeometry();
    grid.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(grid, new THREE.LineBasicMaterial({ color: 0x4a4f57 })));
    return g;
  }

  /** Replaces the model. Keeps the camera unless `frame` is set or nothing was shown yet. */
  show(meshes: ColoredMesh[], frame = false) {
    for (const child of [...this.model.children]) {
      const m = child as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      this.model.remove(m);
    }
    for (const { color, mesh } of meshes) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(mesh.vertices, 3));
      geo.setIndex(new THREE.BufferAttribute(mesh.triangles, 1));
      const flat = geo.toNonIndexed();
      flat.computeVertexNormals();
      geo.dispose();
      this.model.add(new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0 })));
    }
    // Centre on the bed with the lowest point at z = 0, as the 3MF export does.
    this.model.position.set(0, 0, 0);
    const box = new THREE.Box3().setFromObject(this.model);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    this.model.position.set(-c.x, -c.y, -box.min.z);
    // Keep the camera while tuning, unless the model grew or shrank a lot.
    const extent = box.getSize(new THREE.Vector3()).length();
    if (frame || !this.framedSize || extent > this.framedSize * 1.3 || extent < this.framedSize * 0.5) this.frame(box);
  }

  size(): THREE.Vector3 | null {
    const box = new THREE.Box3().setFromObject(this.model);
    return box.isEmpty() ? null : box.getSize(new THREE.Vector3());
  }

  private frame(box: THREE.Box3) {
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z, 20);
    const target = new THREE.Vector3(0, 0, size.z / 2);
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(new THREE.Vector3(0, -1.6 * r, 1.2 * r));
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
