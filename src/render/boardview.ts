// The Board renderer: flat map plane (canvas cartography), asset unit pieces
// fighting along the contested border, free pan/zoom camera that stays
// top-down at altitude and eases to a mild tilt up close.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Board, depthField, frontLine, gridToWorld, GRID_W, BOARD_W, BOARD_H } from './board/gen';
import { paintBoard, sharedBorderChains } from './board/paint';
import { Effects } from './effects';
import { LINES, capturedName } from '../game/content';
import { armyPower, frontInfos, activeFronts, visibleNations, homeWorldCenter, type FrontInfo } from '../game/war';
import type { GameState, GameEvent, ReinforcementWave } from '../game/state';

const REVEAL_STEPS = 2;          // conquest steps visible past the contested territory
const UNIT_VIS_DIST = 48;        // camera distance where unit pieces appear
const MIN_DIST = 11, MAX_DIST = 125;
const ZOOM_LEVELS = [18, 30, 48, 76, 112];

// Line index → model file. Missing files fall back to primitive pieces.
// 'Mech' is kitbashed in code, not loaded from disk.
const FRIENDLY_MODELS = ['Soldier', 'ScoutCar', 'Drone', 'LightTank', 'Howitzer', 'Jet', 'MissileLauncher', '', 'Mech'];
const ENEMY_MODELS = ['Soldier', 'Jeep', 'Helicopter', 'SuperTank'];
const GOLD = new THREE.Color(0xd8a531);
const GOLD_DARK = new THREE.Color(0x8a6a1e);
const SLATE = new THREE.Color(0x6c7280);
const SLATE_DARK = new THREE.Color(0x3f434c);

interface Piece {
  mesh: THREE.Object3D;
  slot: number;
  ord: number;    // ordinal within its faction — drives formation spread
  friendly: boolean;
  line: number;   // production line (friendly) or enemy class index
  x: number; z: number;
  tx: number; tz: number;
  phase: number;
}

interface TransitVisual {
  group: THREE.Group;
  bead: THREE.Mesh;
  route: THREE.Mesh;
  line: number;
  modelVersion: number;
}

