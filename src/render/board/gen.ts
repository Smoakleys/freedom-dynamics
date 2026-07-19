// Living War world generation: a continent tiled with NATIONS, each a cluster
// of territories. No linear conquest order — fronts emerge wherever owned land
// borders enemy land. Geometry on a coarse grid; painting upscales later.

import { mulberry32 } from '../rng';

export const GRID_W = 360;
export const GRID_H = 720;
export const BOARD_W = 120;
export const BOARD_H = 240;

const NATION_COUNT = 9;
const TERR_SEEDS = 78;

export interface Nation {
  id: number;
  name: string;
  color: { h: number; s: number; l: number };  // enemy palette family
  adversaryName: string;
  territories: number[];
}

export interface Territory {
  id: number;
  nation: number;
  cx: number; cy: number;
  name: string;
  neighbors: Set<number>;
  strength: number;          // garrison power this territory starts with
}

export interface Board {
  labels: Int16Array;
  territories: Territory[];
  nations: Nation[];
  homeNation: number;
  seed: number;
  // Cache: attack-depth fields keyed by territory id + owned-set stamp.
  depthFields: Map<string, Float32Array>;
}

const NATION_FIRST = ['Vel', 'Kor', 'Zar', 'Bel', 'Dra', 'Nov', 'Ost', 'Gal', 'Mar', 'Tyr', 'Ulm', 'Vor'];
const NATION_SECOND = ['grad', 'istan', 'ovia', 'land', 'mark', 'burg', 'onia', 'aria', 'esk', 'heim', 'stan', 'ia'];
const ADV_BRANDS = ['People\'s Front', 'Provisional Authority', 'Liberation Committee', 'Sovereign Guard', 'National Directorate', 'Defense League', 'Unity Junta', 'Continuity Government', 'Patriotic Syndicate'];

const TERR_ADJ = ['Copper', 'Rust', 'Bleak', 'Powder', 'Glass', 'Static', 'Iron', 'Cinder', 'Mirror', 'Grim', 'Hollow', 'Broken', 'Silent', 'Red', 'Dust', 'Granite', 'Ash', 'Salt', 'Thorn', 'Pale'];
const TERR_NOUN = ['Gulch', 'Flats', 'Ridge', 'Basin', 'Valley', 'Fork', 'Pass', 'Hills', 'Barrens', 'Crossing', 'Steppe', 'Reach', 'Hollows', 'Plateau', 'Marsh', 'Divide', 'Fields', 'Shelf', 'Spur', 'Wastes'];
const TERR_TYPE = ['', '', '', ' Refinery', ' Junction', ' Depot', ' Exclusion Zone', ' Testing Range', ' Logistics Hub', ' Tax Haven', ' Free Port', ' Dam'];

function idx(x: number, y: number): number { return y * GRID_W + x; }

