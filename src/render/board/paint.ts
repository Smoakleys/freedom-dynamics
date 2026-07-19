// Board painter: renders the map to an offscreen canvas used as the ground
// texture. Repainted only when ownership/fog changes, never per-frame.

import { mulberry32 } from '../rng';
import { Board, GRID_W, GRID_H, labelAt } from './gen';

export const TEX_W = 2048;
export const TEX_H = 4096;
const SX = TEX_W / GRID_W;
const SY = TEX_H / GRID_H;
const K = TEX_W / 1440;   // scale for stroke widths / fonts vs the original layout

const SEA = '#26343f';
const SEA_LINE = 'rgba(255,255,255,0.045)';
const COAST = '#1c242e';
const BORDER = 'rgba(28,30,36,0.85)';
const FOG_BG = '#232833';
const GOLD_BASE = { h: 41, s: 66, l: 53 };
const GRAY_BASE = { h: 212, s: 13, l: 43 };
const CONTESTED = { h: 27, s: 42, l: 49 };

export interface PaintState {
  owned: Set<number>;        // territory ids you hold
  contested: Set<number>;    // active front territory ids
  visibleNations: Set<number>;
  company: string;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

function terrColor(base: { h: number; s: number; l: number }, id: number): [number, number, number] {
  const r = mulberry32(id * 733 + 5);
  return hslToRgb(
    base.h + (r() - 0.5) * 10,
    base.s + (r() - 0.5) * 10,
    base.l + (r() - 0.5) * 12
  );
}

export function paintBoard(canvas: HTMLCanvasElement, board: Board, st: PaintState): void {
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d')!;

  const owner = (t: { id: number; nation: number }): 'you' | 'foe' | 'contested' | 'fog' => {
    if (st.owned.has(t.id)) return 'you';
    if (st.contested.has(t.id)) return 'contested';
    if (st.visibleNations.has(t.nation)) return 'foe';
    return 'fog';
  };
  const byId = new Map(board.territories.map(t => [t.id, t]));
  const nationOf = (t: { nation: number }) => board.nations[t.nation];

  // — Fills + borders on a coarse pixel canvas, upscaled with smoothing so
  //   coastlines and borders come out organic instead of stair-stepped —
  const coarse = document.createElement('canvas');
  coarse.width = GRID_W; coarse.height = GRID_H;
  const cctx = coarse.getContext('2d')!;
  const im = cctx.createImageData(GRID_W, GRID_H);
  const px = im.data;
  const seaRGB: [number, number, number] = [42, 60, 74];
  const shallowRGB: [number, number, number] = [60, 84, 98];
  const fogRGB: [number, number, number] = [35, 40, 51];
  const coastRGB: [number, number, number] = [26, 34, 44];
  const borderRGB: [number, number, number] = [40, 42, 48];
  const colorCache = new Map<number, [number, number, number]>();
  const cellColor = (l: number): [number, number, number] => {
    const t = byId.get(l);
    if (!t) return seaRGB;
    const o = owner(t);
    const key = l * 10 + (o === 'you' ? 1 : o === 'contested' ? 2 : o === 'foe' ? 3 : 4);
    let c = colorCache.get(key);
    if (!c) {
      // Enemy land uses its NATION's palette family so countries read as
      // distinct blocs; your empire is always gold.
      // Contested keeps its NATION'S cold hue (slightly lifted) — the gold
      // hatch marks the fight; a warm fill would smear into the empire.
      const nc = nationOf(t).color;
      c = o === 'you' ? terrColor(GOLD_BASE, l)
        : o === 'contested' ? terrColor({ h: nc.h, s: nc.s + 8, l: nc.l + 7 }, l)
        : o === 'foe' ? terrColor(nc, l)
        : fogRGB;
      colorCache.set(key, c);
    }
    return c;
  };
  for (let gy = 0; gy < GRID_H; gy++) {
    for (let gx = 0; gx < GRID_W; gx++) {
      const k = gy * GRID_W + gx;
      const l = board.labels[k];
      let c: [number, number, number];
      if (l < 0) {
        // Shallow ring where sea touches land gives the coast a hand-inked halo.
        const touchesLand =
          (gx > 0 && board.labels[k - 1] >= 0) || (gx < GRID_W - 1 && board.labels[k + 1] >= 0) ||
          (gy > 0 && board.labels[k - GRID_W] >= 0) || (gy < GRID_H - 1 && board.labels[k + GRID_W] >= 0);
        c = touchesLand ? shallowRGB : seaRGB;
      } else {
        c = cellColor(l);
        // Border / coast detection against left+up neighbors. Borders between
        // NATIONS draw darker than internal territory borders.
        const ll = gx > 0 ? board.labels[k - 1] : -1;
        const lu = gy > 0 ? board.labels[k - GRID_W] : -1;
        if (ll < 0 || lu < 0) c = coastRGB;
        else if (ll !== l || lu !== l) {
          const tl = byId.get(l), tn = byId.get(ll !== l ? ll : lu);
          c = tl && tn && tl.nation !== tn.nation ? coastRGB : borderRGB;
        }
      }
      px[k * 4] = c[0]; px[k * 4 + 1] = c[1]; px[k * 4 + 2] = c[2]; px[k * 4 + 3] = 255;
    }
  }
  cctx.putImageData(im, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(coarse, 0, 0, TEX_W, TEX_H);

  // — Sea dressing: faint graticule grid + wave strokes —
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1.5 * K;
  for (let gx = 0; gx < TEX_W; gx += 128 * K) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, TEX_H); ctx.stroke();
  }
  for (let gy = 0; gy < TEX_H; gy += 128 * K) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(TEX_W, gy); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 2 * K;
  const seaR = mulberry32(9);
  for (let i = 0; i < 150; i++) {
    const y = seaR() * TEX_H, x = seaR() * TEX_W, len = (30 + seaR() * 80) * K;
    if (labelAt(board, x / SX, y / SY) >= 0) continue;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len / 2, y - 5 * K, x + len, y);
    ctx.stroke();
  }

  // — Paper grain over land —
  const grain = mulberry32(31);
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 5200; i++) {
    const x = grain() * TEX_W, y = grain() * TEX_H;
    ctx.fillStyle = grain() > 0.5 ? '#fff' : '#000';
    ctx.fillRect(x, y, 2.2 * K, 2.2 * K);
  }
  ctx.globalAlpha = 1;

  // — Terrain glyphs: mountains, forests, and stipple inside territories —
  for (const t of board.territories) {
    const o = owner(t);
    if (o === 'fog') continue;
    const r = mulberry32(t.id * 191 + 7);
    const glyphs = 5 + Math.floor(r() * 5);
    // Quiet cartographic marks — loud glyphs read as scribbles up close.
    ctx.strokeStyle = o === 'you' ? 'rgba(74,52,12,0.32)' : 'rgba(30,34,42,0.34)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.8 * K;
    for (let g = 0; g < glyphs; g++) {
      const gx = (t.cx + (r() - 0.5) * 40) * SX;
      const gy = (t.cy + (r() - 0.5) * 40) * SY;
      if (labelAt(board, gx / SX, gy / SY) !== t.id) continue;
      const kind = r();
      const sc = (0.45 + r() * 0.25) * K;
      const rot = (r() - 0.5) * 0.35;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(rot);
      if (kind > 0.55) {
        // Mountain: two peaks + a snow tick.
        ctx.beginPath();
        ctx.moveTo(-12 * sc, 7 * sc);
        ctx.lineTo(-3 * sc, -9 * sc);
        ctx.lineTo(2 * sc, 2 * sc);
        ctx.lineTo(7 * sc, -5 * sc);
        ctx.lineTo(13 * sc, 7 * sc);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-5.5 * sc, -4 * sc);
        ctx.lineTo(-3 * sc, -9 * sc);
        ctx.lineTo(-0.5 * sc, -4 * sc);
        ctx.stroke();
      } else if (kind > 0.2) {
        // Forest: three trees.
        for (let k2 = 0; k2 < 3; k2++) {
          const fx = (k2 - 1) * 10 * sc, fy = (k2 % 2) * 6 * sc;
          ctx.beginPath();
          ctx.arc(fx, fy - 5 * sc, 4.5 * sc, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(fx - 1.2 * sc, fy, 2.4 * sc, 6 * sc);
        }
      } else {
        // Stipple field.
        for (let k2 = 0; k2 < 8; k2++) {
          ctx.fillRect((r() - 0.5) * 26 * sc, (r() - 0.5) * 16 * sc, 2 * K, 2 * K);
        }
      }
      ctx.restore();
    }
  }

  // — Fog treatment: hatch + label on unexplored land —
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1.5 * K;
  for (const t of board.territories) {
    if (owner(t) !== 'fog') continue;
    const r = mulberry32(t.id * 77);
    for (let i = 0; i < 26; i++) {
      const hx = (t.cx + (r() - 0.5) * 46) * SX;
      const hy = (t.cy + (r() - 0.5) * 46) * SY;
      if (labelAt(board, hx / SX, hy / SY) !== t.id) continue;
      ctx.beginPath();
      ctx.moveTo(hx - 8 * K, hy + 8 * K);
      ctx.lineTo(hx + 8 * K, hy - 8 * K);
      ctx.stroke();
    }
  }

  // — Ownership stamps + industry. ALL text lives on the sprite overlay layer
  //   (baked labels magnified into blur at close zoom — reviewer B1). —
  for (const t of board.territories) {
    const o = owner(t);
    if (o !== 'you') continue;
    drawStar(ctx, t.cx * SX, t.cy * SY, 13 * K, 'rgba(109,78,19,0.8)');
    // Company towns: small building clusters — the empire looks BUILT ON, not
    // just tinted (annexed land shows its new management).
    const r = mulberry32(t.id * 419);
    for (let c = 0; c < 3; c++) {
      const bx = (t.cx + (r() - 0.5) * 30) * SX;
      const by = (t.cy + (r() - 0.5) * 30) * SY;
      if (labelAt(board, bx / SX, by / SY) !== t.id) continue;
      for (let b = 0; b < 4 + Math.floor(r() * 3); b++) {
        const w2 = (4 + r() * 6) * K, h2 = (4 + r() * 8) * K;
        ctx.fillStyle = r() > 0.4 ? 'rgba(96,70,22,0.8)' : 'rgba(56,40,12,0.8)';
        ctx.fillRect(bx + (r() - 0.5) * 20 * K, by + (r() - 0.5) * 14 * K, w2, h2);
      }
    }
  }

  // Contested territories get an animated-feel gold dashed ring along their
  // border with your land instead of a fill change.
  ctx.strokeStyle = 'rgba(242,193,78,0.9)';
  ctx.lineWidth = 5 * K;
  ctx.setLineDash([14 * K, 10 * K]);
  for (let gy = 1; gy < GRID_H; gy++) {
    for (let gx = 1; gx < GRID_W; gx++) {
      const l = board.labels[gy * GRID_W + gx];
      if (l < 0 || !st.contested.has(l)) continue;
      const ll = board.labels[gy * GRID_W + gx - 1];
      const lu = board.labels[(gy - 1) * GRID_W + gx];
      if ((ll >= 0 && st.owned.has(ll)) || (lu >= 0 && st.owned.has(lu))) {
        ctx.beginPath();
        ctx.moveTo(gx * SX - 3 * K, gy * SY);
        ctx.lineTo(gx * SX + 3 * K, gy * SY);
        ctx.stroke();
      }
    }
  }
  ctx.setLineDash([]);

  // War scars: many small scorch marks (big baked blobs smear at close zoom).
  ctx.fillStyle = 'rgba(30,22,12,0.22)';
  for (const t of board.territories) {
    if (!st.contested.has(t.id)) continue;
    const r = mulberry32(t.id * 613);
    for (let i = 0; i < 44; i++) {
      const sxp = (t.cx + (r() - 0.5) * 40) * SX;
      const syp = (t.cy + (r() - 0.5) * 40) * SY;
      if (labelAt(board, sxp / SX, syp / SY) !== t.id) continue;
      ctx.beginPath();
      ctx.ellipse(sxp, syp, (1 + r() * 2.4) * K, (0.8 + r() * 1.8) * K, r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Contested identity: gold diagonal hatch over the enemy fill (reads at
  // every zoom, unlike the dashed ring alone).
  ctx.strokeStyle = 'rgba(242,193,78,0.16)';
  ctx.lineWidth = 3 * K;
  for (const t of board.territories) {
    if (!st.contested.has(t.id)) continue;
    for (let off = -60; off < 60; off += 7) {
      const x0 = (t.cx + off) * SX, y0 = (t.cy - 60) * SY;
      ctx.beginPath();
      let drawing = false;
      for (let s = 0; s < 120; s += 2) {
        const px = x0 + s * SX * 0.7, py = y0 + s * SY;
        const inT = labelAt(board, px / SX, py / SY) === t.id;
        if (inT && !drawing) { ctx.moveTo(px, py); drawing = true; }
        else if (!inT && drawing) { ctx.stroke(); ctx.beginPath(); drawing = false; }
        else if (inT) ctx.lineTo(px, py);
      }
      if (drawing) ctx.stroke();
    }
  }

  // — Vignette —
  const vg = ctx.createRadialGradient(TEX_W / 2, TEX_H / 2, TEX_H * 0.32, TEX_W / 2, TEX_H / 2, TEX_H * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const rr = k % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + k * Math.PI / 5;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawSpaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number): void {
  // Manual letter-spacing (canvas has no reliable letterSpacing on iOS).
  const widths = [...text].map(ch => ctx.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, -spacing);
  let cx = x - total / 2;
  ctx.save();
  ctx.textAlign = 'left';
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], cx, y);
    cx += widths[i];
  }
  ctx.restore();
}
