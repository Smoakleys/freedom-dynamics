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
    const parsed = JSON.parse(raw) as Partial<GameState> & { sector?: number; sectorsWonTotal?: number; day?: number; daysWonTotal?: number };
    // v1/v2 → v3 (Living War): economy carries over; map progress restarts on
    // the new nation continent (old linear-sector geography no longer exists).
    if ((parsed.version ?? 1) < 3) {
      parsed.territoriesWonTotal = parsed.sectorsWonTotal ?? parsed.daysWonTotal ?? 0;
      delete parsed.sector; delete parsed.sectorsWonTotal;
      delete parsed.day; delete parsed.daysWonTotal;
      parsed.owned = [];
      parsed.version = 3;
    }
    // Merge onto a fresh state so new fields/lines get defaults after updates.
    const base = newGame();
    const gs: GameState = { ...base, ...parsed, stats: { ...base.stats, ...(parsed.stats ?? {}) } } as GameState;
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
