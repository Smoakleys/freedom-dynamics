// Low-poly unit geometry built from colored primitives merged into single
// BufferGeometries — one draw call per unit type via InstancedMesh.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function paint(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const count = geo.getAttribute('position').count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return paint(g, color);
}

function cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, color: number, rotZ = 0, rotX = 0, seg = 6): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  if (rotZ) g.rotateZ(rotZ);
  if (rotX) g.rotateX(rotX);
  g.translate(x, y, z);
  return paint(g, color);
}

export interface Palette {
  body: number;    // hull / fatigues
  dark: number;    // tracks / wheels / gear
  accent: number;  // livery stripe (corporate brand vs adversary gray-red)
  skin: number;
}

export const FRIENDLY: Palette = { body: 0x3b4a5a, dark: 0x232a33, accent: 0xd8a531, skin: 0xc9a184 };
export const ENEMY: Palette = { body: 0x555352, dark: 0x33312f, accent: 0x8a2f2b, skin: 0xb59f8e };

// Facing: all units built facing +X (toward the enemy for friendlies; enemy
// instances get rotated 180°).

export function infantry(p: Palette): THREE.BufferGeometry {
  return mergeGeometries([
    box(0.22, 0.42, 0.3, 0, 0.36, 0, p.body),               // torso
    box(0.16, 0.16, 0.16, 0, 0.66, 0, p.skin),              // head
    box(0.2, 0.07, 0.2, 0, 0.76, 0, p.accent),              // helmet band
    box(0.24, 0.1, 0.24, 0, 0.72, 0, p.dark),               // helmet
    box(0.09, 0.3, 0.1, -0.07, 0.13, -0.07, p.dark),        // legs
    box(0.09, 0.3, 0.1, -0.07, 0.13, 0.07, p.dark),
    box(0.42, 0.05, 0.05, 0.14, 0.5, 0.1, 0x2a2a2a)         // rifle
  ])!;
}

export function truck(p: Palette): THREE.BufferGeometry {
  return mergeGeometries([
    box(1.5, 0.42, 0.8, 0, 0.5, 0, p.body),                 // bed
    box(0.55, 0.42, 0.78, 0.62, 0.82, 0, p.body),           // cab
    box(0.5, 0.1, 0.7, 0.62, 1.05, 0, p.dark),              // cab roof
    box(1.5, 0.1, 0.82, 0, 0.74, 0, p.accent),              // livery stripe
    cyl(0.2, 0.2, 0.14, -0.5, 0.2, 0.42, p.dark, Math.PI / 2, 0, 8),
    cyl(0.2, 0.2, 0.14, -0.5, 0.2, -0.42, p.dark, Math.PI / 2, 0, 8),
    cyl(0.2, 0.2, 0.14, 0.55, 0.2, 0.42, p.dark, Math.PI / 2, 0, 8),
    cyl(0.2, 0.2, 0.14, 0.55, 0.2, -0.42, p.dark, Math.PI / 2, 0, 8)
  ])!;
}

export function droneUnit(p: Palette): THREE.BufferGeometry {
  return mergeGeometries([
    box(0.34, 0.1, 0.34, 0, 0, 0, p.body),                  // core
    box(0.9, 0.04, 0.08, 0, 0, 0, p.dark),                  // arm X
    box(0.08, 0.04, 0.9, 0, 0, 0, p.dark),                  // arm Z
    cyl(0.16, 0.16, 0.02, 0.45, 0.05, 0, p.accent, 0, 0, 8),// rotors
    cyl(0.16, 0.16, 0.02, -0.45, 0.05, 0, p.accent, 0, 0, 8),
    cyl(0.16, 0.16, 0.02, 0, 0.05, 0.45, p.accent, 0, 0, 8),
    cyl(0.16, 0.16, 0.02, 0, 0.05, -0.45, p.accent, 0, 0, 8)
  ])!;
}

export function tank(p: Palette): THREE.BufferGeometry {
  return mergeGeometries([
    box(1.6, 0.35, 1.0, 0, 0.42, 0, p.body),                // hull
    box(1.7, 0.3, 0.28, 0, 0.22, 0.42, p.dark),             // tracks
    box(1.7, 0.3, 0.28, 0, 0.22, -0.42, p.dark),
    box(0.8, 0.3, 0.62, -0.08, 0.75, 0, p.body),            // turret
    box(0.8, 0.06, 0.64, -0.08, 0.93, 0, p.accent),         // livery top
    cyl(0.06, 0.08, 1.1, 0.6, 0.78, 0, p.dark, Math.PI / 2, 0, 6) // barrel
  ])!;
}

