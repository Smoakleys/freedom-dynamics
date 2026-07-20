// Bold Board painter built from shared vector topology. Grid labels remain the
// simulation source of truth, but every visual border is extracted once,
// simplified once, curved once, and reused by both neighboring territories.
// That prevents the doubled lines and black slivers produced by independently
// smoothing each polygon.

import { Board, GRID_W, GRID_H } from './gen';

export const TEX_W = 2048;
export const TEX_H = 4096;
const SX = TEX_W / GRID_W;
const SY = TEX_H / GRID_H;

const SEA = '#10333d';
const EMPIRE = '#d9a92f';
const HOMELAND = '#f0c54f';
const CONTESTED = '#a94d61';
const JEWELS = ['#765287', '#347b60', '#437a9e', '#35766f', '#6c557f', '#4c7493'];

export interface PaintState {
  owned: Set<number>;
  contested: Set<number>;
  visibleNations: Set<number>;
  company: string;
}

interface Pt { x: number; y: number }
interface PhysicalEdge { a: Pt; b: Pt; pair: string }
interface DirectedEdge { a: Pt; b: Pt }
interface Chain { points: Pt[]; pair: string; closed: boolean }
export interface SharedBorderChain { points: { x: number; y: number }[]; pair: string; closed: boolean }
interface EdgeRef { chain: number; from: string; to: string }
type Loops = Map<number, Pt[][]>;
interface Topology { loops: Loops; chains: Chain[] }
interface ContourCache { territories: Topology }
const contourCache = new WeakMap<Board, ContourCache>();

function vertexKey(p: Pt): string { return `${p.x},${p.y}`; }
function samePoint(a: Pt, b: Pt): boolean { return a.x === b.x && a.y === b.y; }
function edgeKey(a: Pt, b: Pt): string {
  const ka = vertexKey(a), kb = vertexKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}
function labelPair(a: number, b: number): string { return a < b ? `${a}|${b}` : `${b}|${a}`; }

function pointLineDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

function simplifyOpen(points: Pt[], epsilon: number): Pt[] {
  if (points.length <= 2) return points;
  let furthest = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointLineDistance(points[i], points[0], points[points.length - 1]);
    if (d > furthest) { furthest = d; index = i; }
  }
  if (furthest <= epsilon) return [points[0], points[points.length - 1]];
  const left = simplifyOpen(points.slice(0, index + 1), epsilon);
  const right = simplifyOpen(points.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
}

function simplifyClosed(loop: Pt[], epsilon: number): Pt[] {
  if (loop.length < 8) return loop;
  let split = 1, farthest = 0;
  for (let i = 1; i < loop.length; i++) {
    const d = Math.hypot(loop[i].x - loop[0].x, loop[i].y - loop[0].y);
    if (d > farthest) { farthest = d; split = i; }
  }
  const a = simplifyOpen(loop.slice(0, split + 1), epsilon);
  const b = simplifyOpen([...loop.slice(split), loop[0]], epsilon);
  const joined = [...a.slice(0, -1), ...b.slice(0, -1)];
  return joined.length >= 4 ? joined : loop;
}

// Sample a cardinal spline into a shared polyline. Neighboring territories use
// this exact point list in reverse, so curved fills remain watertight.
function curvePoints(control: Pt[], closed: boolean): Pt[] {
  if (control.length < 3) return control;
  const out: Pt[] = [{ ...control[0] }];
  const segments = closed ? control.length : control.length - 1;
  const tension = 0.34;
  for (let i = 0; i < segments; i++) {
    const a = control[closed ? (i - 1 + control.length) % control.length : Math.max(0, i - 1)];
    const b = control[i];
    const c = control[(i + 1) % control.length];
    const d = control[closed ? (i + 2) % control.length : Math.min(control.length - 1, i + 2)];
    const distance = Math.hypot(c.x - b.x, c.y - b.y);
    const steps = Math.max(3, Math.ceil(distance / 2));
    const m1x = (c.x - a.x) * tension, m1y = (c.y - a.y) * tension;
    const m2x = (d.x - b.x) * tension, m2y = (d.y - b.y) * tension;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      out.push({
        x: h00 * b.x + h10 * m1x + h01 * c.x + h11 * m2x,
        y: h00 * b.y + h10 * m1y + h01 * c.y + h11 * m2y
      });
    }
  }
  if (closed && out.length > 1 && samePoint(out[0], out[out.length - 1])) out.pop();
  return out;
}

