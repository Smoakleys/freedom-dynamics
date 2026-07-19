// Pooled combat effects: tracers, shell arcs, explosions, the orbital beam.

import * as THREE from 'three';

interface Tracer { active: boolean; from: THREE.Vector3; to: THREE.Vector3; t: number; speed: number; mesh: THREE.Mesh }
interface Shell { active: boolean; from: THREE.Vector3; to: THREE.Vector3; t: number; apex: number; mesh: THREE.Mesh }
interface Boom { active: boolean; t: number; dur: number; scale: number; fire: THREE.Mesh; smoke: THREE.Mesh }

export class Effects {
  private tracers: Tracer[] = [];
  private shells: Shell[] = [];
  private booms: Boom[] = [];
  private beam: THREE.Mesh;
  private beamT = 1e9;
  private flashes: { mesh: THREE.Mesh; t: number }[] = [];
  private waves: { mesh: THREE.Mesh; t: number; active: boolean; size: number }[] = [];

  constructor(private scene: THREE.Scene) {
    const tracerGeo = new THREE.BoxGeometry(0.9, 0.05, 0.05);
    const gold = new THREE.MeshBasicMaterial({ color: 0xffd77a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    const red = new THREE.MeshBasicMaterial({ color: 0xff7a5c, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 56; i++) {
      const mesh = new THREE.Mesh(tracerGeo, i % 2 === 0 ? gold : red);
      mesh.visible = false;
      scene.add(mesh);
      this.tracers.push({ active: false, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, speed: 2.2, mesh });
    }

    const shellGeo = new THREE.SphereGeometry(0.12, 6, 4);
    const shellMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(shellGeo, shellMat);
      mesh.visible = false;
      scene.add(mesh);
      this.shells.push({ active: false, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, apex: 6, mesh });
    }

    const fireGeo = new THREE.IcosahedronGeometry(0.6, 0);
    for (let i = 0; i < 26; i++) {
      const fire = new THREE.Mesh(fireGeo, new THREE.MeshBasicMaterial({ color: 0xff7a2e, transparent: true, opacity: 1, depthWrite: false }));
      const smoke = new THREE.Mesh(fireGeo, new THREE.MeshLambertMaterial({ color: 0x4a4642, transparent: true, opacity: 0.55 }));
      fire.visible = smoke.visible = false;
      scene.add(fire); scene.add(smoke);
      this.booms.push({ active: false, t: 0, dur: 0.55, scale: 1, fire, smoke });
    }

    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.9, 40, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff3c8, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    this.beam.visible = false;
    scene.add(this.beam);

    // Gold conquest waves: expanding flat rings for territory captures.
    const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xf2c14e, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      }));
      mesh.visible = false;
      scene.add(mesh);
      this.waves.push({ mesh, t: 0, active: false, size: 20 });
    }
  }

  // The Risk moment: a gold shockwave rolls across a captured territory.
  conquestWave(at: THREE.Vector3, size = 22): void {
    for (const w of this.waves) {
      if (w.active) continue;
      w.active = true; w.t = 0; w.size = size;
      w.mesh.position.set(at.x, 0.3, at.z);
      w.mesh.visible = true;
      return;
    }
  }

  fireTracer(from: THREE.Vector3, to: THREE.Vector3, friendly: boolean): void {
    // Even indices are gold (friendly), odd red (enemy) — find a matching free slot.
    for (let i = 0; i < this.tracers.length; i++) {
      const tr = this.tracers[i];
      if (tr.active || (i % 2 === 0) !== friendly) continue;
      tr.active = true; tr.t = 0;
      tr.from.copy(from); tr.to.copy(to);
      tr.speed = 1.6 + Math.random() * 0.8;
      tr.mesh.visible = true;
      return;
    }
  }

  fireShell(from: THREE.Vector3, to: THREE.Vector3): void {
    for (const s of this.shells) {
      if (s.active) continue;
      s.active = true; s.t = 0;
      s.from.copy(from); s.to.copy(to);
      s.apex = 5 + Math.random() * 4;
      s.mesh.visible = true;
      return;
    }
  }

  explode(at: THREE.Vector3, scale = 1): void {
    for (const b of this.booms) {
      if (b.active) continue;
      b.active = true; b.t = 0; b.scale = scale;
      b.fire.position.copy(at); b.smoke.position.copy(at);
      b.fire.visible = b.smoke.visible = true;
      return;
    }
  }

  orbitalStrike(at: THREE.Vector3): void {
    this.beam.position.set(at.x, 20, at.z);
    this.beam.visible = true;
    this.beamT = 0;
    this.explode(at, 2.6);
  }

  update(dt: number): void {
    for (const tr of this.tracers) {
      if (!tr.active) continue;
      tr.t += dt * tr.speed;
      if (tr.t >= 1) { tr.active = false; tr.mesh.visible = false; continue; }
      const p = tr.mesh.position.lerpVectors(tr.from, tr.to, tr.t);
      tr.mesh.lookAt(tr.to);
      tr.mesh.rotateY(Math.PI / 2);
      void p;
    }
    for (const s of this.shells) {
      if (!s.active) continue;
      s.t += dt * 0.9;
      if (s.t >= 1) {
        s.active = false; s.mesh.visible = false;
        this.explode(s.to, 1.5);
        continue;
      }
      const pos = s.mesh.position.lerpVectors(s.from, s.to, s.t);
      pos.y += Math.sin(s.t * Math.PI) * s.apex;
    }
    for (const b of this.booms) {
      if (!b.active) continue;
      b.t += dt;
      const k = b.t / b.dur;
      if (k >= 1.6) { b.active = false; b.fire.visible = b.smoke.visible = false; continue; }
      const fireK = Math.min(k, 1);
      b.fire.scale.setScalar((0.3 + fireK * 1.5) * b.scale);
      (b.fire.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - fireK);
      b.smoke.scale.setScalar((0.5 + k * 1.2) * b.scale);
      b.smoke.position.y += dt * 1.2;
      // Reach exactly zero by the 1.6 cutoff — lingering ghost hexes read as
      // stuck geometry (reviewer B2).
      (b.smoke.material as THREE.MeshLambertMaterial).opacity = Math.max(0, 0.5 * (1 - k / 1.6));
    }
    for (const w of this.waves) {
      if (!w.active) continue;
      w.t += dt / 1.1;
      if (w.t >= 1) { w.active = false; w.mesh.visible = false; continue; }
      const e = 1 - Math.pow(1 - w.t, 2.4);
      w.mesh.scale.setScalar(0.5 + e * w.size);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - w.t);
    }
    if (this.beam.visible) {
      this.beamT += dt;
      const mat = this.beam.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.85 - this.beamT * 1.4);
      this.beam.scale.x = this.beam.scale.z = 1 + this.beamT * 0.8;
      if (mat.opacity <= 0) this.beam.visible = false;
    }
  }
}