export function howitzer(p: Palette): THREE.BufferGeometry {
  return mergeGeometries([
    box(1.0, 0.25, 0.9, 0, 0.3, 0, p.body),                 // carriage
    cyl(0.22, 0.22, 0.16, -0.2, 0.28, 0.42, p.dark, Math.PI / 2, 0, 8),
    cyl(0.22, 0.22, 0.16, -0.2, 0.28, -0.42, p.dark, Math.PI / 2, 0, 8),
    box(0.4, 0.3, 0.4, -0.1, 0.55, 0, p.dark),              // mount
    cyl(0.07, 0.1, 1.6, 0.55, 0.95, 0, p.body, Math.PI / 2 - 0.5, 0, 6), // elevated barrel
    box(0.5, 0.08, 0.5, -0.1, 0.72, 0, p.accent)
  ])!;
}

export function jet(p: Palette): THREE.BufferGeometry {
  return mergeGeometries([
    box(1.6, 0.22, 0.3, 0, 0, 0, p.body),                   // fuselage
    box(0.5, 0.08, 1.7, -0.1, 0, 0, p.body),                // wings
    box(0.5, 0.08, 0.5, -0.7, 0.12, 0, p.dark),             // tail
    box(0.3, 0.3, 0.08, -0.7, 0.2, 0, p.dark),              // fin
    box(0.44, 0.1, 0.34, 0.35, 0.1, 0, 0x8fc7e8),           // canopy
    box(0.52, 0.09, 1.72, -0.1, 0.01, 0, p.accent)          // livery underside
  ])!;
}

export function balloon(p: Palette): THREE.BufferGeometry {
  // The Adversary's finest: a menacing weather balloon.
  const sphere = new THREE.SphereGeometry(0.42, 8, 6);
  sphere.translate(0, 1.15, 0);
  return mergeGeometries([
    paint(sphere, 0xb9b09a),
    box(0.05, 0.9, 0.05, 0, 0.42, 0, p.dark),               // tether
    box(0.26, 0.2, 0.26, 0, 0.1, 0, p.accent)               // payload box
  ])!;
}

export function factoryBuilding(accent: number, big: number): THREE.BufferGeometry {
  const s = 1 + big * 0.25;
  return mergeGeometries([
    box(1.6 * s, 1.0 * s, 1.4 * s, 0, 0.5 * s, 0, 0x8e9299),
    box(1.7 * s, 0.16 * s, 1.5 * s, 0, 1.05 * s, 0, 0x6d7178),      // roof
    cyl(0.14 * s, 0.18 * s, 0.9 * s, 0.5 * s, 1.4 * s, -0.35 * s, 0xb9bec4, 0, 0, 6), // chimney
    box(0.5 * s, 0.5 * s, 0.06, 0, 0.35 * s, 0.71 * s, 0x3a3f45),   // door
    box(1.6 * s, 0.2 * s, 1.44 * s, 0, 0.86 * s, 0, accent)          // brand band
  ])!;
}

export function tree(): THREE.BufferGeometry {
  return mergeGeometries([
    cyl(0.08, 0.12, 0.5, 0, 0.25, 0, 0x6b4a2f, 0, 0, 5),
    paint(translated(new THREE.ConeGeometry(0.55, 1.1, 6), 0, 1.0, 0), 0x3e6b35),
    paint(translated(new THREE.ConeGeometry(0.4, 0.8, 6), 0, 1.55, 0), 0x4a7c3f)
  ])!;
}

export function house(): THREE.BufferGeometry {
  const roof = new THREE.ConeGeometry(0.9, 0.6, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(0, 1.05, 0);
  return mergeGeometries([
    box(1.1, 0.75, 1.1, 0, 0.38, 0, 0xcfc4ae),
    paint(roof, 0x9c5b41)
  ])!;
}

function translated(g: THREE.BufferGeometry, x: number, y: number, z: number): THREE.BufferGeometry {
  g.translate(x, y, z);
  return g;
}
