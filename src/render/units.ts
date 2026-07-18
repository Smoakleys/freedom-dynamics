// Instanced unit rendering + cosmetic movement. One InstancedMesh per unit
// type per faction; instance counts are driven by the sim's army pools.

import * as THREE from 'three';
import { mulberry32 } from './rng';
import * as G from './geometry';
import { FRIENDLY, ENEMY } from './geometry';

export const FIELD_HALF = 30;          // battlefield spans x in [-30, 30]
export const DEPTH_HALF = 15;          // formations spread z in [-15, 15]

export function frontToX(front: number): number {
  return -FIELD_HALF + front * FIELD_HALF * 2;
}

interface Slot {
  x: number; z: number;      // current position
  jz: number; jx: number;    // formation jitter
  phase: number;             // per-unit animation phase
  speed: number;
}

interface UnitGroup {
  mesh: THREE.InstancedMesh;
  slots: Slot[];
  desired: number;
  shown: number;
  warmed: boolean;
  friendly: boolean;
  kind: UnitKind;
  gap: number;               // distance held back from the front line
  rankDepth: number;         // spacing between ranks
  cols: number;
  flying: number;            // hover height (0 = ground)
  scale: number;
}

export type UnitKind = 'infantry' | 'truck' | 'drone' | 'tank' | 'howitzer' | 'jet' | 'balloon';

const CAPS: Record<UnitKind, number> = {
  infantry: 140, truck: 36, drone: 48, tank: 36, howitzer: 10, jet: 5, balloon: 8
};

const dummy = new THREE.Object3D();

export class UnitField {
  groups = new Map<string, UnitGroup>();
  private time = 0;

  constructor(private scene: THREE.Scene, private groundY: (x: number, z: number) => number) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mk = (key: string, geo: THREE.BufferGeometry, kind: UnitKind, friendly: boolean,
                gap: number, rankDepth: number, cols: number, flying: number, scale: number) => {
      const mesh = new THREE.InstancedMesh(geo, mat, CAPS[kind]);
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
      const rand = mulberry32(key.length * 7919 + kind.length * 131);
      const slots: Slot[] = [];
      for (let i = 0; i < CAPS[kind]; i++) {
        slots.push({
          x: (friendly ? -1 : 1) * (FIELD_HALF + 4),
          z: (rand() - 0.5) * DEPTH_HALF * 2,
          jz: (rand() - 0.5) * 1.2,
          jx: (rand() - 0.5) * 1.4,
          phase: rand() * Math.PI * 2,
          speed: 2.2 + rand() * 1.6
        });
      }
      this.groups.set(key, { mesh, slots, desired: 0, shown: 0, warmed: false, friendly, kind, gap, rankDepth, cols, flying, scale });
    };

    // Friendly forces (built facing +X).
    mk('f-infantry', G.infantry(FRIENDLY), 'infantry', true, 1.6, 0.9, 24, 0, 0.85);
    mk('f-truck', G.truck(FRIENDLY), 'truck', true, 7, 2.2, 9, 0, 1);
    mk('f-drone', G.droneUnit(FRIENDLY), 'drone', true, 0.5, 1.4, 12, 2.6, 0.9);
    mk('f-tank', G.tank(FRIENDLY), 'tank', true, 3.4, 2.4, 9, 0, 1);
    mk('f-howitzer', G.howitzer(FRIENDLY), 'howitzer', true, 13, 3.2, 5, 0, 1.1);
    mk('f-jet', G.jet(FRIENDLY), 'jet', true, -6, 4, 5, 9, 1.4);
    // Adversary forces.
    mk('e-balloon', G.balloon(ENEMY), 'balloon', false, 2.5, 2.4, 4, 0.6, 0.85);
    mk('e-infantry', G.infantry(ENEMY), 'infantry', false, 1.6, 0.9, 24, 0, 0.85);
    mk('e-truck', G.truck(ENEMY), 'truck', false, 6.4, 2.2, 8, 0, 1);
    mk('e-tank', G.tank(ENEMY), 'tank', false, 3.4, 2.4, 9, 0, 1);
  }

  setDesired(key: string, n: number): void {
    const g = this.groups.get(key);
    if (g) g.desired = Math.min(Math.max(0, Math.round(n)), g.slots.length);
  }

  // A random currently-visible unit position near the front (for tracer sources).
  samplePos(friendly: boolean, out: THREE.Vector3): boolean {
    const keys = [...this.groups.keys()].filter(k => this.groups.get(k)!.friendly === friendly && this.groups.get(k)!.shown > 0 && this.groups.get(k)!.kind !== 'jet');
    if (keys.length === 0) return false;
    const g = this.groups.get(keys[Math.floor(Math.random() * keys.length)])!;
    const s = g.slots[Math.floor(Math.random() * g.shown)];
    out.set(s.x, this.groundY(s.x, s.z) + 0.6 + g.flying, s.z);
    return true;
  }

  update(dt: number, frontX: number): void {
    this.time += dt;
    for (const g of this.groups.values()) {
      // Ramp shown toward desired — units arrive/withdraw over time, not pop.
      if (g.shown < g.desired) g.shown = Math.min(g.desired, g.shown + Math.max(1, Math.round(dt * 20)));
      else if (g.shown > g.desired) g.shown = Math.max(g.desired, g.shown - Math.max(1, Math.round(dt * 8)));

      // First frame after load: deploy straight into formation, no cross-map march.
      const snap = !g.warmed;
      if (snap) { g.warmed = true; g.shown = g.desired; }

      const dir = g.friendly ? 1 : -1;
      const baseX = frontX - dir * g.gap;
      for (let i = 0; i < g.shown; i++) {
        const s = g.slots[i];
        const col = i % g.cols;
        const row = Math.floor(i / g.cols);
        const tz = ((col + 0.5) / g.cols - 0.5) * DEPTH_HALF * 2 + s.jz;
        const tx = baseX - dir * row * g.rankDepth + s.jx;
        if (snap) { s.x = tx; s.z = tz; }
        // March toward formation slot; far-off units redeploy at double time.
        const dx = tx - s.x, dz = tz - s.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.05) {
          const hustle = dist > 20 ? 3 : 1;
          const step = Math.min(dist, s.speed * dt * hustle * (g.kind === 'jet' ? 6 : 1));
          s.x += (dx / dist) * step;
          s.z += (dz / dist) * step;
        }

        let y = this.groundY(s.x, s.z) + g.flying;
        let rotY = g.friendly ? 0 : Math.PI;
        let bob = 0;
        if (g.kind === 'drone' || g.kind === 'balloon') bob = Math.sin(this.time * 1.7 + s.phase) * 0.25;
        if (g.kind === 'infantry' && dist > 0.2) bob = Math.abs(Math.sin(this.time * 8 + s.phase)) * 0.06;
        if (g.kind === 'jet') {
          // Jets race lazy laps over friendly airspace, dipping toward the front.
          const lap = ((this.time * 0.12 + s.phase / (Math.PI * 2)) % 1);
          const sweep = Math.sin(lap * Math.PI * 2);
          s.x = frontX - 14 + sweep * 17;
          s.z = Math.cos(lap * Math.PI * 2) * (6 + s.jz * 4);
          y = 8 + Math.sin(this.time * 0.9 + s.phase) * 1.2;
          rotY = sweep >= 0 ? 0 : Math.PI;
        }

        dummy.position.set(s.x, y + bob, s.z);
        dummy.rotation.set(0, rotY, 0);
        dummy.scale.setScalar(g.scale);
        dummy.updateMatrix();
        g.mesh.setMatrixAt(i, dummy.matrix);
      }
      g.mesh.count = g.shown;
      g.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
