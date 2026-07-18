// Board painter: renders the map to an offscreen canvas used as the ground
// texture. Repainted only when ownership/fog changes, never per-frame.

import { mulberry32 } from '../rng';
import { Board, GRID_W, GRID_H, labelAt } from './gen';

export const TEX_W = 1440;
export const TEX_H = 2880;
const SX = TEX_W / GRID_W;
const SY = TEX_H / GRID_H;

const SEA = '#26343f';
const SEA_LINE = 'rgba(255,255,255,0.045)';
const COAST = '#1c242e';
const BORDER = 'rgba(28,30,36,0.85)';
const FOG_BG = '#232833';
const GOLD_BASE = { h: 41, s: 58, l: 54 };
const GRAY_BASE = { h: 210, s: 9, l: 46 };
const CONTESTED = { h: 28, s: 42, l: 46 };

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
  const seaRGB: [number, number, number] = [38, 52, 63];
  const fogRGB: [number, number, number] = [35, 40, 51];
  const coastRGB: [number, number, number] = [28, 36, 46];
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
        c = seaRGB;
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

  // — Sea wave strokes (drawn where the start point is sea) —
  ctx.strokeStyle = SEA_LINE;
  ctx.lineWidth = 2;
  const seaR = mulberry32(9);
  for (let i = 0; i < 110; i++) {
    const y = seaR() * TEX_H, x = seaR() * TEX_W, len = 30 + seaR() * 80;
    if (labelAt(board, x / SX, y / SY) >= 0) continue;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len / 2, y - 4, x + len, y);
    ctx.stroke();
  }

  // — Paper grain over land —
  const grain = mulberry32(31);
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 2600; i++) {
    const x = grain() * TEX_W, y = grain() * TEX_H;
    ctx.fillStyle = grain() > 0.5 ? '#fff' : '#000';
    ctx.fillRect(x, y, 2.2, 2.2);
  }
  ctx.globalAlpha = 1;

  // — Terrain glyphs: mountains + forests seeded inside territories —
  for (const t of board.territories) {
    const o = owner(t);
    if (o === 'fog') continue;
    const r = mulberry32(t.id * 191 + 7);
    const glyphs = 3 + Math.floor(r() * 4);
    ctx.strokeStyle = o === 'you' ? 'rgba(80,58,16,0.5)' : 'rgba(38,42,48,0.55)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2.5;
    for (let g = 0; g < glyphs; g++) {
      const gx = (t.cx + (r() - 0.5) * 34) * SX;
      const gy = (t.cy + (r() - 0.5) * 34) * SY;
      if (labelAt(board, gx / SX, gy / SY) !== t.id) continue;
      if (r() > 0.5) {
        // Mountain: two peaks.
        ctx.beginPath();
        ctx.moveTo(gx - 11, gy + 6);
        ctx.lineTo(gx - 3, gy - 8);
        ctx.lineTo(gx + 2, gy + 2);
        ctx.lineTo(gx + 6, gy - 4);
        ctx.lineTo(gx + 12, gy + 6);
        ctx.stroke();
      } else {
        // Forest: three dots + trunks.
        for (let k = 0; k < 3; k++) {
          const fx = gx + (k - 1) * 9, fy = gy + (k % 2) * 5;
          ctx.beginPath();
          ctx.arc(fx, fy - 4, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(fx - 1, fy, 2, 5);
        }
      }
    }
  }

  // — Fog treatment: hatch + label on unexplored land —
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1.5;
  for (const t of board.territories) {
    if (owner(t) !== 'fog') continue;
    const r = mulberry32(t.id * 77);
    for (let i = 0; i < 26; i++) {
      const hx = (t.cx + (r() - 0.5) * 46) * SX;
      const hy = (t.cy + (r() - 0.5) * 46) * SY;
      if (labelAt(board, hx / SX, hy / SY) !== t.id) continue;
      ctx.beginPath();
      ctx.moveTo(hx - 8, hy + 8);
      ctx.lineTo(hx + 8, hy - 8);
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
      drawStar(ctx, px, py - 26, 12, '#6d4e13');
      ctx.fillStyle = 'rgba(52,38,10,0.92)';
    } else if (o === 'contested') {
      ctx.fillStyle = 'rgba(255,240,214,0.95)';
    } else {
      ctx.fillStyle = 'rgba(222,228,234,0.75)';
    }
    ctx.font = '700 25px ui-monospace, Menlo, monospace';
    drawSpaced(ctx, display, px, py + 8, 3);
    if (o === 'contested') {
      ctx.font = '600 19px ui-monospace, Menlo, monospace';
      ctx.fillStyle = 'rgba(255,196,124,0.95)';
      drawSpaced(ctx, '· CONTESTED ·', px, py + 36, 2);
    }
  }
  // One label for the whole fogged region.
  const fogged = board.territories.filter(t => owner(t) === 'fog');
  if (fogged.length > 0) {
    const fx = fogged.reduce((s, t) => s + t.cx, 0) / fogged.length * SX;
    const fy = fogged.reduce((s, t) => s + t.cy, 0) / fogged.length * SY;
    ctx.font = '600 22px ui-monospace, Menlo, monospace';
    ctx.fillStyle = 'rgba(170,178,190,0.5)';
    drawSpaced(ctx, '[ UNSURVEYED — ACQUIRE ]', fx, fy, 3);
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