export class BoardView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private effects: Effects;
  private board: Board;
  private mapCanvas = document.createElement('canvas');
  private mapTex: THREE.CanvasTexture;
  private paintedStamp = -99;
  private hotTid = -1;
  private seam: THREE.Line;
  private seamGeo = new THREE.BufferGeometry();
  private seamGlow!: THREE.Mesh;
  private seamGlowGeo = new THREE.BufferGeometry();
  private shadowMat!: THREE.MeshBasicMaterial;
  private shadowGeo!: THREE.PlaneGeometry;
  private pieces: Piece[] = [];
  private models = new Map<string, THREE.Object3D>();
  private modelsTinted = new Map<string, THREE.Object3D>();
  private modelsVersion = 0;
  private piecesVersion = -1;
  private time = 0;

  // Camera state.
  private focus = new THREE.Vector2(0, 0);
  private dist = 112;
  private distTarget: number | null = null;
  private lastTouch = -999;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private pinchMid = { x: 0, y: 0 };
  private gestureHadPinch = false;
  private lastTap = { t: -999, x: 0, y: 0 };
  private currentGs: GameState;

  private skirmishAcc = 0;
  private tracerAcc = 0;
  private orbitalAcc = 0;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  // Map-tap targeting (strikes / SEND HERE) + per-line flags on the board.
  private pendingTap: ((w: { x: number; z: number }) => void) | null = null;
  private tapDownAt = { x: 0, y: 0 };
  private flags = new Map<number, THREE.Group>();
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private nationLabelLayer = new THREE.Group();
  private territoryLabelLayer = new THREE.Group();
  private detailLayer = new THREE.Group();
  private borderLayer = new THREE.Group();
  private transits = new Map<number, TransitVisual>();
  private hqMarker = new THREE.Group();
  private chevrons = new Map<number, THREE.Mesh>();
  private pickets = new Map<number, THREE.Group>();
  private homeCenter: { x: number; z: number } | null = null;

  constructor(private canvas: HTMLCanvasElement, gs: GameState, board: Board) {
    this.board = board;
    this.currentGs = gs;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x22303a);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 500);

    this.scene.add(new THREE.HemisphereLight(0xe8eef4, 0x9a8f78, 1.05));
    const sun = new THREE.DirectionalLight(0xfff0d4, 1.35);
    sun.position.set(-30, 60, 20);
    this.scene.add(sun);

    this.mapTex = new THREE.CanvasTexture(this.mapCanvas);
    this.mapTex.colorSpace = THREE.SRGBColorSpace;
    this.mapTex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_W, BOARD_H),
      new THREE.MeshLambertMaterial({ map: this.mapTex })
    );
    plane.rotation.x = -Math.PI / 2;
    this.scene.add(plane);

    this.seam = new THREE.Line(
      this.seamGeo,
      new THREE.LineBasicMaterial({ color: 0xffd684, transparent: true, opacity: 0.9 })
    );
    this.scene.add(this.seam);
    // Glow ribbon under the seam line — reads at every altitude.
    this.seamGlow = new THREE.Mesh(
      this.seamGlowGeo,
      new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    this.scene.add(this.seamGlow);

    // Shared blob-shadow texture for pieces.
    const shCv = document.createElement('canvas');
    shCv.width = shCv.height = 64;
    const shCtx = shCv.getContext('2d')!;
    const grad = shCtx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(0,0,0,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    shCtx.fillStyle = grad;
    shCtx.fillRect(0, 0, 64, 64);
    const shTex = new THREE.CanvasTexture(shCv);
    this.shadowMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false });
    this.shadowGeo = new THREE.PlaneGeometry(0.44, 0.44);

    this.effects = new Effects(this.scene);
    this.loadModels();
    this.buildHqMarker();
    this.setupControls();

    const t = this.strategicCenter(gs);
    this.focus.set(t.x, t.z);
    (window as unknown as { __fd: unknown }).__fd = this;

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  // Kitbashed absurd-tier: PROJECT BIG STOMPY. Neutral grays so faction tint works.
  private buildMech(): THREE.Object3D {
    const g = new THREE.Group();
    const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c });
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ry = 0) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      g.add(mesh);
    };
    const body = mat(0x9a9a9a), dark = mat(0x4a4a4a), light = mat(0xdddddd);
    add(new THREE.BoxGeometry(0.5, 1.1, 0.5), dark, -0.45, 0.55, 0);      // legs
    add(new THREE.BoxGeometry(0.5, 1.1, 0.5), dark, 0.45, 0.55, 0);
    add(new THREE.BoxGeometry(0.7, 0.35, 0.8), dark, -0.45, 0.12, 0.1);   // feet
    add(new THREE.BoxGeometry(0.7, 0.35, 0.8), dark, 0.45, 0.12, 0.1);
    add(new THREE.BoxGeometry(1.7, 0.9, 1.1), body, 0, 1.5, 0);           // torso
    add(new THREE.BoxGeometry(0.8, 0.5, 0.6), light, 0, 2.1, 0.25);       // cockpit
    add(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 6).rotateX(Math.PI / 2), dark, -0.95, 1.75, 0.4); // cannons
    add(new THREE.CylinderGeometry(0.16, 0.16, 1.4, 6).rotateX(Math.PI / 2), dark, 0.95, 1.75, 0.4);
    add(new THREE.BoxGeometry(0.5, 0.4, 0.9), body, -0.95, 1.45, 0);      // shoulder pods
    add(new THREE.BoxGeometry(0.5, 0.4, 0.9), body, 0.95, 1.45, 0);
    const wrap = new THREE.Group();
    const box = new THREE.Box3().setFromObject(g);
    const s = 0.82 / Math.max(box.max.y - box.min.y, 0.001);
    g.scale.setScalar(s);
    g.position.y = -box.min.y * s;
    wrap.add(g);
    return wrap;
  }

  private loadModels(): void {
    const loader = new GLTFLoader();
    this.models.set('Mech', this.buildMech());
    const names = new Set([...FRIENDLY_MODELS, ...ENEMY_MODELS].filter(Boolean).filter(n => n !== 'Mech'));
    // Per-model target sizes — a deliberate scale hierarchy (soldier < truck <
    // tank), aircraft small so they read as air cover, mech towers over all.
    const SIZES: Record<string, number> = {
      Soldier: 0.24, Drone: 0.25, Jet: 0.39, Helicopter: 0.44,
      Jeep: 0.41, ScoutCar: 0.46, Ambulance: 0.43,
      LightTank: 0.54, SuperTank: 0.61, Howitzer: 0.45, MissileLauncher: 0.5
    };
    for (const name of names) {
      loader.load(`./models/${name}.glb`, (gltf) => {
        const obj = gltf.scene;
        // Normalize into a wrapper group: piece fits its target size on its
        // longest axis and stands ON the board (offsets baked on the inner
        // node so per-frame moves of the wrapper never wipe them).
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const s = (SIZES[name] ?? 1.7) / Math.max(size.x, size.y, size.z, 0.001);
        obj.scale.setScalar(s);
        const c = box.getCenter(new THREE.Vector3());
        obj.position.set(-c.x * s, -box.min.y * s, -c.z * s);
        const wrap = new THREE.Group();
        wrap.add(obj);
        this.models.set(name, wrap);
        this.modelsTinted.clear();
        this.modelsVersion++;
      }, undefined, () => { /* fallback pieces cover missing models */ });
    }
  }

  // Faction-tinted clone: hue-map every material toward gold or slate,
  // keeping each part's lightness so detail survives.
  private tinted(name: string, friendly: boolean): THREE.Object3D {
    const key = `${name}|${friendly}`;
    const cached = this.modelsTinted.get(key);
    if (cached) return cached.clone();
    const src = this.models.get(name);
    if (!src) return this.fallbackPiece(friendly);
    const clone = src.clone(true);
    const main = friendly ? GOLD : SLATE;
    const dark = friendly ? GOLD_DARK : SLATE_DARK;
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const wasArray = Array.isArray(mesh.material);
      const mats = wasArray ? mesh.material as THREE.Material[] : [mesh.material as THREE.Material];
      const replaced = mats.map((m) => {
        const src2 = m as THREE.MeshStandardMaterial;
        const hsl = { h: 0, s: 0, l: 0.5 };
        (src2.color ?? new THREE.Color(0x888888)).getHSL(hsl);
        const base = hsl.l > 0.45 ? main : dark;
        const out = base.clone();
        const bh = { h: 0, s: 0, l: 0 };
        out.getHSL(bh);
        out.setHSL(bh.h, bh.s, Math.min(0.58, Math.max(0.16, hsl.l * 0.7 + 0.08)));
        return new THREE.MeshLambertMaterial({ color: out });
      });
      mesh.material = wasArray ? replaced : replaced[0];
    });
    this.modelsTinted.set(key, clone);
    return clone.clone();
  }

  private fallbackPiece(friendly: boolean): THREE.Object3D {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: friendly ? GOLD : SLATE });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.35), mat);
    body.position.y = 0.11;
    g.add(body);
    return g;
  }

  private buildHqMarker(): void {
    const hq = this.ensureHomeCenter();
    const gold = new THREE.MeshBasicMaterial({ color: 0xffcb55, transparent: true, opacity: 0.9, depthWrite: false });
    const dark = new THREE.MeshBasicMaterial({ color: 0x70551b, transparent: true, opacity: 0.65, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.1, 5, 48), gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.16;
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.72, 6), gold);
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.2;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(1.35, 32), dark);
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.11;
    this.hqMarker.add(pad, ring, inner);
    this.hqMarker.position.set(hq.x, 0, hq.z);
    this.scene.add(this.hqMarker);
  }

  // Where the fighting is hottest: the front drawing the most committed force
  // (sticky so the camera doesn't ping-pong between similar fronts).
  private hotFront(gs: GameState): FrontInfo | null {
    const fronts = frontInfos(this.board, gs);
    if (fronts.length === 0) return null;
    const counterattack = gs.wave ? fronts.find(f => f.tid === gs.wave!.targetTid) : null;
    if (counterattack) {
      this.hotTid = counterattack.tid;
      return counterattack;
    }
    // Prefer fronts with a LIVE garrison — a hold-phase parade with no enemy
    // is not a battle worth pointing the camera at (reviewer round 1).
    const score = (f: FrontInfo) => f.committed * (f.garrison > 0 ? 1 : 0.1);
    const cur = fronts.find(f => f.tid === this.hotTid);
    const best = fronts.reduce((a, b) => (score(b) > score(a) ? b : a));
    const pick = cur && score(cur) > score(best) * 0.7 ? cur : best;
    this.hotTid = pick.tid;
    return pick;
  }

  private contestedCenter(gs: GameState): { x: number; z: number } {
    const hot = this.hotFront(gs);
    if (hot) {
      const owned = new Set(gs.owned);
      const pts = frontLine(this.board, hot.tid, owned, gs.captureStamp, hot.progress);
      if (pts.length > 0) {
        const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        const w = gridToWorld(mx, my);
        return { x: w.x, z: w.z };
      }
      const t = this.board.territories.find(q => q.id === hot.tid);
      if (t) { const w = gridToWorld(t.cx, t.cy); return { x: w.x, z: w.z }; }
    }
    const home = this.board.territories.find(t => t.nation === this.board.homeNation) ?? this.board.territories[0];
    const w = gridToWorld(home.cx, home.cy);
    return { x: w.x, z: w.z };
  }

  private strategicCenter(gs: GameState): { x: number; z: number } {
    const vis = visibleNations(this.board, gs);
    const terrs = this.board.territories.filter(t => vis.has(t.nation));
    if (terrs.length === 0) return this.contestedCenter(gs);
    const minX = Math.min(...terrs.map(t => t.cx));
    const maxX = Math.max(...terrs.map(t => t.cx));
    const minY = Math.min(...terrs.map(t => t.cy));
    const maxY = Math.max(...terrs.map(t => t.cy));
    const w = gridToWorld((minX + maxX) * 0.5, (minY + maxY) * 0.5);
    return { x: w.x, z: w.z };
  }

  private setupControls(): void {
    const el = this.canvas;
    el.style.touchAction = 'none';
    // iOS Safari ignores user-scalable=no in browser tabs and hijacks pinch
    // for PAGE zoom — kill its gesture pipeline over the whole app.
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    }
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    el.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
    el.addEventListener('pointerdown', (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.tapDownAt = { x: e.clientX, y: e.clientY };
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic/legacy touch */ }
      this.lastTouch = this.time;
      if (this.pointers.size === 2) {
        this.gestureHadPinch = true;
        const [a, b] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        this.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.lastTouch = this.time;
      if (this.pointers.size === 1) {
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        const before = this.pickWorld(p.x, p.y);
        const after = this.pickWorld(e.clientX, e.clientY);
        // Anchor world space directly under the finger. This remains correct
        // at every pitch/aspect ratio; no screen-axis sign guess is involved.
        if (before && after) {
          this.focus.x += before.x - after.x;
          this.focus.y += before.z - after.z;
        } else {
          const scale = this.worldPerPixel();
          this.focus.x -= dx * scale;
          this.focus.y += dy * scale;
        }
        this.clampFocus();
        this.positionCamera();
      } else if (this.pointers.size === 2) {
        const prevMid = this.pinchMid;
        const anchor = this.pickWorld(prevMid.x, prevMid.y);
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (this.pinchDist > 0) {
          const oldDist = this.dist;
          const nextDist = clamp(oldDist * Math.pow(this.pinchDist / Math.max(d, 1), 1.12), MIN_DIST, MAX_DIST);
          this.dist = nextDist;
          this.distTarget = null;
          this.positionCamera();
          const after = this.pickWorld(mid.x, mid.y);
          if (anchor && after) {
            this.focus.x += anchor.x - after.x;
            this.focus.y += anchor.z - after.z;
          }
          this.clampFocus();
          this.positionCamera();
        }
        this.pinchDist = d;
        this.pinchMid = mid;
        return;
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - this.tapDownAt.x, e.clientY - this.tapDownAt.y);
      // A short, unmoved press with an armed action = a map tap.
      if (!this.gestureHadPinch && this.pendingTap && this.pointers.size === 1) {
        if (moved < 12) {
          const w = this.pickWorld(e.clientX, e.clientY);
          if (w) {
            const cb = this.pendingTap;
            this.pendingTap = null;
            cb(w);
          }
        }
      } else if (!this.gestureHadPinch && this.pointers.size === 1 && moved < 14) {
        // Double-tap: quick zoom toggle between battle and board altitude.
        const now = performance.now();
        const near = Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < 40;
        if (now - this.lastTap.t < 320 && near) {
          const w = this.pickWorld(e.clientX, e.clientY);
          if (w && this.dist > 40) { this.focus.set(w.x, w.z); this.clampFocus(); }
          this.distTarget = this.dist > 40 ? 24 : 92;
          this.lastTap.t = -999;
        } else {
          this.lastTap = { t: now, x: e.clientX, y: e.clientY };
        }
      }
      this.pointers.delete(e.pointerId);
      this.pinchDist = 0;
      if (this.pointers.size === 0) this.gestureHadPinch = false;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', (e) => {
      this.pointers.delete(e.pointerId);
      this.pinchDist = 0;
      if (this.pointers.size === 0) this.gestureHadPinch = false;
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.lastTouch = this.time;
      const factor = Math.exp(clamp(e.deltaY, -160, 160) * 0.0026);
      this.setZoomAt(e.clientX, e.clientY, this.dist * factor);
    }, { passive: false });
  }

  private worldPerPixel(distance = this.dist): number {
    return (2 * distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5))) /
      Math.max(this.canvas.clientHeight, 1);
  }

  private setZoomAt(clientX: number, clientY: number, requested: number): void {
    const anchor = this.pickWorld(clientX, clientY);
    const nextDist = clamp(requested, MIN_DIST, MAX_DIST);
    this.dist = nextDist;
    this.distTarget = null;
    this.positionCamera();
    const after = this.pickWorld(clientX, clientY);
    if (anchor && after) {
      this.focus.x += anchor.x - after.x;
      this.focus.y += anchor.z - after.z;
    }
    this.clampFocus();
    this.positionCamera();
  }

  zoomIn(): void {
    const r = this.canvas.getBoundingClientRect();
    this.lastTouch = this.time;
    const next = [...ZOOM_LEVELS].reverse().find(level => level < this.dist - 2) ?? MIN_DIST;
    this.setZoomAt(r.left + r.width * 0.5, r.top + r.height * 0.5, next);
  }

  zoomOut(): void {
    const r = this.canvas.getBoundingClientRect();
    this.lastTouch = this.time;
    const next = ZOOM_LEVELS.find(level => level > this.dist + 2) ?? MAX_DIST;
    this.setZoomAt(r.left + r.width * 0.5, r.top + r.height * 0.5, next);
  }

  focusBattle(): void {
    const target = this.contestedCenter(this.currentGs);
    this.focus.set(target.x, target.z);
    this.distTarget = Math.min(this.dist, 46);
    this.lastTouch = this.time;
    this.clampFocus();
  }

  // Public: arm a one-shot map tap (strike targeting, SEND HERE placement).
  armTap(cb: (w: { x: number; z: number }) => void): void {
    this.pendingTap = cb;
  }

  pickWorld(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const out = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, out)) {
      return { x: out.x, z: out.z };
    }
    return null;
  }

  // Strike arrival fireworks at a world point.
  strikeFx(kind: string, w: { x: number; z: number }): void {
    if (kind === 'skyfall' || kind === 'weather') {
      this.tmp.set(w.x, 0, w.z);
      this.effects.orbitalStrike(this.tmp);
    }
    const n = kind === 'weather' ? 14 : kind === 'skyfall' ? 8 : 5;
    for (let i = 0; i < n; i++) {
      const r = kind === 'thunderclap' ? 6 : 12;
      this.tmp.set(w.x + (Math.random() - 0.5) * r, 0.4, w.z + (Math.random() - 0.5) * r);
      this.effects.explode(this.tmp, 1.4 + Math.random() * 1.2);
    }
  }

  // Crisp text lives on sprites, not the map texture (avoids close-up blur).
  private rebuildLabels(gs: GameState): void {
    this.scene.remove(this.nationLabelLayer, this.territoryLabelLayer);
    this.nationLabelLayer = new THREE.Group();
    this.territoryLabelLayer = new THREE.Group();
    const owned = new Set(gs.owned);
    const contested = new Set(activeFronts(this.board, gs));
    const vis = visibleNations(this.board, gs);
    const placed: { x: number; z: number }[] = [];

    const mkText = (text: string, opts: { size: number; color: string; chip?: string; weight?: number }) => {
      const cv = document.createElement('canvas');
      const c2 = cv.getContext('2d')!;
      const font = `${opts.weight ?? 700} 32px ui-sans-serif, system-ui, sans-serif`;
      c2.font = font;
      const w = Math.ceil(c2.measureText(text).width) + 30;
      cv.width = w; cv.height = 54;
      c2.font = font;
      if (opts.chip) {
        c2.fillStyle = opts.chip;
        c2.beginPath();
        c2.roundRect(2, 5, w - 4, 44, 16);
        c2.fill();
      }
      c2.strokeStyle = opts.chip ? 'rgba(10,12,18,0.35)' : 'rgba(10,12,18,0.78)';
      c2.lineWidth = opts.chip ? 2 : 4;
      c2.textBaseline = 'middle';
      c2.strokeText(text, 15, 28);
      c2.fillStyle = opts.color;
      c2.fillText(text, 15, 28);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      const s = opts.size / 54;
      sp.scale.set(w * s, 54 * s, 1);
      return sp;
    };

    // Nation names first (they own their space). The player's origin is a
    // deliberate landmark, not merely another gold patch on the board.
    for (const n of this.board.nations) {
      if (n.territories.length === 0) continue;
      const terrs = n.territories.map(id => this.board.territories.find(t => t.id === id)!).filter(Boolean);
      const isHome = n.id === this.board.homeNation;
      // The homeland sits at the south of the continent. Anchor its badge to
      // the northernmost home province so the phone drawer cannot crop it.
      const homeAnchor = isHome ? [...terrs].sort((a, b) => a.cy - b.cy)[0] : null;
      const cx = homeAnchor?.cx ?? terrs.reduce((s, t) => s + t.cx, 0) / terrs.length;
      const cy = homeAnchor?.cy ?? terrs.reduce((s, t) => s + t.cy, 0) / terrs.length;
      const w = gridToWorld(cx, cy);
      if (!this.boardIsVisible(vis, n.id)) continue;  // true fog: no hint at all
      const conquered = terrs.every(t => owned.has(t.id));
      const text = isHome ? '★ HOME / HQ' : n.name.toUpperCase();
      const label = mkText(text, {
        size: isHome ? 3.15 : 4.6,
        color: isHome ? 'rgba(31,24,8,1)' : conquered ? 'rgba(53,35,5,0.94)' : 'rgba(255,248,233,0.94)',
        chip: isHome ? 'rgba(242,193,78,0.94)' : undefined,
        weight: 900
      });
      label.position.set(w.x, isHome ? 3.8 : 3, w.z);
      this.nationLabelLayer.add(label);
      placed.push({ x: w.x, z: w.z });
    }

    // Territory names, greedy collision skip. Annexed land wears YOUR brand —
    // the map fills with the company as the empire grows.
    for (const t of this.board.territories) {
      if (!vis.has(t.nation)) continue;
      const w = gridToWorld(t.cx, t.cy);
      if (placed.some(p => Math.hypot(p.x - w.x, p.z - w.z) < 13)) continue;
      const isC = contested.has(t.id);
      const isOwned = owned.has(t.id);
      const isHome = t.nation === this.board.homeNation;
      const base = isOwned && !isHome ? capturedName(gs.company || 'Freedom', t.id) : t.name;
      // Truncate on WORD boundaries — "DUST WAST" mid-word reads as a bug.
      let short = base;
      while (short.length > 17 && short.includes(' ')) {
        short = short.split(' ').slice(0, -1).join(' ');
      }
      const sp = mkText(isC ? `⚔ ${short.toUpperCase()}` : short.toUpperCase(), {
        size: isC ? 1.95 : 1.55,
        color: isC ? 'rgba(255,231,174,1)' : 'rgba(255,248,233,0.96)',
        chip: 'rgba(23,28,38,0.88)',
        weight: isOwned || isC ? 900 : 750
      });
      sp.position.set(w.x, 1.6, w.z);
      this.territoryLabelLayer.add(sp);
      placed.push({ x: w.x, z: w.z });
    }
    this.scene.add(this.nationLabelLayer, this.territoryLabelLayer);
  }

  // Sparse physical cartography appears only after zooming in: roads connect
  // neighboring territory centers, while tiny inlaid hubs give each province a
  // focal point. This replaces baked grain/glyph clutter with scale-aware detail.
  private rebuildMapDetails(gs: GameState): void {
    this.scene.remove(this.detailLayer);
    this.detailLayer = new THREE.Group();
    const vis = visibleNations(this.board, gs);
    const owned = new Set(gs.owned);
    const byId = new Map(this.board.territories.map(t => [t.id, t]));

    const friendlyRoads: number[] = [];
    const enemyRoads: number[] = [];
    const roadEdges = new Set<string>();
    for (const t of this.board.territories) {
      if (!vis.has(t.nation)) continue;
      const a = gridToWorld(t.cx, t.cy);
      // One nearest in-country connection per territory is enough to suggest
      // infrastructure. Drawing the full adjacency graph made a spiderweb.
      const other = [...t.neighbors]
        .map(nb => byId.get(nb))
        .filter(q => q && q.nation === t.nation && vis.has(q.nation))
        .sort((u, v) =>
          Math.hypot(u!.cx - t.cx, u!.cy - t.cy) - Math.hypot(v!.cx - t.cx, v!.cy - t.cy)
        )[0];
      if (!other) continue;
      const edge = t.id < other.id ? `${t.id}|${other.id}` : `${other.id}|${t.id}`;
      if (roadEdges.has(edge)) continue;
      roadEdges.add(edge);
      const b = gridToWorld(other.cx, other.cy);
      const target = owned.has(t.id) && owned.has(other.id) ? friendlyRoads : enemyRoads;
      target.push(a.x, 0.09, a.z, b.x, 0.09, b.z);
    }
    const addRoads = (positions: number[], color: number, opacity: number) => {
      if (positions.length === 0) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      this.detailLayer.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color, transparent: true, opacity, depthWrite: false
      })));
    };
    addRoads(enemyRoads, 0x17252b, 0.22);
    addRoads(friendlyRoads, 0x5f4715, 0.32);

    for (const t of this.board.territories) {
      if (!vis.has(t.nation)) continue;
      const w = gridToWorld(t.cx, t.cy);
      const isOwned = owned.has(t.id);
      const hub = new THREE.Group();
      const ringGeo = new THREE.RingGeometry(0.22, 0.34, 12);
      ringGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: isOwned ? 0x6a4c0e : 0xf1e6d0, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide })
      );
      ring.position.y = 0.12;
      hub.add(ring);
      if (isOwned) {
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 0.22, 0.32),
          new THREE.MeshLambertMaterial({ color: 0x6f5114 })
        );
        block.position.y = 0.13;
        hub.add(block);
      }
      hub.position.set(w.x, 0, w.z);
      this.detailLayer.add(hub);
    }
    this.scene.add(this.detailLayer);
  }

  private rebuildBorders(gs: GameState): void {
    this.scene.remove(this.borderLayer);
    this.borderLayer = new THREE.Group();
    const visible = visibleNations(this.board, gs);
    const byId = new Map(this.board.territories.map(t => [t.id, t]));
    const internal: number[] = [];
    const national: number[] = [];
    for (const chain of sharedBorderChains(this.board)) {
      const [a, b] = chain.pair.split('|').map(Number);
      const ta = byId.get(a), tb = byId.get(b);
      const visibleA = !!ta && visible.has(ta.nation);
      const visibleB = !!tb && visible.has(tb.nation);
      if (!visibleA && !visibleB) continue;
      const out = !ta || !tb || !visibleA || !visibleB || ta.nation !== tb.nation ? national : internal;
      const count = chain.closed ? chain.points.length : chain.points.length - 1;
      for (let i = 0; i < count; i++) {
        const p = chain.points[i], q = chain.points[(i + 1) % chain.points.length];
        const wp = gridToWorld(p.x, p.y), wq = gridToWorld(q.x, q.y);
        out.push(wp.x, 0.13, wp.z, wq.x, 0.13, wq.z);
      }
    }
    const add = (positions: number[], color: number, opacity: number) => {
      if (positions.length === 0) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color, transparent: true, opacity, depthWrite: false
      }));
      this.borderLayer.add(lines);
    };
    add(internal, 0x25323a, 0.24);
    add(national, 0x111920, 0.62);
    this.scene.add(this.borderLayer);
  }

  private boardIsVisible(vis: Set<number>, nation: number): boolean {
    return vis.has(nation);
  }

  // SEND HERE flag markers, one per routed line.
  private syncFlags(gs: GameState): void {
    for (let i = 0; i < LINES.length; i++) {
      const t = gs.lines[i].target;
      const existing = this.flags.get(i);
      if (!t) {
        if (existing) { this.scene.remove(existing); this.flags.delete(i); }
        continue;
      }
      if (!existing) {
        const grp = new THREE.Group();
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 3.4, 5),
          new THREE.MeshLambertMaterial({ color: 0x2a2a2a })
        );
        pole.position.y = 1.7;
        const flag = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 0.9, 0.06),
          new THREE.MeshLambertMaterial({ color: 0xd8a531 })
        );
        flag.position.set(0.8, 2.9, 0);
        grp.add(pole, flag);
        this.scene.add(grp);
        this.flags.set(i, grp);
      }
      const f = this.flags.get(i)!;
      f.position.set(t.x, 0, t.z);
      f.rotation.y = Math.sin(this.time * 1.5 + i) * 0.1;
      f.scale.setScalar(clamp(this.dist / 30, 1, 2.4));
    }
  }

  // The physical origin of every delivery. This is intentionally stable in
  // world space: the label can declutter by zoom, but the HQ pad never moves.
  private ensureHomeCenter(): { x: number; z: number } {
    if (!this.homeCenter) this.homeCenter = homeWorldCenter(this.board);
    return this.homeCenter;
  }

  private transitPoint(wave: ReinforcementWave, p: number): THREE.Vector3 {
    const dx = wave.to.x - wave.from.x, dz = wave.to.z - wave.from.z;
    const len = Math.hypot(dx, dz) || 1;
    const side = wave.id % 2 === 0 ? 1 : -1;
    const bow = Math.min(8, len * 0.12) * Math.sin(Math.PI * p) * side;
    const role = LINES[wave.line]?.combat.role;
    const altitude = role === 'orbital' ? 3.2 * Math.sin(Math.PI * p)
      : role === 'air' ? 1.35
      : role === 'missile' ? 0.65 + 1.1 * Math.sin(Math.PI * p)
      : 0.12;
    return new THREE.Vector3(
      wave.from.x + dx * p + (-dz / len) * bow,
      altitude,
      wave.from.z + dz * p + (dx / len) * bow
    );
  }

  private makeTransit(wave: ReinforcementWave): TransitVisual {
    const group = new THREE.Group();
    const role = LINES[wave.line]?.combat.role;
    const modelName = FRIENDLY_MODELS[wave.line];
    const shown = clamp(Math.ceil(Math.sqrt(Math.max(wave.count, 1)) / 3), 1, 3);
    for (let i = 0; i < shown; i++) {
      let mesh: THREE.Object3D;
      if (role === 'orbital') {
        mesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.28, 0),
          new THREE.MeshBasicMaterial({ color: 0xffdc79 })
        );
      } else {
        mesh = modelName ? this.tinted(modelName, true) : this.fallbackPiece(true);
      }
      mesh.position.set((i - (shown - 1) / 2) * 0.58, 0, (i % 2) * -0.35);
      group.add(mesh);
    }
    const routePoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const p = this.transitPoint(wave, i / 24);
      p.y = 0.28;
      routePoints.push(p);
    }
    const ribbon: number[] = [], indices: number[] = [];
    for (let i = 0; i < routePoints.length; i++) {
      const prev = routePoints[Math.max(0, i - 1)], next = routePoints[Math.min(routePoints.length - 1, i + 1)];
      const dx = next.x - prev.x, dz = next.z - prev.z;
      const dl = Math.hypot(dx, dz) || 1;
      const nx = -dz / dl * 0.16, nz = dx / dl * 0.16;
      ribbon.push(routePoints[i].x + nx, 0.28, routePoints[i].z + nz);
      ribbon.push(routePoints[i].x - nx, 0.28, routePoints[i].z - nz);
      if (i < routePoints.length - 1) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        indices.push(a, b, c, b, d, c);
      }
    }
    const routeGeo = new THREE.BufferGeometry();
    routeGeo.setAttribute('position', new THREE.Float32BufferAttribute(ribbon, 3));
    routeGeo.setIndex(indices);
    const route = new THREE.Mesh(
      routeGeo,
      new THREE.MeshBasicMaterial({ color: 0xffe29a, transparent: true, opacity: 0.72, depthWrite: false, depthTest: false, side: THREE.DoubleSide })
    );
    route.renderOrder = 20;
    const beadGeo = new THREE.CircleGeometry(0.46, 16);
    beadGeo.rotateX(-Math.PI / 2);
    const bead = new THREE.Mesh(
      beadGeo,
      new THREE.MeshBasicMaterial({ color: 0xffdc79, transparent: true, opacity: 0.96, depthWrite: false, depthTest: false })
    );
    bead.renderOrder = 21;
    this.scene.add(route, bead, group);
    return { group, bead, route, line: wave.line, modelVersion: this.modelsVersion };
  }

  // Saved reinforcement waves are the only things shown in transit. A route
  // therefore answers where a unit came from, where it is going, and whether
  // it has actually joined combat—there are no decorative fake convoys.
  private syncReinforcements(gs: GameState): void {
    const live = new Set(gs.reinforcements.map(w => w.id));
    for (const [id, visual] of this.transits) {
      if (live.has(id) && visual.modelVersion === this.modelsVersion) continue;
      this.scene.remove(visual.group, visual.bead, visual.route);
      visual.route.geometry.dispose();
      visual.bead.geometry.dispose();
      this.transits.delete(id);
    }
    const routedTargets = new Set<number>();
    for (const wave of gs.reinforcements) {
      let visual = this.transits.get(wave.id);
      if (!visual) {
        visual = this.makeTransit(wave);
        this.transits.set(wave.id, visual);
      }
      const p = this.transitPoint(wave, wave.progress);
      const ahead = this.transitPoint(wave, Math.min(1, wave.progress + 0.01));
      visual.group.position.copy(p);
      visual.bead.position.set(p.x, 0.24, p.z);
      visual.bead.scale.setScalar(clamp(this.dist / 88, 0.72, 1.25));
      visual.group.rotation.y = Math.atan2(ahead.x - p.x, ahead.z - p.z);
      visual.group.visible = this.dist < 74;
      visual.bead.visible = this.dist >= 65;
      // Route is strategic/operational symbology. Inside the battle frame it
      // would read as a giant weapon tracer and compete with real units.
      visual.route.visible = this.dist > 42 && !routedTargets.has(wave.targetTid);
      routedTargets.add(wave.targetTid);
      (visual.route.material as THREE.MeshBasicMaterial).opacity = this.dist > 76 ? 0.82 : 0.62;
    }
    const pulse = 1 + Math.sin(this.time * 2.6) * 0.08;
    const strategicScale = clamp(this.dist / 68, 0.8, 1.8);
    this.hqMarker.scale.setScalar(strategicScale * pulse);
    this.hqMarker.visible = this.dist > 24;
  }

  // Every front gets a visible skirmish — enemy garrison clusters facing your
  // pickets — so the war is two-sided EVERYWHERE, not just at the hot front.
  private updatePickets(gs: GameState, fronts: FrontInfo[], hot: FrontInfo | null): void {
    const live = new Set<number>();
    const hc = this.ensureHomeCenter();
    for (const f of fronts) {
      if (hot && f.tid === hot.tid) continue;      // hot front has the full battle
      live.add(f.tid);
      const signature = `${Math.floor(Math.log10(Math.max(f.garrison, 1)))}|${f.unitsByLine.map(n => n > 0.1 ? 1 : 0).join('')}`;
      const existing = this.pickets.get(f.tid);
      if (existing?.userData.signature === signature) continue;
      if (existing) { this.scene.remove(existing); this.pickets.delete(f.tid); }
      const t = this.board.territories.find(q => q.id === f.tid);
      if (!t) continue;
      const w = gridToWorld(t.cx, t.cy);
      const grp = new THREE.Group();
      let dx = hc.x - w.x, dz = hc.z - w.z;
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl; dz /= dl;
      const en = clamp(Math.round(2 + Math.pow(Math.max(f.garrison, 2), 0.18)), 3, 9);
      for (let i = 0; i < en; i++) {
        const m = this.tinted(ENEMY_MODELS[i % ENEMY_MODELS.length], false);
        m.position.set((i % 3 - 1) * 3.2 + (i * 1.7) % 2, 0, Math.floor(i / 3) * 3 + ((i * 2.3) % 2));
        m.rotation.y = Math.atan2(dx, dz) + ((i * 13) % 7 - 3) * 0.09;
        grp.add(m);
      }
      // Friendly pickets reflect this front's surviving formation, not the
      // global arsenal or a future DIRECT order.
      const arsenal: string[] = [];
      for (let li = 0; li < LINES.length; li++) {
        if (f.unitsByLine[li] > 0.1 && FRIENDLY_MODELS[li]) arsenal.push(FRIENDLY_MODELS[li]);
      }
      if (arsenal.length === 0) arsenal.push('Soldier');
      const fr = clamp(Math.round(en * 0.7), 2, 6);
      for (let i = 0; i < fr; i++) {
        const m = this.tinted(arsenal[i % arsenal.length], true);
        m.position.set((i % 3 - 1) * 3 + dx * 9, 0, Math.floor(i / 3) * 2.6 + dz * 9);
        m.rotation.y = Math.atan2(-dx, -dz);
        grp.add(m);
      }
      grp.position.set(w.x - dx * 4, 0, w.z - dz * 4);
      grp.userData.signature = signature;
      this.scene.add(grp);
      this.pickets.set(f.tid, grp);
    }
    for (const [tid, grp] of this.pickets) {
      if (!live.has(tid)) { this.scene.remove(grp); this.pickets.delete(tid); continue; }
      grp.visible = this.dist < UNIT_VIS_DIST;
      grp.scale.setScalar(1);
    }
  }

  private clampFocus(): void {
    // At altitude, keep the continent centered — panning into open sea leaves
    // a dead band with UI floating in void (reviewer N4).
    const slack = this.dist > 80 ? 0.16 : 0.5;
    this.focus.x = clamp(this.focus.x, -BOARD_W * slack, BOARD_W * slack);
    this.focus.y = clamp(this.focus.y, -BOARD_H * (this.dist > 80 ? 0.22 : 0.5), BOARD_H * (this.dist > 80 ? 0.22 : 0.5));
  }

  private positionCamera(): void {
    const zoomT = 1 - clamp((this.dist - MIN_DIST) / (MAX_DIST - MIN_DIST), 0, 1);
    const pitch = THREE.MathUtils.degToRad(88 - zoomT * 26);
    const horiz = Math.cos(pitch) * this.dist;
    const py = Math.sin(pitch) * this.dist;
    this.camera.position.set(this.focus.x, py, this.focus.y + horiz);
    this.camera.lookAt(this.focus.x, 0, this.focus.y);
    this.camera.updateMatrixWorld();
  }

  private resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth, h = parent.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(gs: GameState, dt: number, events: GameEvent[], time: number): void {
    this.currentGs = gs;
    this.time = time;
    const owned = new Set(gs.owned);
    const fronts = frontInfos(this.board, gs);

    // Repaint the map when ownership changes (capture/fog reveal).
    if (gs.captureStamp !== this.paintedStamp) {
      this.paintedStamp = gs.captureStamp;
      paintBoard(this.mapCanvas, this.board, {
        owned,
        contested: new Set(activeFronts(this.board, gs)),
        visibleNations: visibleNations(this.board, gs),
        company: gs.company || 'FREEDOM'
      });
      this.mapTex.needsUpdate = true;
      this.rebuildLabels(gs);
      this.rebuildMapDetails(gs);
      this.rebuildBorders(gs);
    }
    // Deliberate zoom ladder. Strategic altitude shows nations only; the
    // territory chips and physical cartography arrive progressively, then text
    // clears out again inside the close battle frame.
    this.nationLabelLayer.visible = this.dist > 68;
    this.territoryLabelLayer.visible = this.dist > 28 && this.dist < 78;
    this.detailLayer.visible = this.dist > 22 && this.dist < 68;
    const suppressUnderHud = (layer: THREE.Group, edgeLimit: number) => {
      if (!layer.visible) return;
      const v = new THREE.Vector3();
      for (const child of layer.children) {
        v.copy(child.position).project(this.camera);
        child.visible = v.y < 0.58 && v.y > -0.72 && Math.abs(v.x) < edgeLimit;
      }
    };
    suppressUnderHud(this.nationLabelLayer, 0.82);
    suppressUnderHud(this.territoryLabelLayer, 0.72);

    // Hot front: full seam + pieces. Other fronts: ambient skirmish glow.
    const hot = this.hotFront(gs);
    const pts = hot ? frontLine(this.board, hot.tid, owned, gs.captureStamp, hot.progress) : [];
    if (pts.length > 1) {
      const arr = new Float32Array(pts.length * 3);
      const ribbon = new Float32Array(pts.length * 2 * 3);
      const glowW = 0.58 + clamp(this.dist / 82, 0, 1.45);
      for (let i = 0; i < pts.length; i++) {
        const w = gridToWorld(pts[i].x, pts[i].y);
        arr[i * 3] = w.x; arr[i * 3 + 1] = 0.25 + Math.sin(time * 3 + i) * 0.05; arr[i * 3 + 2] = w.z;
        const nb = pts[Math.min(pts.length - 1, i + 1)];
        const pv = pts[Math.max(0, i - 1)];
        let nx = -(nb.y - pv.y), nz = nb.x - pv.x;
        const nl = Math.hypot(nx, nz) || 1;
        nx = nx / nl * glowW; nz = nz / nl * glowW;
        const wl = gridToWorld(pts[i].x + nx, pts[i].y + nz);
        const wr = gridToWorld(pts[i].x - nx, pts[i].y - nz);
        ribbon[i * 6] = wl.x; ribbon[i * 6 + 1] = 0.12; ribbon[i * 6 + 2] = wl.z;
        ribbon[i * 6 + 3] = wr.x; ribbon[i * 6 + 4] = 0.12; ribbon[i * 6 + 5] = wr.z;
      }
      this.seamGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      this.seamGeo.attributes.position.needsUpdate = true;
      // Triangle-strip indices for the ribbon.
      const idxArr: number[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
        idxArr.push(a, b, c, b, d, c);
      }
      this.seamGlowGeo.setAttribute('position', new THREE.BufferAttribute(ribbon, 3));
      this.seamGlowGeo.setIndex(idxArr);
      this.seamGlowGeo.attributes.position.needsUpdate = true;
      this.seam.visible = this.seamGlow.visible = true;
      (this.seam.material as THREE.LineBasicMaterial).opacity = 0.7 + Math.sin(time * 2.5) * 0.12;
      (this.seamGlow.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(time * 2.1) * 0.07;
    } else {
      this.seam.visible = this.seamGlow.visible = false;
    }

    // Battle pieces along the hot seam.
    this.updatePieces(gs, pts, hot, dt);

    // Skirmish flashes are mid/close detail. Far altitude gets the clean seam
    // and strategic chevrons without giant explosions sprayed over the board.
    const A = hot ? Math.max(hot.garrison, hot.strength * 0.15, 8) : 0;
    const P = armyPower(gs);
    if (P > 0 && pts.length > 0 && this.dist < 82) {
      this.skirmishAcc += dt * Math.min(2 + Math.pow(Math.min(P, A), 0.22), 7);
      while (this.skirmishAcc >= 1) {
        this.skirmishAcc -= 1;
        const p = pts[Math.floor(Math.random() * pts.length)];
        const w = gridToWorld(p.x + (Math.random() - 0.5) * 6, p.y + (Math.random() - 0.5) * 6);
        this.tmp.set(w.x, 0.3, w.z);
        this.effects.explode(this.tmp, this.dist > UNIT_VIS_DIST ? 0.5 : 0.48);
      }
      // Ambient war on the other fronts — the whole border is alive.
      for (const f of fronts) {
        if (!hot || f.tid === hot.tid) continue;
        if (Math.random() < dt * Math.min(0.4 + f.committed / Math.max(P, 1) * 3, 1.4)) {
          const t = this.board.territories.find(q => q.id === f.tid);
          if (!t) continue;
          const w = gridToWorld(t.cx + (Math.random() - 0.5) * 16, t.cy + (Math.random() - 0.5) * 16);
          this.tmp.set(w.x, 0.3, w.z);
          this.effects.explode(this.tmp, 0.58 + Math.random() * 0.28);
        }
      }
      if (this.dist < UNIT_VIS_DIST && this.pieces.length > 1) {
        this.tracerAcc += dt * Math.min(3 + Math.pow(Math.min(P, A), 0.26), 14) * clamp(pts.length / 55, 0.25, 1);
        while (this.tracerAcc >= 1) {
          this.tracerAcc -= 1;
          const from = this.pieces[Math.floor(Math.random() * this.pieces.length)];
          const targets = this.pieces.filter(q => q.friendly !== from.friendly);
          if (targets.length === 0) break;
          const to = targets[Math.floor(Math.random() * targets.length)];
          this.tmp.set(from.x, 0.7, from.z);
          this.tmp2.set(to.x, 0.5, to.z);
          this.effects.fireTracer(this.tmp, this.tmp2, from.friendly);
        }
      }
      if (gs.lines[7].army >= 1) {
        this.orbitalAcc += dt;
        if (this.orbitalAcc > 7 && pts.length > 0) {
          this.orbitalAcc = 0;
          const p = pts[Math.floor(Math.random() * pts.length)];
          const w = gridToWorld(p.x, p.y - 6);
          this.tmp.set(w.x, 0, w.z);
          this.effects.orbitalStrike(this.tmp);
        }
      }
    }

    for (const e of events) {
      if (e.type === 'territoryWon') {
        const t = this.board.territories.find(q => q.id === e.tid);
        if (t) {
          const cw = gridToWorld(t.cx, t.cy);
          this.tmp.set(cw.x, 0, cw.z);
          this.effects.conquestWave(this.tmp, 24);
          for (let i = 0; i < 8; i++) {
            const w = gridToWorld(t.cx + (Math.random() - 0.5) * 30, t.cy + (Math.random() - 0.5) * 30);
            this.tmp.set(w.x, 0.4, w.z);
            this.effects.explode(this.tmp, 1.4 + Math.random());
          }
        }
      } else if (e.type === 'waveStarted') {
        // Cut the camera to the counteroffensive (unless the player is driving).
        if (time - this.lastTouch > 4) {
          const home = this.contestedCenter(gs);
          this.focus.set(home.x, home.z);
          this.dist = Math.min(this.dist, 34);
        }
      } else if (e.type === 'nationFell') {
        const n = this.board.nations[e.nation];
        for (const tid of n.territories) {
          const t = this.board.territories.find(q => q.id === tid);
          if (!t) continue;
          const w = gridToWorld(t.cx, t.cy);
          this.tmp.set(w.x, 0.4, w.z);
          this.effects.explode(this.tmp, 2.2);
        }
      }
    }

    this.syncFlags(gs);
    this.syncReinforcements(gs);
    this.updatePickets(gs, fronts, hot);

    // Momentum chevrons: pulsing gold arrows where you're overwhelming a
    // front — the strategic view answers "where am I winning?" at a glance.
    const winning = new Set<number>();
    for (const f of fronts) {
      if (f.garrison > 0 && f.committed > f.garrison * 2) winning.add(f.tid);
    }
    for (const [tid, mesh] of this.chevrons) {
      if (!winning.has(tid)) { this.scene.remove(mesh); this.chevrons.delete(tid); }
    }
    const hc = this.ensureHomeCenter();
    for (const tid of winning) {
      let cone = this.chevrons.get(tid);
      const t = this.board.territories.find(q => q.id === tid);
      if (!t) continue;
      const w = gridToWorld(t.cx, t.cy);
      if (!cone) {
        // Flat arrow lying on the map — from top-down a cone has no direction.
        const shape = new THREE.Shape();
        shape.moveTo(0, 1.8);
        shape.lineTo(1.2, 0);
        shape.lineTo(0.45, 0);
        shape.lineTo(0.45, -1.6);
        shape.lineTo(-0.45, -1.6);
        shape.lineTo(-0.45, 0);
        shape.lineTo(-1.2, 0);
        shape.closePath();
        const geo = new THREE.ShapeGeometry(shape);
        geo.rotateX(-Math.PI / 2);
        cone = new THREE.Mesh(
          geo,
          new THREE.MeshBasicMaterial({ color: 0xffd25e, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
        );
        this.scene.add(cone);
        this.chevrons.set(tid, cone);
      }
      const ang = Math.atan2(w.x - hc.x, w.z - hc.z);
      // Strategic-view feature ONLY — inside battle frames it reads as a
      // paper airplane parked among the units (round-5).
      cone.visible = this.dist > 45;
      // Drift along the heading: motion sells direction better than shape.
      const drift = ((time * 1.4) % 1) * 3 - 1.5;
      const dl2 = Math.hypot(w.x - hc.x, w.z - hc.z) || 1;
      cone.position.set(
        w.x + ((w.x - hc.x) / dl2) * drift, 1.2,
        w.z + ((w.z - hc.z) / dl2) * drift
      );
      cone.rotation.y = ang;
      const pulse = 0.85 + Math.sin(time * 3.2) * 0.25;
      cone.scale.setScalar(pulse * clamp(this.dist / 22, 1, 3.6));
      (cone.material as THREE.MeshBasicMaterial).opacity = 0.48 + Math.sin(time * 3.2) * 0.18;
    }

    this.effects.update(dt);

    // Double-tap zoom tween.
    if (this.distTarget !== null) {
      this.dist += (this.distTarget - this.dist) * Math.min(1, dt * 6);
      if (Math.abs(this.dist - this.distTarget) < 0.5) this.distTarget = null;
    }

    // Camera: idle eases home — to the battle when engaged, to the whole
    // continent when surveying from altitude (keeps the board centered).
    const battleCenter = this.contestedCenter(gs);
    const stranded = this.dist < 82 && Math.hypot(this.focus.x - battleCenter.x, this.focus.y - battleCenter.z) > this.dist * 0.95;
    if (this.dist > 102 || stranded || time - this.lastTouch > 8) {
      const home = this.dist > 95 ? this.strategicCenter(gs) : battleCenter;
      const focusEase = this.dist > 102 || stranded ? 2.8 : 0.8;
      this.focus.x += (home.x - this.focus.x) * Math.min(1, dt * focusEase);
      this.focus.y += (home.z - this.focus.y) * Math.min(1, dt * focusEase);
    }
    this.clampFocus();

    // Pitch: near-vertical at altitude, easing to ~62° from horizontal up close.
    const zoomT = 1 - clamp((this.dist - MIN_DIST) / (MAX_DIST - MIN_DIST), 0, 1);
    const pitch = THREE.MathUtils.degToRad(88 - zoomT * 26); // 88° → 62°
    const horiz = Math.cos(pitch) * this.dist;
    const py = Math.sin(pitch) * this.dist;
    this.camera.position.set(this.focus.x, py, this.focus.y + horiz);
    this.camera.lookAt(this.focus.x, 0, this.focus.y);

    this.renderer.render(this.scene, this.camera);
  }

  private updatePieces(gs: GameState, pts: { x: number; y: number }[], hot: FrontInfo | null, dt: number): void {
    const show = this.dist < UNIT_VIS_DIST && pts.length > 0 && hot !== null;
    // Desired piece counts: sqrt-scaled armies, capped for phone perf, and
    // squeezed down when the seam shrinks to a small pocket.
    const room = show ? clamp(pts.length / 55, 0.3, 1) : 0;
    const want: { friendly: boolean; line: number }[] = [];
    if (show && hot) {
      const caps = [10, 4, 3, 4, 2, 2, 1, 0, 1];
      for (let i = 0; i < LINES.length; i++) {
        const n = Math.round(Math.min(caps[i], Math.sqrt(hot.unitsByLine[i]) * (i === 0 ? 1.6 : 0.8)) * room);
        for (let k = 0; k < n; k++) want.push({ friendly: true, line: i });
      }
      // Defenders scale with the remaining garrison. The close frame must
      // NEVER be a one-sided parade: hold-phase keeps enemy remnants in shot,
      // and a FINAL WAVE floods the field.
      let en = Math.round(Math.min(20, 4.5 * Math.pow(Math.max(hot.garrison, 2), 0.22)) * room);
      if (hot.garrison <= 0) en = Math.max(en, Math.round(6 * room) + 3);
      if (gs.wave) en = Math.max(en, Math.round(10 * room) + 4);
      for (let k = 0; k < en; k++) want.push({ friendly: false, line: k % ENEMY_MODELS.length });
    }

    // Incremental piece management: new pieces SPAWN AT THE REAR and march in
    // (mass production made visible); losses remove from the tail. A model
    // load flush still rebuilds everything once.
    if (this.piecesVersion !== this.modelsVersion) {
      this.piecesVersion = this.modelsVersion;
      for (const p of this.pieces) this.scene.remove(p.mesh);
      this.pieces = [];
    }
    const wantCount = new Map<string, number>();
    for (const w of want) {
      const k = `${w.friendly}|${w.line}`;
      wantCount.set(k, (wantCount.get(k) ?? 0) + 1);
    }
    const haveCount = new Map<string, number>();
    for (const p of this.pieces) {
      const k = `${p.friendly}|${p.line}`;
      haveCount.set(k, (haveCount.get(k) ?? 0) + 1);
    }
    let changed = false;
    // Remove excess (killed/withdrawn) from the tail.
    for (const [k, have] of haveCount) {
      const need = wantCount.get(k) ?? 0;
      let excess = have - need;
      for (let i = this.pieces.length - 1; i >= 0 && excess > 0; i--) {
        const p = this.pieces[i];
        if (`${p.friendly}|${p.line}` !== k) continue;
        this.scene.remove(p.mesh);
        this.pieces.splice(i, 1);
        excess--; changed = true;
      }
    }
    // Add reinforcements, spawning behind their own side.
    for (const [k, need] of wantCount) {
      const have = haveCount.get(k) ?? 0;
      for (let n = have; n < need; n++) {
        const [fStr, lStr] = k.split('|');
        const friendly = fStr === 'true';
        const line = Number(lStr);
        const name = friendly ? FRIENDLY_MODELS[line] : ENEMY_MODELS[line];
        const mesh = name ? this.tinted(name, friendly) : this.fallbackPiece(friendly);
        const flies = friendly ? (line === 2 || line === 5) : line === 2;
        const sh = new THREE.Mesh(this.shadowGeo, this.shadowMat);
        sh.rotation.x = -Math.PI / 2;
        sh.position.y = 0.06;
        mesh.add(sh);
        if (flies) mesh.userData.shadow = sh;
        this.scene.add(mesh);
        const piece: Piece = {
          mesh, slot: this.pieces.length, ord: 0, friendly, line,
          x: 0, z: 0, tx: 0, tz: 0, phase: Math.random() * Math.PI * 2
        };
        this.pieces.push(piece);
        // Snap to formation, then displace toward its own rear so it marches in.
        this.assignSlot(piece, pts, gs, hot, true);
        const hc = this.ensureHomeCenter();
        let dx = hc.x - piece.tx, dz = hc.z - piece.tz;
        const dl = Math.hypot(dx, dz) || 1;
        dx /= dl; dz /= dl;
        const rear = friendly ? 1 : -1;
        const dist = 12 + Math.random() * 10;
        piece.x = piece.tx + dx * dist * rear;
        piece.z = piece.tz + dz * dist * rear;
        changed = true;
      }
    }
    // Re-number ords per faction so formation spread stays even.
    if (changed) {
      let fi = 0, ei = 0;
      for (const p of this.pieces) p.ord = p.friendly ? fi++ : ei++;
    }

    // March pieces toward their formation slots along the seam.
    for (const p of this.pieces) {
      this.assignSlot(p, pts, gs, hot, false);
      const dx = p.tx - p.x, dz = p.tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        // Far-off pieces redeploy at double time (post-capture advances).
        const hustle = d > 14 ? 4 : 1;
        const classSpeed = p.friendly ? clamp(LINES[p.line].combat.speed * 0.62, 1.1, 8.5) : 2.4;
        const step = Math.min(d, dt * classSpeed * hustle);
        p.x += dx / d * step;
        p.z += dz / d * step;
        p.mesh.rotation.y = Math.atan2(dx, dz) + Math.sin(p.phase * 7.3) * 0.45;
      }
      const fly = p.friendly ? (p.line === 2 || p.line === 5) : p.line === 2;
      const alt = !fly ? 0 : p.friendly && p.line === 2 ? 1.15 : p.friendly ? 1.55 : 0.9;
      const bob = fly ? alt + Math.sin(this.time * 2 + p.phase) * 0.25 : 0;
      p.mesh.position.set(p.x, bob, p.z);
      // Flyers keep a DETACHED ground shadow — without it altitude is
      // invisible from near-top-down and aircraft read as parked (B3).
      const shadow = p.mesh.userData.shadow as THREE.Mesh | undefined;
      if (shadow) shadow.position.y = -bob + 0.06;
      // Units are FIXED world scale — they live in the world, not the UI.
      // Zoom out and they genuinely shrink away (Bridger's rule).
      const jitterScale = 0.74 + ((p.slot * 31) % 19) / 100;
      p.mesh.scale.setScalar(jitterScale);
    }
  }

  private assignSlot(p: Piece, pts: { x: number; y: number }[], gs: GameState, hot: FrontInfo | null, snap: boolean): void {
    if (pts.length === 0 || !hot) return;
    // Spread pieces along the whole seam with a stride, wrapping into deeper
    // ranks when the faction outnumbers the seam's slots. Each faction spreads
    // independently so both sides line the entire front.
    const stride = 3;
    const ai = Math.min(pts.length - 1, (p.ord * stride) % pts.length);
    const wrapRank = Math.floor((p.ord * stride) / pts.length);
    const anchor = pts[ai];
    const next = pts[Math.min(pts.length - 1, ai + 1)];
    // Perpendicular to the local seam direction; orient it toward enemy ground
    // by checking which way the territory's depth field increases.
    let nx = -(next.y - anchor.y), ny = next.x - anchor.x;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    const field = depthField(this.board, hot.tid, new Set(gs.owned), gs.captureStamp);
    if (field) {
      const k0 = Math.round(anchor.y) * GRID_W + Math.round(anchor.x);
      const k1 = Math.round(anchor.y + ny * 5) * GRID_W + Math.round(anchor.x + nx * 5);
      const d0 = field[k0] ?? 0;
      const d1 = k1 >= 0 && k1 < field.length ? field[k1] : -1;
      if (d1 < d0) { nx = -nx; ny = -ny; } // make (nx,ny) point into enemy ground
    }
    // Minimum contact separation keeps opposing pieces from interpenetrating
    // at the seam (round-5: soldier standing inside a tank hull).
    const sign = p.friendly ? -1 : 1;
    const roleRange = p.friendly ? LINES[p.line].combat.range : 5;
    const baseStandoff = p.friendly
      ? clamp(2.4 + roleRange * 0.19, 2.8, 13.5)
      : 3.4;
    const standoff = (baseStandoff + wrapRank * 1.6) * sign;
    const jx = ((p.slot * 37) % 13 - 6) * 0.34;
    const gx = anchor.x + nx * standoff + jx;
    const gy = anchor.y + ny * standoff;
    const w = gridToWorld(gx, gy);
    p.tx = w.x; p.tz = w.z;
    if (snap) { p.x = w.x; p.z = w.z; }
  }
}

function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}
