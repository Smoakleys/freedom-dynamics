// Save/load behind a tiny interface so Capacitor Preferences can slot in later.

import { newGame, newLineState, type GameState } from './state';
import { LINES } from './content';

const KEY = 'freedom-dynamics-save-v1';

export function save(gs: GameState): void {
  gs.lastSeen = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(gs));
  } catch {
    // Storage full/blocked — nothing sensible to do; next save retries.
  }
}

export function load(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState & { day?: number; daysWonTotal?: number };
    // v1 → v2: day-based war became territorial sectors.
    if ((parsed.version ?? 1) < 2) {
      parsed.sector = Math.max(0, (parsed.day ?? 1) - 1);
      parsed.sectorsWonTotal = parsed.daysWonTotal ?? 0;
      parsed.version = 2;
    }
    // Merge onto a fresh state so new fields/lines get defaults after updates.
    const base = newGame();
    const gs: GameState = { ...base, ...parsed, stats: { ...base.stats, ...(parsed.stats ?? {}) } };
    const lines = [];
    for (let i = 0; i < LINES.length; i++) {
      lines.push({ ...newLineState(), ...(parsed.lines?.[i] ?? {}) });
    }
    gs.lines = lines;
    return gs;
  } catch {
    return null;
  }
}

export function wipe(): void {
  localStorage.removeItem(KEY);
}
