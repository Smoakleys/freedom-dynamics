// The diorama: terrain, lighting, camera, factories, and the glue that turns
// sim state into a watchable war.

import * as THREE from 'three';
import { mulberry32 } from './rng';
import * as G from './geometry';
import { UnitField, frontToX, DEPTH_HALF } from './units';
import { Effects } from './effects';
import { LINES } from '../game/content';
import { adversaryStrength, armyPower } from '../game/battle';
import type { GameState, GameEvent } from '../game/state';

const WORLD_W = 84;   // x span
const WORLD_D = 46;   // z span

export class Battlefield {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private units: UnitField;
  private effects: Effects;
  private heights: (x: number, z: number) => number;
  private factories: { mesh: THREE.Mesh; shown: boolean; scale: number }[] = [];
  private scorch: THREE.Mesh;
  private displayFrontX = frontToX(0.15);
  private inited = false;
  private tracerAcc = 0;
  private shellAcc = 0;
  private orbitalAcc = 0;
  private lastUnitsLost = 0;
  private enemyBoomAcc = 0;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x9fc3dc);
    this.scene.fog = new THREE.Fog(0xb8d0dd, 55, 105);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 220);

    const hemi = new THREE.HemisphereLight(0xcfe4f2, 0x8f8465, 0.95);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.35);
    sun.position.set(-18, 32, 14);
    this.scene.add(sun);

    this.heights = this.buildTerrain();
    this.buildRoad();
    this.buildScenery();
    this.units = new UnitField(this.scene, this.heights);
    this.effects = new Effects(this.scene);

    // Scorched strip that tracks the front line.
    this.scorch = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 34),
      new THREE.MeshBasicMaterial({ color: 0x241c12, transparent: true, opacity: 0.38, depthWrite: false })
    );
    this.scorch.rotation.x = -Math.PI / 2;
    this.scorch.position.y = 0.08;
    this.scene.add(this.scorch);

    // One factory building per production line along the friendly edge.
    for (let i = 0; i < LINES.length; i++) {
      const geo = G.factoryBuilding(0xd8a531, i);
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
      const z = -DEPTH_HALF + 2 + i * ((DEPTH_HALF * 2 - 4) / (LINES.length - 1));
      mesh.position.set(-WORLD_W / 2 + 8, this.heights(-WORLD_W / 2 + 8, z), z);
      mesh.rotation.y = -Math.PI / 2;
      mesh.scale.setScalar(0.001);
      mesh.visible = false;
      this.scene.add(mesh);
      this.factories.push({ mesh, shown: false, scale: 0 });
    }

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  private buildTerrain(): (x: number, z: number) => number {
    const rand = mulberry32(1776);
    const GRID = 24;
    const cells: number[] = [];
    for (let i = 0; i < (GRID + 1) * (GRID + 1); i++) cells.push(rand());
    const noise = (u: number, v: number): number => {
      const gu = Math.min(Math.max(u, 0), 0.999) * GRID;
      const gv = Math.min(Math.max(v, 0), 0.999) * GRID;
      const iu = Math.floor(gu), iv = Math.floor(gv);
      const fu = gu - iu, fv = gv - iv;
      const s = (t: number) => t * t * (3 - 2 * t);
      const a = cells[iv * (GRID + 1) + iu], b = cells[iv * (GRID + 1) + iu + 1];
      const c = cells[(iv + 1) * (GRID + 1) + iu], d = cells[(iv + 1) * (GRID + 1) + iu + 1];
      return a + (b - a) * s(fu) + (c - a) * s(fv) + (a - b - c + d) * s(fu) * s(fv);
    };

    const heightAt = (x: number, z: number): number => {
      const u = (x + WORLD_W / 2) / WORLD_W;
      const v = (z + WORLD_D / 2) / WORLD_D;
      let h = (noise(u * 3 % 1, v * 3 % 1) * 0.65 + noise(u, v)) * 2.4 - 1.4;
      // Flatten the battle corridor and the factory apron.
      const corridor = Math.max(0, 1 - Math.abs(z) / 8);
      h *= 1 - corridor * 0.85;
      const apron = Math.max(0, 1 - (x + WORLD_W / 2) / 14);
      h *= 1 - apron * 0.7;
      return Math.max(h, -0.4);
    };

    const SEG_X = 84, SEG_Z = 46;
    const geo = new THREE.PlaneGeometry(WORLD_W, WORLD_D, SEG_X, SEG_Z);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const lush = new THREE.Color(0x6d9048);
    const arid = new THREE.Color(0xb3a069);
    const dirt = new THREE.Color(0x8a7a54);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      // Biome gradient: lush on your side, arid toward the Adversary.
      const t = (x + WORLD_W / 2) / WORLD_W;
      tmp.copy(lush).lerp(arid, Math.pow(t, 1.4));
      // Battle corridor is chewed-up dirt.
      const corridor = Math.max(0, 1 - Math.abs(z) / 6.5);
      tmp.lerp(dirt, corridor * 0.55);
      // Cheap AO: darken dips, lighten crests.
      const shade = 0.82 + Math.min(Math.max((h + 0.6) / 2.4, 0), 1) * 0.3;
      colors[i * 3] = tmp.r * shade;
      colors[i * 3 + 1] = tmp.g * shade;
      colors[i * 3 + 2] = tmp.b * shade;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(ground);
    return heightAt;
  }

  private buildRoad(): void {
    // A supply road running the length of the corridor, conforming to terrain.
    const SEG = 64;
    const geo = new THREE.PlaneGeometry(WORLD_W, 2.6, SEG, 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, this.heights(x, z) + 0.04);
    }
    geo.computeVertexNormals();
    const road = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x6d6357 }));
    this.scene.add(road);
  }

  private buildScenery(): void {
    const rand = mulberry32(2026);
    // Trees, kept off the corridor and the factory apron.
    const treeGeo = G.tree();
    const trees = new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), 120);
    const dummy = new THREE.Object3D();
    let placed = 0;
    let guard = 0;
    while (placed < 120 && guard++ < 2000) {
      const x = (rand() - 0.5) * (WORLD_W - 6);
      const z = (rand() - 0.5) * (WORLD_D - 4);
      if (Math.abs(z) < 8.5) continue;
      if (x < -WORLD_W / 2 + 12) continue;
      dummy.position.set(x, this.heights(x, z), z);
      dummy.scale.setScalar(0.7 + rand() * 0.9);
      dummy.rotation.y = rand() * Math.PI * 2;
      dummy.updateMatrix();
      trees.setMatrixAt(placed++, dummy.matrix);
    }
    trees.count = placed;
    this.scene.add(trees);

    // A few hamlets the war is presumably protecting.
    const houseGeo = G.house();
    const houses = new THREE.InstancedMesh(houseGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), 10);
    let hp = 0;
    guard = 0;
    while (hp < 10 && guard++ < 500) {
      const x = (rand() - 0.5) * (WORLD_W - 14);
      const z = (rand() > 0.5 ? 1 : -1) * (10 + rand() * 9);
      if (Math.abs(z) > WORLD_D / 2 - 2) continue;
      dummy.position.set(x, this.heights(x, z), z);
      dummy.scale.setScalar(0.9 + rand() * 0.5);
      dummy.rotation.y = rand() * Math.PI * 2;
      dummy.updateMatrix();
      houses.setMatrixAt(hp++, dummy.matrix);
    }
    houses.count = hp;
    this.scene.add(houses);
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
    const targetFrontX = frontToX(gs.front);
    if (!this.inited) { this.inited = true; this.displayFrontX = targetFrontX; }
    this.displayFrontX += (targetFrontX - this.displayFrontX) * Math.min(1, dt * 2.2);
    const fx = this.displayFrontX;

    // — Friendly force counts from army pools —
    const a = gs.lines.map(l => l.army);
    this.units.setDesired('f-infantry', 2.2 * Math.sqrt(a[0]));
    this.units.setDesired('f-truck', 1.1 * Math.sqrt(a[1]));
    this.units.setDesired('f-drone', 1.4 * Math.sqrt(a[2]));
    this.units.setDesired('f-tank', 1.0 * Math.sqrt(a[3]));
    this.units.setDesired('f-howitzer', 0.8 * Math.sqrt(a[4]));
    this.units.setDesired('f-jet', 0.6 * Math.sqrt(a[5]));

    // — Adversary composition scales (and mutates) with the day —
    const A = adversaryStrength(gs.day);
    const day = gs.day;
    this.units.setDesired('e-balloon', day <= 6 ? Math.max(0, 9 - day) : 0);
    this.units.setDesired('e-infantry', Math.min(140, 6 * Math.pow(A, 0.30)));
    this.units.setDesired('e-truck', day >= 3 ? Math.min(36, 1.1 * Math.pow(A, 0.26)) : 0);
    this.units.setDesired('e-tank', day >= 5 ? Math.min(36, 0.8 * Math.pow(A, 0.24)) : 0);

    this.units.update(dt, fx);
    this.scorch.position.x = fx;
    this.scorch.position.y = this.heights(fx, 0) + 0.08;

    // — Combat effects driven by sim intensity —
    const P = armyPower(gs);
    const engaged = Math.min(P, A);
    const hot = P > 0;
    if (hot) {
      const rate = Math.min(3 + Math.pow(engaged, 0.28), 16);
      this.tracerAcc += dt * rate;
      while (this.tracerAcc >= 1) {
        this.tracerAcc -= 1;
        const friendly = Math.random() < (P / (P + A)) * 0.9 + 0.05;
        if (this.units.samplePos(friendly, this.tmp)) {
          const spread = (Math.random() - 0.5) * 8;
          this.tmp2.set(fx + (friendly ? 1 : -1) * (1.5 + Math.random() * 3), 0.6, this.tmp.z * 0.4 + spread);
          this.effects.fireTracer(this.tmp, this.tmp2, friendly);
        }
      }
      // Your losses become small booms on your side of the line.
      const lost = gs.stats.unitsLost - this.lastUnitsLost;
      this.lastUnitsLost = gs.stats.unitsLost;
      const boomRate = Math.min(lost * 0.25, 5 * dt) + (Math.random() < dt * 1.5 ? 1 : 0);
      if (Math.random() < boomRate) {
        this.tmp.set(fx - 1.5 - Math.random() * 4, 0.3, (Math.random() - 0.5) * 14);
        this.tmp.y = this.heights(this.tmp.x, this.tmp.z) + 0.3;
        this.effects.explode(this.tmp, 0.8 + Math.random() * 0.6);
      }
      // Pushing forward chews up the Adversary's side.
      if (P > A) {
        this.enemyBoomAcc += dt * Math.min(1.5 + Math.pow(P / A, 0.5), 5);
        while (this.enemyBoomAcc >= 1) {
          this.enemyBoomAcc -= 1;
          this.tmp.set(fx + 1.5 + Math.random() * 5, 0.3, (Math.random() - 0.5) * 14);
          this.tmp.y = this.heights(this.tmp.x, this.tmp.z) + 0.3;
          this.effects.explode(this.tmp, 0.9 + Math.random() * 0.8);
        }
      }
      // Howitzer arcs.
      if (a[4] >= 1) {
        this.shellAcc += dt * Math.min(0.4 + Math.sqrt(a[4]) * 0.15, 1.6);
        while (this.shellAcc >= 1) {
          this.shellAcc -= 1;
          this.tmp.set(fx - 13 - Math.random() * 3, 1.2, (Math.random() - 0.5) * 16);
          this.tmp.y = this.heights(this.tmp.x, this.tmp.z) + 1.1;
          this.tmp2.set(fx + 3 + Math.random() * 6, 0.3, (Math.random() - 0.5) * 14);
          this.tmp2.y = this.heights(this.tmp2.x, this.tmp2.z) + 0.2;
          this.effects.fireShell(this.tmp, this.tmp2);
        }
      }
      // Orbital [REDACTED].
      if (a[7] >= 1) {
        this.orbitalAcc += dt;
        if (this.orbitalAcc > 7) {
          this.orbitalAcc = 0;
          this.tmp.set(fx + 4 + Math.random() * 5, 0, (Math.random() - 0.5) * 10);
          this.tmp.y = this.heights(this.tmp.x, this.tmp.z);
          this.effects.orbitalStrike(this.tmp);
        }
      }
    }

    // Day-won fireworks.
    for (const e of events) {
      if (e.type === 'dayWon') {
        for (let i = 0; i < 7; i++) {
          this.tmp.set(fx + 2 + Math.random() * 8, 0.4, (Math.random() - 0.5) * 16);
          this.tmp.y = this.heights(this.tmp.x, this.tmp.z) + 0.4;
          this.effects.explode(this.tmp, 1.2 + Math.random());
        }
      }
    }

    // Factory pop-in for owned lines.
    for (let i = 0; i < this.factories.length; i++) {
      const f = this.factories[i];
      const owned = gs.lines[i].owned > 0;
      if (owned && !f.shown) { f.shown = true; f.mesh.visible = true; }
      if (f.shown && f.scale < 1) {
        f.scale = Math.min(1, f.scale + dt * 2.5);
        const s = 1 - Math.pow(1 - f.scale, 3);
        f.mesh.scale.setScalar(Math.max(0.001, s));
      }
    }

    this.effects.update(dt);

    // — Camera: oblique diagonal view that tracks the front —
    const cx = fx * 0.55;
    const sway = Math.sin(time * 0.045) * 1.6;
    const sway2 = Math.cos(time * 0.032) * 1.0;
    this.camera.position.set(cx - 14 + sway2, 13, 24 + sway);
    this.camera.lookAt(cx + 6, 0, -3);

    this.renderer.render(this.scene, this.camera);
  }
}