function buildTopology(field: Int16Array, epsilon: number): Topology {
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= GRID_W || y >= GRID_H ? -1 : field[y * GRID_W + x];
  const byPair = new Map<string, PhysicalEdge[]>();
  const addPhysical = (a: Pt, b: Pt, va: number, vb: number) => {
    if (va === vb || (va < 0 && vb < 0)) return;
    const pair = labelPair(va, vb);
    const list = byPair.get(pair) ?? [];
    list.push({ a, b, pair });
    byPair.set(pair, list);
  };

  // Every physical boundary segment appears exactly once.
  for (let y = 0; y <= GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      addPhysical({ x, y }, { x: x + 1, y }, at(x, y - 1), at(x, y));
    }
  }
  for (let x = 0; x <= GRID_W; x++) {
    for (let y = 0; y < GRID_H; y++) {
      addPhysical({ x, y }, { x, y: y + 1 }, at(x - 1, y), at(x, y));
    }
  }

  const chains: Chain[] = [];
  const edgeRefs = new Map<string, EdgeRef>();
  for (const [pair, edges] of byPair) {
    const adjacency = new Map<string, number[]>();
    edges.forEach((edge, i) => {
      for (const p of [edge.a, edge.b]) {
        const k = vertexKey(p), list = adjacency.get(k) ?? [];
        list.push(i); adjacency.set(k, list);
      }
    });
    const used = new Uint8Array(edges.length);
    for (let consumed = 0; consumed < edges.length;) {
      let seed = edges.findIndex((_, i) => !used[i] &&
        ((adjacency.get(vertexKey(edges[i].a))?.length ?? 0) !== 2 ||
         (adjacency.get(vertexKey(edges[i].b))?.length ?? 0) !== 2));
      if (seed < 0) seed = edges.findIndex((_, i) => !used[i]);
      if (seed < 0) break;
      const seedEdge = edges[seed];
      const degreeA = adjacency.get(vertexKey(seedEdge.a))?.length ?? 0;
      let current = degreeA !== 2 ? seedEdge.a : seedEdge.b;
      const start = current;
      const raw: Pt[] = [{ ...current }];
      while (true) {
        const candidates = adjacency.get(vertexKey(current)) ?? [];
        const nextIndex = candidates.find(i => !used[i]);
        if (nextIndex === undefined) break;
        used[nextIndex] = 1; consumed++;
        const edge = edges[nextIndex];
        current = samePoint(edge.a, current) ? edge.b : edge.a;
        raw.push({ ...current });
        if (samePoint(current, start)) break;
        if ((adjacency.get(vertexKey(current))?.length ?? 0) !== 2) break;
      }
      const closed = raw.length > 2 && samePoint(raw[0], raw[raw.length - 1]);
      if (closed) raw.pop();
      const control = closed ? simplifyClosed(raw, epsilon) : simplifyOpen(raw, epsilon);
      const chainId = chains.length;
      chains.push({ points: curvePoints(control, closed), pair, closed });
      const rawSegments = closed ? raw.length : raw.length - 1;
      for (let i = 0; i < rawSegments; i++) {
        const a = raw[i], b = raw[(i + 1) % raw.length];
        edgeRefs.set(edgeKey(a, b), { chain: chainId, from: vertexKey(a), to: vertexKey(b) });
      }
    }
  }

  // Directed clockwise edges for every visible label, chained into loops.
  const byValue = new Map<number, DirectedEdge[]>();
  const addDirected = (v: number, a: Pt, b: Pt) => {
    if (v < 0) return;
    const list = byValue.get(v) ?? [];
    list.push({ a, b }); byValue.set(v, list);
  };
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const v = at(x, y);
      if (v < 0) continue;
      if (at(x, y - 1) !== v) addDirected(v, { x, y }, { x: x + 1, y });
      if (at(x + 1, y) !== v) addDirected(v, { x: x + 1, y }, { x: x + 1, y: y + 1 });
      if (at(x, y + 1) !== v) addDirected(v, { x: x + 1, y: y + 1 }, { x, y: y + 1 });
      if (at(x - 1, y) !== v) addDirected(v, { x, y: y + 1 }, { x, y });
    }
  }

  const loops: Loops = new Map();
  for (const [value, edges] of byValue) {
    const starts = new Map<string, number[]>();
    edges.forEach((edge, i) => {
      const k = vertexKey(edge.a), list = starts.get(k) ?? [];
      list.push(i); starts.set(k, list);
    });
    const used = new Uint8Array(edges.length);
    const valueLoops: Pt[][] = [];
    for (let seed = 0; seed < edges.length; seed++) {
      if (used[seed]) continue;
      const ordered: DirectedEdge[] = [];
      let edgeIndex = seed;
      const first = edges[seed].a;
      let guard = 0;
      while (!used[edgeIndex] && guard++ < edges.length + 4) {
        used[edgeIndex] = 1;
        const edge = edges[edgeIndex];
        ordered.push(edge);
        if (samePoint(edge.b, first)) break;
        const next = (starts.get(vertexKey(edge.b)) ?? []).find(i => !used[i]);
        if (next === undefined) break;
        edgeIndex = next;
      }
      if (ordered.length < 4 || !samePoint(ordered[ordered.length - 1].b, first)) continue;
      const refs = ordered.map(edge => edgeRefs.get(edgeKey(edge.a, edge.b)));
      if (refs.some(ref => !ref)) continue;
      let rotate = 0;
      for (let i = 0; i < ordered.length; i++) {
        const prev = refs[(i - 1 + refs.length) % refs.length]!;
        if (refs[i]!.chain !== prev.chain) { rotate = i; break; }
      }
      const rotatedEdges = [...ordered.slice(rotate), ...ordered.slice(0, rotate)];
      const rotatedRefs = [...refs.slice(rotate), ...refs.slice(0, rotate)] as EdgeRef[];
      const points: Pt[] = [];
      for (let i = 0; i < rotatedEdges.length;) {
        const ref = rotatedRefs[i];
        let j = i + 1;
        while (j < rotatedEdges.length && rotatedRefs[j].chain === ref.chain) j++;
        const forward = vertexKey(rotatedEdges[i].a) === ref.from;
        const chainPoints = forward ? chains[ref.chain].points : [...chains[ref.chain].points].reverse();
        const append = points.length > 0 && chainPoints.length > 0 && samePoint(points[points.length - 1], chainPoints[0])
          ? chainPoints.slice(1) : chainPoints;
        points.push(...append);
        i = j;
      }
      if (points.length >= 4) valueLoops.push(points);
    }
    loops.set(value, valueLoops);
  }
  return { loops, chains };
}

