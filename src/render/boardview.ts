// The Board renderer: flat map plane (canvas cartography), asset unit pieces
// fighting along the contested border, free pan/zoom camera that stays
// top-down at altitude and eases to a mild tilt up close.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Board, generateBoard, depthField, frontLine, gridToWorld, GRID_W, BOARD_W, BOARD_H } from './board/gen';
import { paintBoard, TEX_W, TEX_H } from './board/paint';
import { Effects } from './effects';
import { LINES, BALANCE } from '../game/content';
import { adversaryStrength, armyPower } from '../game/battle';
import type { GameState, GameEvent } from '../game/state';

const REVEAL_STEPS = 2;          // conquest steps visible past the contested territory
const UNIT_VIS_DIST = 70;        // camera distance where unit pieces appear
const MIN_DIST = 11, MAX_DIST = 150;

// Line index → model file. Missing files fall back to primitive pieces.
const FRIENDLY_MODELS = ['Soldier', 'ScoutCar', 'Drone', 'LightTank', 'Howitzer', 'Jet', 'MissileLauncher', ''];
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

export class BoardView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private effects: Effects;
  private board: Board;
  private mapCanvas = document.createElement('canvas');
  private mapTex: THREE.CanvasTexture;
  private paintedSector = -99;
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
  private dist = 90;
  private lastTouch = -999;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;

  private skirmishAcc = 0;
  private tracerAcc = 0;
  private orbitalAcc = 0;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(private canvas: HTMLCanvasElement, gs: GameState) {
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

    this.board = generateBoard(gs.fiscalYear);
    this.mapTex = new THREE.CanvasTexture(this.mapCanvas);
    this.mapTex.colorSpace = THREE.SRGBColorSpace;
    this.mapTex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_W, BOARD_H),
      new THREE.MeshLambertMaterial({ map: this.mapTex })
    );
    plane.rotation.x = -Math.PI / 2;
    this.scene.add(plane);

    // Print-tooth overlay: faint repeating halftone so extreme close-ups keep
    // texture instead of dissolving into blur.
    const dotCv = document.createElement('canvas');
    dotCv.width = dotCv.height = 64;
    const dctx = dotCv.getContext('2d')!;
    dctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      dctx.beginPath();
      dctx.arc(x * 8 + (y % 2) * 4 + 2, y * 8 + 2, 0.9, 0, Math.PI * 2);
      dctx.fill();
    }
    const dotTex = new THREE.CanvasTexture(dotCv);
    dotTex.wrapS = dotTex.wrapT = THREE.RepeatWrapping;
    dotTex.repeat.set(90, 180);
    const tooth = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_W, BOARD_H),
      new THREE.MeshBasicMaterial({ map: dotTex, transparent: true, opacity: 0.07, depthWrite: false })
    );
    tooth.rotation.x = -Math.PI / 2;
    tooth.position.y = 0.02;
    this.scene.add(tooth);

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
    this.shadowGeo = new THREE.PlaneGeometry(1.6, 1.6);

    this.effects = new Effects(this.scene);
    this.loadModels();
    this.setupControls();

    const t = this.contestedCenter(gs);
    this.focus.set(t.x, t.z);
    (window as unknown as { __fd: unknown }).__fd = this;

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  private loadModels(): void {
    const loader = new GLTFLoader();
    const names = new Set([...FRIENDLY_MODELS, ...ENEMY_MODELS].filter(Boolean));
    // Per-model target sizes — aircraft stay small so they read as air cover.
    const SIZES: Record<string, number> = { Drone: 1.1, Jet: 1.35, Helicopter: 1.5, Soldier: 1.5 };
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
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 1.3), mat);
    body.position.y = 0.45;
    g.add(body);
    return g;
  }

  // Where the fighting actually is: midpoint of the front seam, falling back
  // to the contested territory's centroid.
  private contestedCenter(gs: GameState): { x: number; z: number } {
    const pts = frontLine(this.board, gs.sector, gs.front);
    if (pts.length > 0) {
      const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const w = gridToWorld(mx, my);
      return { x: w.x, z: w.z };
    }
    const tid = this.board.conquest[Math.min(gs.sector, this.board.conquest.length - 1)];
    const t = this.board.territories.find(q => q.id === tid) ?? this.board.territories[0];
    const w = gridToWorld(t.cx, t.cy);
    return { x: w.x, z: w.z };
  }

  private setupControls(): void {
    const el = this.canvas;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      this.lastTouch = this.time;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.lastTouch = this.time;
      if (this.pointers.size === 1) {
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        const scale = this.dist / el.clientHeight * 1.35;
        this.focus.y += dy * scale;   // screen up = board north (-z)
        this.focus.x -= dx * scale;
        this.clampFocus();
      } else if (this.pointers.size === 2) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist > 0) this.dist = clamp(this.dist * (this.pinchDist / d), MIN_DIST, MAX_DIST);
        this.pinchDist = d;
        return;
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = (e: PointerEvent) => { this.pointers.delete(e.pointerId); this.pinchDist = 0; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.lastTouch = this.time;
      this.dist = clamp(this.dist * (1 + Math.sign(e.deltaY) * 0.12), MIN_DIST, MAX_DIST);
    }, { passive: false });
  }

  private clampFocus(): void {
    this.focus.x = clamp(this.focus.x, -BOARD_W / 2, BOARD_W / 2);
    this.focus.y = clamp(this.focus.y, -BOARD_H / 2, BOARD_H / 2);
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
    this.time = time;

    // Repaint the map when the contested sector changes (capture/fog reveal).
    if (gs.sector !== this.paintedSector) {
      this.paintedSector = gs.sector;
      paintBoard(this.mapCanvas, this.board, {
        sector: gs.sector, revealAhead: REVEAL_STEPS, company: gs.company || 'FREEDOM'
      });
      this.mapTex.needsUpdate = true;
      this.board.depthFields.clear();
    }

    // Front seam: ordered iso-line polyline + additive glow ribbon.
    const pts = frontLine(this.board, gs.sector, gs.front);
    if (pts.length > 1) {
      const arr = new Float32Array(pts.length * 3);
      const ribbon = new Float32Array(pts.length * 2 * 3);
      const glowW = 0.9 + clamp(this.dist / 60, 0, 1.6);
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
      (this.seam.material as THREE.LineBasicMaterial).opacity = 0.65 + Math.sin(time * 2.5) * 0.2;
      (this.seamGlow.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(time * 2.1) * 0.12;
    } else {
      this.seam.visible = this.seamGlow.visible = false;
    }

    // Battle pieces along the seam.
    this.updatePieces(gs, pts, dt);

    // Skirmish flashes on the seam at every altitude.
    const A = adversaryStrength(gs.sector);
    const P = armyPower(gs);
    if (P > 0 && pts.length > 0) {
      this.skirmishAcc += dt * Math.min(2 + Math.pow(Math.min(P, A), 0.22), 7);
      while (this.skirmishAcc >= 1) {
        this.skirmishAcc -= 1;
        const p = pts[Math.floor(Math.random() * pts.length)];
        const w = gridToWorld(p.x + (Math.random() - 0.5) * 6, p.y + (Math.random() - 0.5) * 6);
        this.tmp.set(w.x, 0.3, w.z);
        this.effects.explode(this.tmp, this.dist > UNIT_VIS_DIST ? 1.6 : 0.8);
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
      if (e.type === 'sectorWon') {
        // Victory burst across the captured territory.
        const tid = this.board.conquest[e.sector];
        const t = this.board.territories.find(q => q.id === tid);
        if (t) {
          for (let i = 0; i < 8; i++) {
            const w = gridToWorld(t.cx + (Math.random() - 0.5) * 30, t.cy + (Math.random() - 0.5) * 30);
            this.tmp.set(w.x, 0.4, w.z);
            this.effects.explode(this.tmp, 1.4 + Math.random());
          }
        }
      }
    }

    this.effects.update(dt);

    // Camera: idle eases home to the contested front.
    if (time - this.lastTouch > 8) {
      const home = this.contestedCenter(gs);
      this.focus.x += (home.x - this.focus.x) * Math.min(1, dt * 0.8);
      this.focus.y += (home.z - this.focus.y) * Math.min(1, dt * 0.8);
      if (this.dist > 100) this.dist += (78 - this.dist) * Math.min(1, dt * 0.5);
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

  private updatePieces(gs: GameState, pts: { x: number; y: number }[], dt: number): void {
    const show = this.dist < UNIT_VIS_DIST && pts.length > 0;
    // Desired piece counts: sqrt-scaled armies, capped for phone perf, and
    // squeezed down when the seam shrinks to a small pocket.
    const room = show ? clamp(pts.length / 55, 0.3, 1) : 0;
    const want: { friendly: boolean; line: number }[] = [];
    if (show) {
      const caps = [34, 12, 8, 12, 6, 3, 4, 0];
      for (let i = 0; i < LINES.length; i++) {
        const n = Math.round(Math.min(caps[i], Math.sqrt(gs.lines[i].army) * (i === 0 ? 1.6 : 0.8)) * room);
        for (let k = 0; k < n; k++) want.push({ friendly: true, line: i });
      }
      const A = adversaryStrength(gs.sector);
      const en = Math.round(Math.min(48, 5 * Math.pow(A, 0.24)) * room);
      for (let k = 0; k < en; k++) want.push({ friendly: false, line: k % ENEMY_MODELS.length });
    }

    // Rebuild piece set when composition or loaded models change.
    if (want.length !== this.pieces.length || this.piecesVersion !== this.modelsVersion) {
      this.piecesVersion = this.modelsVersion;
      for (const p of this.pieces) this.scene.remove(p.mesh);
      this.pieces = [];
      let fi = 0, ei = 0;
      for (let i = 0; i < want.length; i++) {
        const w = want[i];
        const name = w.friendly ? FRIENDLY_MODELS[w.line] : ENEMY_MODELS[w.line];
        const mesh = name ? this.tinted(name, w.friendly) : this.fallbackPiece(w.friendly);
        // Blob shadow for ground pieces (flyers cast none — cheaper and cleaner).
        const flies = w.friendly ? (w.line === 2 || w.line === 5) : w.line === 2;
        if (!flies) {
          const sh = new THREE.Mesh(this.shadowGeo, this.shadowMat);
          sh.rotation.x = -Math.PI / 2;
          sh.position.y = 0.06;
          mesh.add(sh);
        }
        this.scene.add(mesh);
        this.pieces.push({
          mesh, slot: i, ord: w.friendly ? fi++ : ei++, friendly: w.friendly, line: w.line,
          x: 0, z: 0, tx: 0, tz: 0, phase: Math.random() * Math.PI * 2
        });
        this.assignSlot(this.pieces[i], pts, gs, true);
      }
    }

    // March pieces toward their formation slots along the seam.
    for (const p of this.pieces) {
      this.assignSlot(p, pts, gs, false);
      const dx = p.tx - p.x, dz = p.tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        // Far-off pieces redeploy at double time (post-capture advances).
        const hustle = d > 14 ? 4 : 1;
        const step = Math.min(d, dt * 2.4 * hustle);
        p.x += dx / d * step;
        p.z += dz / d * step;
        p.mesh.rotation.y = Math.atan2(dx, dz);
      }
      const fly = p.friendly ? (p.line === 2 || p.line === 5) : p.line === 2;
      const alt = !fly ? 0 : p.friendly && p.line === 2 ? 2.4 : p.friendly ? 3.0 : 1.5;
      const bob = fly ? alt + Math.sin(this.time * 2 + p.phase) * 0.25 : 0;
      p.mesh.position.set(p.x, bob, p.z);
      // Board-game readability: pieces grow a little as the camera rises.
      p.mesh.scale.setScalar(clamp(this.dist / 24, 1, 2.1));
    }
  }

  private assignSlot(p: Piece, pts: { x: number; y: number }[], gs: GameState, snap: boolean): void {
    if (pts.length === 0) return;
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
    const field = depthField(this.board, gs.sector);
    if (field) {
      const k0 = Math.round(anchor.y) * GRID_W + Math.round(anchor.x);
      const k1 = Math.round(anchor.y + ny * 5) * GRID_W + Math.round(anchor.x + nx * 5);
      const d0 = field[k0] ?? 0;
      const d1 = k1 >= 0 && k1 < field.length ? field[k1] : -1;
      if (d1 < d0) { nx = -nx; ny = -ny; } // make (nx,ny) point into enemy ground
    }
    const sign = p.friendly ? -1 : 1;
    const standoff = (4 + wrapRank * 2.6) * sign;
    const jx = ((p.slot * 37) % 7 - 3) * 0.5;
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