export function generateBoard(worldSeed: number): Board {
  const seed = 1776 + worldSeed * 7919;
  const rand = mulberry32(seed);

  // Hash value-noise, unbounded domain.
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

  // Continent mask.
  const cx = GRID_W / 2, cy = GRID_H / 2;
  const isLand = (x: number, y: number): boolean => {
    const nx = (x - cx) / (GRID_W * 0.44);
    const ny = (y - cy) / (GRID_H * 0.46);
    const r = Math.sqrt(nx * nx + ny * ny);
    const wob = (vnoise(x / 52, y / 52) - 0.5) * 0.34 + (vnoise(x / 16 + 90, y / 16) - 0.5) * 0.1;
    return r < 0.94 + wob;
  };

  // Territory seeds (spaced), then nation seeds from a subset spread.
  const pts: { x: number; y: number }[] = [];
  let guard = 0;
  while (pts.length < TERR_SEEDS && guard++ < 8000) {
    const p = { x: 20 + rand() * (GRID_W - 40), y: 20 + rand() * (GRID_H - 40) };
    if (pts.every(q => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 > 44 ** 2)) pts.push(p);
  }
  const natSeeds: { x: number; y: number }[] = [];
  guard = 0;
  while (natSeeds.length < NATION_COUNT && guard++ < 6000) {
    const p = { x: 40 + rand() * (GRID_W - 80), y: 40 + rand() * (GRID_H - 80) };
    if (natSeeds.every(q => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 > 130 ** 2)) natSeeds.push(p);
  }

  // Organic Voronoi over territory seeds.
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

  // Areas, centroids, adjacency; drop slivers.
  const areas = new Array(pts.length).fill(0);
  const sx = new Array(pts.length).fill(0);
  const sy = new Array(pts.length).fill(0);
  const nbrs: Set<number>[] = pts.map(() => new Set<number>());
  for (let y = 1; y < GRID_H; y++) {
    for (let x = 1; x < GRID_W; x++) {
      const l = labels[idx(x, y)];
      if (l < 0) continue;
      areas[l]++; sx[l] += x; sy[l] += y;
      const ll = labels[idx(x - 1, y)], lu = labels[idx(x, y - 1)];
      if (ll >= 0 && ll !== l) { nbrs[l].add(ll); nbrs[ll].add(l); }
      if (lu >= 0 && lu !== l) { nbrs[l].add(lu); nbrs[lu].add(l); }
    }
  }
  const valid = new Set<number>();
  for (let i = 0; i < pts.length; i++) if (areas[i] > 800) valid.add(i);
  for (let k = 0; k < labels.length; k++) {
    if (labels[k] >= 0 && !valid.has(labels[k])) labels[k] = -1;
  }

  // Assign territories to nearest nation seed → nation clusters.
  const territories: Territory[] = [];
  for (const i of valid) {
    const tcx = sx[i] / areas[i], tcy = sy[i] / areas[i];
    let nb = 0, nbd = Infinity;
    for (let n = 0; n < natSeeds.length; n++) {
      const d = (natSeeds[n].x - tcx) ** 2 + (natSeeds[n].y - tcy) ** 2;
      if (d < nbd) { nbd = d; nb = n; }
    }
    const s = i * 31 + worldSeed * 977;
    const pick = <T,>(arr: T[], salt: number): T =>
      arr[Math.abs(Math.imul((s + salt) ^ 0x9e3779b9, 0x85ebca6b)) % arr.length];
    territories.push({
      id: i, nation: nb,
      cx: tcx, cy: tcy,
      name: `${pick(TERR_ADJ, 0)} ${pick(TERR_NOUN, 7)}${pick(TERR_TYPE, 13)}`,
      neighbors: new Set([...nbrs[i]].filter(n => valid.has(n))),
      strength: 0
    });
  }

  // Home nation: southernmost nation that has a real starter cluster (≥4
  // territories) — a two-territory homeland makes a feeble empire.
  const natCount = new Map<number, number>();
  const natY = new Map<number, number>();
  for (const t of territories) {
    natCount.set(t.nation, (natCount.get(t.nation) ?? 0) + 1);
    natY.set(t.nation, Math.max(natY.get(t.nation) ?? 0, t.cy));
  }
  const ranked = [...natCount.keys()].sort((a, b) => (natY.get(b)! - natY.get(a)!));
  const homeNation = ranked.find(n => (natCount.get(n) ?? 0) >= 4) ?? ranked[0];

  // Nation records + garrison strengths (scale with graph distance from home).
  const nations: Nation[] = [];
  for (let n = 0; n < natSeeds.length; n++) {
    const terrs = territories.filter(t => t.nation === n).map(t => t.id);
    const r2 = mulberry32(seed + n * 101);
    // Strictly COLD hue bands so enemy nations never drift toward the
    // empire's gold — ownership must be glanceable (reviewer round 1).
    const COLD_HUES = [210, 185, 250, 155, 285, 225, 130, 320, 200];
    nations.push({
      id: n,
      name: n === homeNation ? 'THE HOMELAND'
        : NATION_FIRST[Math.floor(r2() * NATION_FIRST.length)] + NATION_SECOND[Math.floor(r2() * NATION_SECOND.length)],
      color: { h: COLD_HUES[n % COLD_HUES.length] + (r2() - 0.5) * 14, s: 12 + r2() * 10, l: 40 + r2() * 10 },
      adversaryName: ADV_BRANDS[n % ADV_BRANDS.length],
      territories: terrs
    });
  }

  // Graph-distance from home territories → garrison strength tiers.
  const byId = new Map(territories.map(t => [t.id, t]));
  const dist = new Map<number, number>();
  const q: number[] = [];
  for (const t of territories) if (t.nation === homeNation) { dist.set(t.id, 0); q.push(t.id); }
  let head = 0;
  while (head < q.length) {
    const id = q[head++];
    const d = dist.get(id)!;
    for (const nb of byId.get(id)!.neighbors) {
      if (!dist.has(nb)) { dist.set(nb, d + 1); q.push(nb); }
    }
  }
  for (const t of territories) {
    const d = dist.get(t.id) ?? 8;
    // Steep exponential per ring — the walls must keep pace with an idle
    // economy that multiplies. Ring 1 ≈ 30, ring 4 ≈ 40k, ring 6 ≈ 4.8M,
    // ring 8 ≈ 585M — the far continent is a WEEKS-long campaign.
    t.strength = t.nation === homeNation ? 0 : 30 * Math.pow(11, d - 1);
  }

  return { labels, territories, nations, homeNation, seed, depthFields: new Map() };
}