function contours(board: Board): ContourCache {
  const hit = contourCache.get(board);
  if (hit) return hit;
  const made = { territories: buildTopology(board.labels, 1.45) };
  contourCache.set(board, made);
  return made;
}

function pathFor(loops: Pt[][] | undefined): Path2D {
  const path = new Path2D();
  if (!loops) return path;
  for (const loop of loops) {
    if (loop.length < 3) continue;
    path.moveTo(loop[0].x * SX, loop[0].y * SY);
    for (let i = 1; i < loop.length; i++) path.lineTo(loop[i].x * SX, loop[i].y * SY);
    path.closePath();
  }
  return path;
}

// Expose the exact shared spline topology to the WebGL renderer. Fills stay on
// the texture, but strokes are real screen-stable lines, so zooming in never
// magnifies a raster border into a heavy black ribbon.
export function sharedBorderChains(board: Board): readonly SharedBorderChain[] {
  return contours(board).territories.chains;
}

function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (shift: number) => Math.max(0, Math.min(255, ((n >> shift) & 255) + amount));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

function territoryFill(st: PaintState, tid: number, nation: number, homeNation: number): string {
  if (st.owned.has(tid)) {
    const base = nation === homeNation ? HOMELAND : EMPIRE;
    return shade(base, (tid % 3 - 1) * 3);
  }
  if (st.contested.has(tid)) return CONTESTED;
  return shade(JEWELS[(nation * 5 + 1) % JEWELS.length], (tid % 3 - 1) * 4);
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

  for (const t of board.territories) {
    if (!st.visibleNations.has(t.nation)) continue;
    const path = pathFor(cached.territories.loops.get(t.id));
    ctx.fillStyle = territoryFill(st, t.id, t.nation, board.homeNation);
    ctx.fill(path);
  }

}
