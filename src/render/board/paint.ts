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
  sector: number;          // contested conquest index
  revealAhead: number;     // how many conquest steps past contested are visible
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

  const owner = (t: { order: number }): 'you' | 'foe' | 'contested' | 'fog' => {
    if (t.order === -1 || t.order < st.sector) return 'you';
    if (t.order === st.sector) return 'contested';
    if (t.order <= st.sector + st.revealAhead) return 'foe';
    return 'fog';
  };
  const byId = new Map(board.territories.map(t => [t.id, t]));

  // — Fills + borders on a coarse pixel canvas, upscaled with smoothing so
  //   coastlines and borders come out organic instead of stair-stepped —
  const coarse = document.createElement('canvas');
  coarse.width = GRID_W; coarse.height = GRID_H;
  const cctx = coarse.getContext('2d')!;
  const im = cctx.createImageData(GRID_W, GRID_H);
  const px = im.data;
  const seaRGB: [number, number, number] = [34, 50, 62];
  const shallowRGB: [number, number, number] = [52, 74, 86];
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
      c = o === 'you' ? terrColor(GOLD_BASE, l)
        : o === 'contested' ? terrColor(CONTESTED, l)
        : o === 'foe' ? terrColor(GRAY_BASE, l)
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
        // Border / coast detection against left+up neighbors.
        const ll = gx > 0 ? board.labels[k - 1] : -1;
        const lu = gy > 0 ? board.labels[k - GRID_W] : -1;
        if (ll < 0 || lu < 0) c = coastRGB;
        else if (ll !== l || lu !== l) c = borderRGB;
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
    ctx.strokeStyle = o === 'you' ? 'rgba(74,52,12,0.65)' : 'rgba(30,34,42,0.65)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2.8 * K;
    for (let g = 0; g < glyphs; g++) {
      const gx = (t.cx + (r() - 0.5) * 40) * SX;
      const gy = (t.cy + (r() - 0.5) * 40) * SY;
      if (labelAt(board, gx / SX, gy / SY) !== t.id) continue;
      const kind = r();
      const sc = (0.85 + r() * 0.45) * K;
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

  // — Names + stamps —
  ctx.textAlign = 'center';
  for (const t of board.territories) {
    const o = owner(t);
    const px = t.cx * SX, py = t.cy * SY;
    if (o === 'fog') continue;
    const display = t.order === -1 ? `${st.company.split(' ')[0].toUpperCase()} HQ` : t.name.toUpperCase();
    if (o === 'you') {
      drawStar(ctx, px, py - 28 * K, 13 * K, '#6d4e13');
      ctx.fillStyle = 'rgba(48,34,8,0.95)';
    } else if (o === 'contested') {
      ctx.fillStyle = 'rgba(255,242,218,0.98)';
    } else {
      ctx.fillStyle = 'rgba(226,232,238,0.8)';
    }
    ctx.font = `700 ${Math.round(25 * K)}px ui-monospace, Menlo, monospace`;
    drawSpaced(ctx, display, px, py + 8 * K, 3 * K);
    if (o === 'contested') {
      ctx.font = `600 ${Math.round(19 * K)}px ui-monospace, Menlo, monospace`;
      ctx.fillStyle = 'rgba(255,196,124,0.95)';
      drawSpaced(ctx, '· CONTESTED ·', px, py + 38 * K, 2 * K);
    }
  }
  // One label for the whole fogged region.
  const fogged = board.territories.filter(t => owner(t) === 'fog');
  if (fogged.length > 0) {
    const fx = fogged.reduce((s, t) => s + t.cx, 0) / fogged.length * SX;
    const fy = fogged.reduce((s, t) => s + t.cy, 0) / fogged.length * SY;
    ctx.font = `600 ${Math.round(22 * K)}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = 'rgba(170,178,190,0.5)';
    drawSpaced(ctx, '[ UNSURVEYED — ACQUIRE ]', fx, fy, 3 * K);
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
