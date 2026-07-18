// Board generation: seeded organic Voronoi territories on a portrait continent,
// plus the conquest order that maps the sim's linear sector chain onto the map.
// All geometry work happens on a coarse grid; painting upscales later.

import { mulberry32 } from '../rng';
import { sectorName } from '../../game/content';

export const GRID_W = 360;
export const GRID_H = 720;
// World units the board occupies in the 3D scene (portrait).
export const BOARD_W = 120;
export const BOARD_H = 240;

export interface Territory {
  id: number;
  cx: number; cy: number;        // centroid, grid coords
  name: string;
  order: number;                 // conquest order == sector index (-1 for HQ)
  neighbors: Set<number>;
}

export interface Board {
  labels: Int16Array;            // GRID_W*GRID_H, territory id or -1 for sea
  territories: Territory[];
  conquest: number[];            // conquest[sector] = territory id
  // Depth fields per territory, lazily built: 0 at the attack border, 1 at far side.
  depthFields: Map<number, Float32Array>;
  seed: number;
}

function idx(x: number, y: number): number { return y * GRID_W + x; }

export function generateBoard(fiscalYear: number): Board {
  const seed = 1776 + fiscalYear * 7919;
  const rand = mulberry32(seed);

  // Territory seed points, spaced by rejection sampling.
  const N = 30;
  const pts: { x: number; y: number }[] = [];
  let guard = 0;
  while (pts.length < N && guard++ < 4000) {
    const p = { x: 24 + rand() * (GRID_W - 48), y: 24 + rand() * (GRID_H - 48) };
    if (pts.every(q => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 > 72 ** 2)) pts.push(p);
  }

  // Hash-based value noise on an unbounded domain — no wrapping/clamping
  // seams (the v1 lattice sampler clamped coords and carved vertical cliffs).
  const nSeed = Math.floor(rand() * 1e6);
  const hash = (ix: number, iy: number): number => {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + nSeed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const vnoise = (x: number, y: number): number => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const s = (t: number) => t * t * (3 - 2 * t);
    const a = hash(ix, iy), b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy);
  };

  // Continent mask: tall blobby landmass, gently irregular coast.
  const cx = GRID_W / 2, cy = GRID_H / 2;
  const isLand = (x: number, y: number): boolean => {
    const nx = (x - cx) / (GRID_W * 0.44);
    const ny = (y - cy) / (GRID_H * 0.46);
    const r = Math.sqrt(nx * nx + ny * ny);
    const wob = (vnoise(x / 52, y / 52) - 0.5) * 0.34 + (vnoise(x / 16 + 90, y / 16) - 0.5) * 0.1;
    return r < 0.9 + wob;
  };

  // Organic Voronoi: distance perturbed by noise so borders wander.
  const labels = new Int16Array(GRID_W * GRID_H).fill(-1);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (!isLand(x, y)) continue;
      const wx = x + (vnoise(x / 15 + 400, y / 15) - 0.5) * 26;
      const wy = y + (vnoise(x / 15, y / 15 + 700) - 0.5) * 26;
      let best = -1, bd = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const d = (pts[i].x - wx) ** 2 + (pts[i].y - wy) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      labels[idx(x, y)] = best;
    }
  }

  // Centroids, areas, adjacency.
  const areas = new Array(pts.length).fill(0);
  const sx = new Array(pts.length).fill(0);
  const sy = new Array(pts.length).fill(0);
  const nbrs: Set<number>[] = pts.map(() => new Set<number>());
  for (let y = 1; y < GRID_H; y++) {
    for (let x = 1; x < GRID_W; x++) {
      const l = labels[idx(x, y)];
      if (l < 0) continue;
      areas[l]++; sx[l] += x; sy[l] += y;
      const l2 = labels[idx(x - 1, y)], l3 = labels[idx(x, y - 1)];
      if (l2 >= 0 && l2 !== l) { nbrs[l].add(l2); nbrs[l2].add(l); }
      if (l3 >= 0 && l3 !== l) { nbrs[l].add(l3); nbrs[l3].add(l); }
    }
  }

  // Drop slivers (reassign to sea) — tiny territories read as noise.
  const valid: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (areas[i] > 1400) valid.push(i);
  }
  for (let k = 0; k < labels.length; k++) {
    if (labels[k] >= 0 && !valid.includes(labels[k])) labels[k] = -1;
  }

  const territories: Territory[] = valid.map(i => ({
    id: i,
    cx: sx[i] / areas[i],
    cy: sy[i] / areas[i],
    name: '',
    order: -2,
    neighbors: new Set([...nbrs[i]].filter(n => valid.includes(n)))
  }));
  const byId = new Map(territories.map(t => [t.id, t]));

  // Conquest order: start from the bottom-most territory (HQ, order -1 = owned
  // from the start), then Prim-walk: always take the unconquered neighbor of the
  // conquered set closest to the conquered frontier — gold spreads organically.
  const start = territories.reduce((a, b) => (b.cy > a.cy ? b : a));
  start.order = -1;
  const conquered = new Set([start.id]);
  const conquest: number[] = [];
  while (conquered.size < territories.length) {
    let pick: Territory | null = null, bd = Infinity;
    for (const t of territories) {
      if (conquered.has(t.id)) continue;
      let touches = false, dmin = Infinity;
      for (const n of t.neighbors) {
        if (conquered.has(n)) {
          touches = true;
          const nt = byId.get(n)!;
          dmin = Math.min(dmin, (nt.cx - t.cx) ** 2 + (nt.cy - t.cy) ** 2);
        }
      }
      // Prefer touching territories; among them, southernmost-ish first.
      const score = touches ? dmin - t.cy * 40 : 1e12 + (t.cy - GRID_H) ** 2;
      if (score < bd) { bd = score; pick = t; }
    }
    if (!pick) break;
    pick.order = conquest.length;
    conquest.push(pick.id);
    conquered.add(pick.id);
  }

  for (const t of territories) {
    t.name = t.order === -1 ? 'HQ' : sectorName(t.order, fiscalYear);
  }

  return { labels, territories, conquest, depthFields: new Map(), seed };
}

