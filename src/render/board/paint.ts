// Bold Board painter: smooth vector contours for the strategic altitude.
// The texture stays deliberately quiet; zoom-dependent identity and battle
// detail live in BoardView so the map does not carry every scale at once.

import { Board, GRID_W, GRID_H } from './gen';

export const TEX_W = 2048;
export const TEX_H = 4096;
const SX = TEX_W / GRID_W;
const SY = TEX_H / GRID_H;
const K = TEX_W / 1440;

const SEA = '#10333d';
const EMPIRE = '#e8b526';
const CONTESTED = '#9b5673';
const INTERNAL = '#3d3540';
const NATIONAL = '#201e23';
const HATCH = 'rgba(255, 209, 79, 0.30)';
const JEWELS = ['#765287', '#347b60', '#437a9e', '#35766f', '#6c557f', '#4c7493'];

export interface PaintState {
  owned: Set<number>;
  contested: Set<number>;
  visibleNations: Set<number>;
  company: string;
}

interface Pt { x: number; y: number }
type Loops = Map<number, Pt[][]>;
interface ContourCache { territories: Loops; nations: Loops }
const contourCache = new WeakMap<Board, ContourCache>();

function key(x: number, y: number): string { return `${x},${y}`; }

// Trace the directed cell edges for every value in a label field, then chain
// them into closed loops. Rendering those loops with quadratic joins turns the
// old pixel-derived silhouette into shared, smooth vector boundaries.
function traceField(field: Int16Array): Loops {
  const byValue = new Map<number, [Pt, Pt][]>();
  const add = (v: number, a: Pt, b: Pt) => {
    if (v < 0) return;
    const list = byValue.get(v) ?? [];
    list.push([a, b]);
    byValue.set(v, list);
  };
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= GRID_W || y >= GRID_H ? -1 : field[y * GRID_W + x];

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const v = at(x, y);
      if (v < 0) continue;
      if (at(x, y - 1) !== v) add(v, { x, y }, { x: x + 1, y });
      if (at(x + 1, y) !== v) add(v, { x: x + 1, y }, { x: x + 1, y: y + 1 });
      if (at(x, y + 1) !== v) add(v, { x: x + 1, y: y + 1 }, { x, y: y + 1 });
      if (at(x - 1, y) !== v) add(v, { x, y: y + 1 }, { x, y });
    }
  }

  const out: Loops = new Map();
  for (const [value, edges] of byValue) {
    const starts = new Map<string, number[]>();
    edges.forEach((e, i) => {
      const k = key(e[0].x, e[0].y);
      const list = starts.get(k) ?? [];
      list.push(i);
      starts.set(k, list);
    });
    const used = new Uint8Array(edges.length);
    const loops: Pt[][] = [];
    for (let seed = 0; seed < edges.length; seed++) {
      if (used[seed]) continue;
      const loop: Pt[] = [];
      let edgeIndex = seed;
      const first = edges[seed][0];
      let guard = 0;
      while (!used[edgeIndex] && guard++ < edges.length + 4) {
        used[edgeIndex] = 1;
        const [a, b] = edges[edgeIndex];
        loop.push(a);
        if (b.x === first.x && b.y === first.y) break;
        const candidates = starts.get(key(b.x, b.y)) ?? [];
        const next = candidates.find(i => !used[i]);
        if (next === undefined) break;
        edgeIndex = next;
      }
      if (loop.length < 4) continue;
      // Remove collinear grid vertices before smoothing. This dramatically
      // reduces Path2D complexity while preserving the exact shared contour.
      const simple: Pt[] = [];
      for (let i = 0; i < loop.length; i++) {
        const a = loop[(i - 1 + loop.length) % loop.length];
        const b = loop[i];
        const c = loop[(i + 1) % loop.length];
        if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) continue;
        simple.push(b);
      }
      if (simple.length >= 4) loops.push(simple);
    }
    out.set(value, loops);
  }
  return out;
}

function contours(board: Board): ContourCache {
  const hit = contourCache.get(board);
  if (hit) return hit;
  const nationField = new Int16Array(board.labels.length).fill(-1);
  const nationByTerritory = new Map(board.territories.map(t => [t.id, t.nation]));
  for (let i = 0; i < board.labels.length; i++) {
    const tid = board.labels[i];
    nationField[i] = tid < 0 ? -1 : (nationByTerritory.get(tid) ?? -1);
  }
  const made = { territories: traceField(board.labels), nations: traceField(nationField) };
  contourCache.set(board, made);
  return made;
}

function pathFor(loops: Pt[][] | undefined): Path2D {
  const path = new Path2D();
  if (!loops) return path;
  for (const loop of loops) {
    if (loop.length < 3) continue;
    const p0 = loop[0], p1 = loop[1];
    path.moveTo((p0.x + p1.x) * 0.5 * SX, (p0.y + p1.y) * 0.5 * SY);
    for (let i = 1; i <= loop.length; i++) {
      const p = loop[i % loop.length];
      const n = loop[(i + 1) % loop.length];
      path.quadraticCurveTo(p.x * SX, p.y * SY, (p.x + n.x) * 0.5 * SX, (p.y + n.y) * 0.5 * SY);
    }
    path.closePath();
  }
  return path;
}

function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (shift: number) => Math.max(0, Math.min(255, ((n >> shift) & 255) + amount));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

function territoryFill(board: Board, st: PaintState, tid: number, nation: number): string {
  if (st.owned.has(tid)) return shade(EMPIRE, (tid % 3 - 1) * 3);
  if (st.contested.has(tid)) return CONTESTED;
  const base = JEWELS[(nation * 5 + 1) % JEWELS.length];
  return shade(base, (tid % 3 - 1) * 4);
}

export function paintBoard(canvas: HTMLCanvasElement, board: Board, st: PaintState): void {
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = SEA;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const cached = contours(board);
  const byId = new Map(board.territories.map(t => [t.id, t]));

  // Province plates: thin seams let the saturated color field do the work.
  for (const t of board.territories) {
    if (!st.visibleNations.has(t.nation)) continue; // true fog = open sea
    const path = pathFor(cached.territories.get(t.id));
    ctx.fillStyle = territoryFill(board, st, t.id, t.nation);
    ctx.fill(path);
    ctx.strokeStyle = INTERNAL;
    ctx.lineWidth = 1.15 * K;
    ctx.stroke(path);
  }

  // Nation/coast hierarchy: one decisive outline around each visible country.
  for (const n of board.nations) {
    if (!st.visibleNations.has(n.id) || n.territories.length === 0) continue;
    const path = pathFor(cached.nations.get(n.id));
    ctx.strokeStyle = NATIONAL;
    ctx.lineWidth = 4.4 * K;
    ctx.stroke(path);
  }

  // Contested remains part of the enemy palette but carries a restrained gold
  // field signal. The live Three.js seam supplies motion and precise progress.
  for (const tid of st.contested) {
    const t = byId.get(tid);
    if (!t || !st.visibleNations.has(t.nation)) continue;
    const path = pathFor(cached.territories.get(tid));
    ctx.save();
    ctx.clip(path);
    ctx.strokeStyle = HATCH;
    ctx.lineWidth = 1.45 * K;
    const cx = t.cx * SX, cy = t.cy * SY;
    const span = 95 * Math.max(SX, SY);
    for (let off = -span; off <= span; off += 25 * K) {
      ctx.beginPath();
      ctx.moveTo(cx - span + off, cy + span);
      ctx.lineTo(cx + span + off, cy - span);
      ctx.stroke();
    }
    ctx.restore();
  }
}
