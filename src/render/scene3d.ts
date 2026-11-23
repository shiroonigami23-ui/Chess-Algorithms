/**
 * Three.js "space-time" board. Every square is a column whose height and glow
 * a lab sets each frame (search cost, wavefront distance, tour step, ...),
 * so the 4th dimension, time, plays out as columns rising from the board.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { type Board, Tile } from '../core/board';
import { asset } from '../ui/dom';
import type { BoardTheme } from './palette';

const BASE = { [Tile.Empty]: 0.14, [Tile.Mud]: 0.06, [Tile.Wall]: 1.1 } as Record<number, number>;
const GAP = 0.94;

export interface Scene3DOptions {
  bloom?: boolean;
  autoRotate?: boolean;
  ambientParticles?: boolean;
}

export class Scene3D {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly world = new THREE.Group();
  readonly dom: HTMLElement;
  size = 0;
  onFrame: ((dt: number, time: number) => void) | null = null;

  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private mesh: THREE.InstancedMesh | null = null;
  private tiles: Uint8Array = new Uint8Array(0);
  private theme: BoardTheme | null = null;
  private heights = new Float32Array(0);
  private targets = new Float32Array(0);
  private colours = new Float32Array(0);
  private colourTargets = new Float32Array(0);
  private raf = 0;
  private last = performance.now();
  private disposed = false;
  private ro: ResizeObserver;
  private particles: THREE.Points | null = null;
  private ray = new THREE.Raycaster();
  private readonly dummy = new THREE.Object3D();
  private readonly tmp = new THREE.Color();
  private textures = new Map<string, THREE.Texture>();
  private idleSince = performance.now();
  readonly opts: Required<Scene3DOptions>;

  constructor(container: HTMLElement, opts: Scene3DOptions = {}) {
    this.opts = { bloom: true, autoRotate: false, ambientParticles: true, ...opts };
    this.dom = container;
    const canvas = document.createElement('canvas');
    canvas.className = 'scene3d';
    container.append(canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.scene.background = new THREE.Color(0x07080d);
    this.scene.fog = new THREE.FogExp2(0x07080d, 0.018);
    this.scene.add(this.world);

    this.scene.add(new THREE.HemisphereLight(0x9fb6ff, 0x120a24, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(6, 12, 8);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x7c5cff, 55, 40, 1.6);
    rim.position.set(-9, 5, -7);
    this.scene.add(rim);
    const warm = new THREE.PointLight(0x22d3ee, 38, 40, 1.6);
    warm.position.set(9, 4, 8);
    this.scene.add(warm);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.autoRotate = this.opts.autoRotate;
    this.controls.autoRotateSpeed = 0.6;
    this.controls.addEventListener('start', () => (this.idleSince = Infinity));
    this.controls.addEventListener('end', () => (this.idleSince = performance.now()));

    this.makeFloor();
    if (this.opts.ambientParticles) this.makeParticles();
    this.initComposer();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.raf = requestAnimationFrame(this.loop);
  }

  private initComposer() {
    if (!this.opts.bloom) return;
    try {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.55, 0.9);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    } catch {
      this.composer = null;
    }
  }

  private makeFloor() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(124,92,255,.32)');
    grad.addColorStop(0.35, 'rgba(34,211,238,.07)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.62;
    plane.name = 'floor';
    this.scene.add(plane);
    const grid = new THREE.GridHelper(80, 80, 0x2a3350, 0x161b2e);
    grid.position.y = -0.63;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    this.scene.add(grid);
  }

  private makeParticles() {
    const n = 420;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 1] = Math.random() * 14 - 1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 50;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.particles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.07, color: 0x9db4ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(this.particles);
  }

  resize() {
    const w = Math.max(40, this.dom.clientWidth);
    const h = Math.max(40, this.dom.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.bloom?.resolution.set(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Build (or rebuild) the column grid. Heights/colours are preserved if the size is unchanged. */
  setBoard(board: Board, theme: BoardTheme) {
    const sizeChanged = board.size !== this.size;
    this.size = board.size;
    this.tiles = board.tiles;
    this.theme = theme;
    const n = board.size * board.size;
    if (sizeChanged || !this.mesh) {
      if (this.mesh) {
        this.world.remove(this.mesh);
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
      }
      const geo = new THREE.BoxGeometry(GAP, 1, GAP);
      geo.translate(0, 0.5, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.2 });
      this.mesh = new THREE.InstancedMesh(geo, mat, n);
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      this.mesh.frustumCulled = false;
      this.world.add(this.mesh);
      this.heights = new Float32Array(n);
      this.targets = new Float32Array(n);
      this.colours = new Float32Array(n * 3);
      this.colourTargets = new Float32Array(n * 3);
      const d = Math.max(board.size, 6);
      this.camera.position.set(d * 0.05, d * 1.05, d * 1.5);
      this.controls.target.set(0, 0.3, 0);
      this.controls.minDistance = d * 0.5;
      this.controls.maxDistance = d * 3.2;
      this.controls.update();
    }
    this.resetColumns();
  }

  /** Cell centre in world space. */
  cellPos(i: number, y = 0): THREE.Vector3 {
    const s = this.size;
    const r = Math.floor(i / s);
    const c = i % s;
    return new THREE.Vector3(c - (s - 1) / 2, y, r - (s - 1) / 2);
  }

  /** World y of the top surface of a cell right now. */
  topOf(i: number): number {
    return (BASE[this.tiles[i]] ?? 0.14) + (this.tiles[i] === Tile.Wall ? 0 : this.heights[i]);
  }

  private tileColour(i: number): [number, number, number] {
    const t = this.theme!;
    const r = Math.floor(i / this.size);
    const c = i % this.size;
    const hex = this.tiles[i] === Tile.Wall ? t.wall : this.tiles[i] === Tile.Mud ? t.mud : (r + c) % 2 === 0 ? t.light : t.dark;
    this.tmp.set(hex);
    // tint to linear-ish so the dark board stays dark under ACES
    return [this.tmp.r * 1.25, this.tmp.g * 1.25, this.tmp.b * 1.25];
  }

  /** Reset every column to its tile's resting height and colour. */
  resetColumns() {
    for (let i = 0; i < this.size * this.size; i++) {
      this.targets[i] = 0;
      const [r, g, b] = this.tileColour(i);
      this.colourTargets.set([r, g, b], i * 3);
      this.colours.set([r, g, b], i * 3);
      this.heights[i] = 0;
    }
    this.writeInstances();
  }

  /** Raise cell `i` by `height` above its resting top and tint it. rgb can exceed 1 to glow. */
  setCell(i: number, height: number, rgb?: [number, number, number]) {
    this.targets[i] = this.tiles[i] === Tile.Wall ? 0 : height;
    const c = rgb ?? this.tileColour(i);
    this.colourTargets[i * 3] = c[0];
    this.colourTargets[i * 3 + 1] = c[1];
    this.colourTargets[i * 3 + 2] = c[2];
  }

  setCellHex(i: number, height: number, hex: string, glow = 1) {
    this.tmp.set(hex);
    this.setCell(i, height, [this.tmp.r * glow, this.tmp.g * glow, this.tmp.b * glow]);
  }

  restCell(i: number) {
    this.setCell(i, 0);
  }

  private writeInstances() {
    if (!this.mesh) return;
    const s = this.size;
    const col = this.mesh.instanceColor!;
    for (let i = 0; i < s * s; i++) {
      const r = Math.floor(i / s);
      const c = i % s;
      const wall = this.tiles[i] === Tile.Wall;
      const h = (BASE[this.tiles[i]] ?? 0.14) + (wall ? 0 : this.heights[i]);
      this.dummy.position.set(c - (s - 1) / 2, -0.5 + 0, r - (s - 1) / 2);
      this.dummy.position.y = -0.5;
      this.dummy.scale.set(1, h + 0.5, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      col.setXYZ(i, this.colours[i * 3], this.colours[i * 3 + 1], this.colours[i * 3 + 2]);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    col.needsUpdate = true;
  }

  /** Raycast to a board cell index, or -1. */
  pick(e: { clientX: number; clientY: number }): number {
    if (!this.mesh) return -1;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const hit = this.ray.intersectObject(this.mesh)[0];
    return hit && hit.instanceId !== undefined ? hit.instanceId : -1;
  }

  // ------------------------------------------------------------ helpers for labs

  /** Rasterise an SVG piece into a canvas texture (SVGs without a width/height upload as empty textures). */
  texture(name: string): THREE.Texture {
    let t = this.textures.get(name);
    if (!t) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const img = new Image();
      img.onload = () => {
        canvas.getContext('2d')!.drawImage(img, 0, 0, 256, 256);
        tex.needsUpdate = true;
      };
      img.src = asset(`pieces/maestro/${name}.svg`);
      this.textures.set(name, tex);
      t = tex;
    }
    return t;
  }

  billboard(name: string, size = 1.1): THREE.Sprite {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture(name), transparent: true, depthWrite: false, color: new THREE.Color(0.72, 0.72, 0.74) }));
    spr.scale.set(size, size, 1);
    spr.center.set(0.5, 0.1);
    this.world.add(spr);
    return spr;
  }

  beacon(hex: string, height = 3): THREE.Group {
    const g = new THREE.Group();
    const col = new THREE.Color(hex);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.14, height, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.4), transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    beam.position.y = height / 2;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.035, 12, 48),
      new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.8) }),
    );
    ring.rotation.x = Math.PI / 2;
    g.add(beam, ring);
    g.userData = { ring, beam };
    this.world.add(g);
    return g;
  }

  tube(points: THREE.Vector3[], hex: string, radius = 0.075): THREE.Mesh | null {
    if (points.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.3);
    const geo = new THREE.TubeGeometry(curve, Math.max(8, points.length * 8), radius, 10, false);
    const col = new THREE.Color(hex).multiplyScalar(1.5);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col }));
    this.world.add(mesh);
    return mesh;
  }

  /** Reveal a fraction [0,1] of a tube built by `tube()`. */
  static reveal(mesh: THREE.Mesh | null, f: number) {
    if (!mesh) return;
    const idx = mesh.geometry.index;
    if (!idx) return;
    const per = 6 * 10;
    const total = Math.floor(idx.count / per);
    mesh.geometry.setDrawRange(0, Math.floor(total * Math.max(0, Math.min(1, f))) * per);
  }

  dispose3(obj: THREE.Object3D | null | undefined) {
    if (!obj) return;
    this.world.remove(obj);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }

  nudgeCamera() {
    this.idleSince = performance.now();
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // smooth heights and colours toward their targets
    const k = 1 - Math.exp(-dt * 11);
    let dirty = false;
    const n = this.size * this.size;
    for (let i = 0; i < n; i++) {
      const dh = this.targets[i] - this.heights[i];
      if (Math.abs(dh) > 0.0005) {
        this.heights[i] += dh * k;
        dirty = true;
      }
      for (let j = 0; j < 3; j++) {
        const dc = this.colourTargets[i * 3 + j] - this.colours[i * 3 + j];
        if (Math.abs(dc) > 0.001) {
          this.colours[i * 3 + j] += dc * k;
          dirty = true;
        }
      }
    }
    if (dirty) this.writeInstances();
    if (this.particles) this.particles.rotation.y += dt * 0.012;
    this.controls.autoRotate = this.opts.autoRotate || now - this.idleSince > 9000;
    this.controls.update();
    this.onFrame?.(dt, now / 1000);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
