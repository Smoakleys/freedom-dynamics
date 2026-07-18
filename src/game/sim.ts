// Tick orchestrator: production + battle, online frames and offline fast-forward.

import { LINES, BALANCE } from './content';
import { batchDuration, batchRevenue } from './economy';
import { battleTick } from './battle';
import type { GameState, GameEvent } from './state';

// Advance production by dt seconds. Returns events.
function productionTick(gs: GameState, dt: number, events: GameEvent[]): void {
  for (let i = 0; i < LINES.length; i++) {
    const ls = gs.lines[i];
    if (ls.owned === 0) continue;
    if (!ls.hired && !ls.running) continue;
    const dur = batchDuration(gs, i);
    ls.progress += dt / dur;
    // A hired line can complete several batches inside one big dt (offline).
    while (ls.progress >= 1) {
      const rev = batchRevenue(gs, i);
      gs.funds += rev;
      gs.lifetimeEarnings += rev;
      ls.delivered += ls.owned;
      ls.army += ls.owned;
      events.push({ type: 'delivered', line: i, count: ls.owned, revenue: rev });
      if (ls.hired) {
        ls.progress -= 1;
      } else {
        ls.progress = 0;
        ls.running = false;
        break;
      }
    }
  }
}

export function tick(gs: GameState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  // Clamp runaway frame deltas (tab hidden etc.) — big gaps go through fastForward.
  const step = Math.min(dt, 1);
  productionTick(gs, step, events);
  battleTick(gs, step, events);
  return events;
}

export interface OfflineReport {
  seconds: number;
  earned: number;
  daysWon: number;
  unitsDelivered: number;
  unitsLost: number;
  startDay: number;
  endDay: number;
}

// Deterministic offline catch-up. 1s steps: 72h = 259k iterations, milliseconds in JS.
export function fastForward(gs: GameState, seconds: number): OfflineReport {
  const capped = Math.min(seconds, BALANCE.OFFLINE_CAP_HOURS * 3600);
  const startFunds = gs.funds + 0;
  const startEarnings = gs.lifetimeEarnings;
  const startDay = gs.day;
  const startLost = gs.stats.unitsLost;
  let delivered = 0;
  const events: GameEvent[] = [];
  let remaining = capped;
  while (remaining > 0) {
    const step = Math.min(remaining, 1);
    const before = events.length;
    productionTick(gs, step, events);
    battleTick(gs, step, events);
    remaining -= step;
    for (let k = before; k < events.length; k++) {
      const e = events[k];
      if (e.type === 'delivered') delivered += e.count;
    }
    events.length = 0; // don't accumulate; we only need aggregates
  }
  return {
    seconds: capped,
    earned: gs.lifetimeEarnings - startEarnings,
    daysWon: gs.day - startDay,
    unitsDelivered: delivered,
    unitsLost: gs.stats.unitsLost - startLost,
    startDay,
    endDay: gs.day
  };
}