export function labelAt(board: Board, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return -1;
  return board.labels[Math.floor(y) * GRID_W + Math.floor(x)];
}

// Depth field for attacking `tid` from the owned set: 0 at the shared border,
// 1 at the far side. Cached until ownership changes (bump `stamp`).
export function depthField(board: Board, tid: number, owned: Set<number>, stamp: number): Float32Array | null {
  const key = `${tid}|${stamp}`;
  const hit = board.depthFields.get(key);
  if (hit) return hit;

  const field = new Float32Array(GRID_W * GRID_H).fill(-1);
  const queue: number[] = [];
  for (let y = 1; y < GRID_H - 1; y++) {
    for (let x = 1; x < GRID_W - 1; x++) {
      const k = idx(x, y);
      if (board.labels[k] !== tid) continue;
      const touch = [board.labels[k - 1], board.labels[k + 1], board.labels[k - GRID_W], board.labels[k + GRID_W]]
        .some(l => l >= 0 && owned.has(l));
      if (touch) { field[k] = 0; queue.push(k); }
    }
  }
  if (queue.length === 0) return null;
  let head = 0, maxD = 1;
  while (head < queue.length) {
    const k = queue[head++];
    const x = k % GRID_W, y = Math.floor(k / GRID_W);
    const d = field[k];
    maxD = Math.max(maxD, d);
    for (const nk of [k - 1, k + 1, k - GRID_W, k + GRID_W]) {
      if (nk < 0 || nk >= field.length) continue;
      const nx2 = nk % GRID_W;
      if (Math.abs(nx2 - x) > 1) continue;
      if (board.labels[nk] !== tid || field[nk] >= 0) continue;
      field[nk] = d + 1;
      queue.push(nk);
    }
    void y;
  }
  for (let k = 0; k < field.length; k++) if (field[k] > 0) field[k] /= maxD;
  if (board.depthFields.size > 24) board.depthFields.clear();
  board.depthFields.set(key, field);
  return field;
}

// Ordered polyline along the capture progress iso-line inside `tid`.
export function frontLine(board: Board, tid: number, owned: Set<number>, stamp: number, progress: number): { x: number; y: number }[] {
  const field = depthField(board, tid, owned, stamp);
  if (!field) return [];
  const f = Math.min(0.86, Math.max(0.1, progress));
  const raw: { x: number; y: number }[] = [];
  for (let y = 1; y < GRID_H - 1; y += 2) {
    for (let x = 1; x < GRID_W - 1; x += 2) {
      const k = idx(x, y);
      if (board.labels[k] !== tid) continue;
      const d = field[k];
      if (d >= 0 && Math.abs(d - f) < 0.045) raw.push({ x, y });
    }
  }
  if (raw.length < 2) return raw;
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
    if (best < 0 || bd > 30 * 30) break;
    used[best] = true;
    out.push(raw[best]);
    cur = best;
  }
  return out;
}

export function gridToWorld(gx: number, gy: number): { x: number; z: number } {
  return { x: (gx / GRID_W - 0.5) * BOARD_W, z: (gy / GRID_H - 0.5) * BOARD_H };
}
