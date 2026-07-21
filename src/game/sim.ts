// Tick orchestrator: production + the Living War, online frames and offline
// fast-forward. The board is bound once at startup (deterministic from seed).

import { LINES, BALANCE } from './content';
import { batchDuration, batchRevenue } from './economy';
import { queueReinforcement, reinforcementTick, warTick } from './war';
import type { Board } from '../render/board/gen';
import type { GameState, GameEvent } from './state';

let boundBoard: Board | null = null;

export function bindBoard(board: Board, gs: GameState): void {
  boundBoard = board;
  // First bind of a fresh (or migrated) game: grant the homeland.
  if (gs.owned.length === 0) {
    for (const t of board.territories) {
      if (t.nation === board.homeNation) gs.owned.push(t.id);
    }
    gs.captureStamp++;
  }
}

function productionTick(gs: GameState, dt: number, events: GameEvent[]): void {
  for (let i = 0; i < LINES.length; i++) {
    const ls = gs.lines[i];
    if (ls.owned === 0) continue;
    if (!ls.hired && !ls.running) continue;
    const dur = batchDuration(gs, i);
    ls.progress += dt / dur;
    if (ls.progress < 1) continue;
    // Automated lines may complete thousands of fast batches during one
    // offline step. Aggregate the exact totals into one dispatch instead of
    // repeatedly recalculating the same destination.
    const batches = ls.hired ? Math.floor(ls.progress) : 1;
    const count = ls.owned * batches;
    const revenue = batchRevenue(gs, i) * batches;
    gs.funds += revenue;
    gs.lifetimeEarnings += revenue;
    ls.delivered += count;
    if (boundBoard) queueReinforcement(boundBoard, gs, i, count, events);
    else ls.army += count;
    events.push({ type: 'delivered', line: i, count, revenue });
    if (ls.hired) ls.progress -= batches;
    else {
      ls.progress = 0;
      ls.running = false;
    }
  }
}

export function tick(gs: GameState, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  const step = Math.min(dt, 1);
  productionTick(gs, step, events);
  if (boundBoard) {
    reinforcementTick(boundBoard, gs, step, events);
    warTick(boundBoard, gs, step, events);
  }
  return events;
}

export interface OfflineReport {
  seconds: number;
  earned: number;
  territoriesWon: number;
  nationsFallen: number;
  researchDone: string[];
  unitsDelivered: number;
  unitsLost: number;
}

export function fastForward(gs: GameState, seconds: number): OfflineReport {
  const capped = Math.min(seconds, BALANCE.OFFLINE_CAP_HOURS * 3600);
  const startEarnings = gs.lifetimeEarnings;
  const startWon = gs.territoriesWonTotal;
  const startLost = gs.stats.unitsLost;
  let delivered = 0;
  let nationsFallen = 0;
  const researchDone: string[] = [];
  const events: GameEvent[] = [];
  let remaining = capped;
  while (remaining > 0) {
    // Transit, combat, capture, and production are all deterministic at this
    // granularity. Five-second offline steps keep an eight-hour return cheap
    // on a phone without inventing a separate approximation model.
    const step = Math.min(remaining, 5);
    const before = events.length;
    productionTick(gs, step, events);
    if (boundBoard) {
      reinforcementTick(boundBoard, gs, step, events);
      warTick(boundBoard, gs, step, events);
    }
    remaining -= step;
    for (let k = before; k < events.length; k++) {
      const e = events[k];
      if (e.type === 'delivered') delivered += e.count;
      else if (e.type === 'nationFell') nationsFallen++;
      else if (e.type === 'researchDone') researchDone.push(e.id);
    }
    events.length = 0;
  }
  return {
    seconds: capped,
    earned: gs.lifetimeEarnings - startEarnings,
    territoriesWon: gs.territoriesWonTotal - startWon,
    nationsFallen,
    researchDone,
    unitsDelivered: delivered,
    unitsLost: gs.stats.unitsLost - startLost
  };
}