// Depth field for the contested territory: BFS from its border with already-
// conquered land. 0 at the attack border, 1 at the far edge. Drives the seam
// position (iso-line at front%) and where the battle band sits.
export function depthField(board: Board, sector: number): Float32Array | null {
  const cached = board.depthFields.get(sector);
  if (cached) return cached;
  if (sector >= board.conquest.length) return null;
  const tid = board.conquest[sector];
  const ownedSet = new Set<number>(board.conquest.slice(0, sector));
  ownedSet.add(board.territories.find(t => t.order === -1)!.id);

  const field = new Float32Array(GRID_W * GRID_H).fill(-1);
  const queue: number[] = [];
  for (let y = 1; y < GRID_H - 1; y++) {
    for (let x = 1; x < GRID_W - 1; x++) {
      const k = idx(x, y);
      if (board.labels[k] !== tid) continue;
      const touchOwned = [labelAt(board, x - 1, y), labelAt(board, x + 1, y), labelAt(board, x, y - 1), labelAt(board, x, y + 1)]
        .some(l => l >= 0 && ownedSet.has(l));
      if (touchOwned) { field[k] = 0; queue.push(k); }
    }
  }
  // No shared border (shouldn't happen with Prim order) — fall back to south edge.
  if (queue.length === 0) {
    let maxY = 0;
    for (let y = 1; y < GRID_H - 1; y++) for (let x = 1; x < GRID_W - 1; x++) {
      if (board.labels[idx(x, y)] === tid) maxY = Math.max(maxY, y);
    }
    for (let x = 1; x < GRID_W - 1; x++) {
      const k = idx(x, maxY);
      if (board.labels[k] === tid) { field[k] = 0; queue.push(k); }
    }
  }
  let head = 0, maxD = 1;
  while (head < queue.length) {
    const k = queue[head++];
    const x = k % GRID_W, y = Math.floor(k / GRID_W);
    const d = field[k];
    maxD = Math.max(maxD, d);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      const nk = idx(nx, ny);
      if (board.labels[nk] !== tid || field[nk] >= 0) continue;
      field[nk] = d + 1;
      queue.push(nk);
    }
  }
  for (let k = 0; k < field.length; k++) if (field[k] > 0) field[k] /= maxD;
  board.depthFields.set(sector, field);
  return field;
}

export function labelAt(board: Board, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return -1;
  return board.labels[idx(x, y)];
}

// Points along the current front iso-line, ordered into a polyline via
// nearest-neighbor chaining. Front display is clamped so the battle stays
// inside the territory even at 0% / 100%.
export function frontLine(board: Board, sector: number, front: number): { x: number; y: number }[] {
  const field = depthField(board, sector);
  if (!field) return [];
  const f = Math.min(0.86, Math.max(0.12, front));
  const tid = board.conquest[sector];
  const raw: { x: number; y: number }[] = [];
  for (let y = 1; y < GRID_H - 1; y += 2) {
    for (let x = 1; x < GRID_W - 1; x += 2) {
      const k = idx(x, y);
      if (board.labels[k] !== tid) continue;
      const d = field[k];
      if (d < 0) continue;
      if (Math.abs(d - f) < 0.04) raw.push({ x, y });
    }
  }
  if (raw.length < 2) return raw;
  // Chain: start at an extreme point, repeatedly hop to the nearest unused.
  let start = 0;
  for (let i = 1; i < raw.length; i++) if (raw[i].x < raw[start].x) start = i;
  const used = new Array(raw.length).fill(false);
  const out = [raw[start]];
  used[start] = true;
  let cur = start;
  for (let n = 1; n < raw.length; n++) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < raw.length; i++) {
      if (used[i]) continue;
      const d = (raw[i].x - raw[cur].x) ** 2 + (raw[i].y - raw[cur].y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0 || bd > 30 * 30) break; // gap — stop rather than scribble
    used[best] = true;
    out.push(raw[best]);
    cur = best;
  }
  return out;
}

export function gridToWorld(gx: number, gy: number): { x: number; z: number } {
  return {
    x: (gx / GRID_W - 0.5) * BOARD_W,
    z: (gy / GRID_H - 0.5) * BOARD_H
  };
}
