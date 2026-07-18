// Economy math: costs, milestones, revenue, purchasing.

import { LINES, MILESTONES, BALANCE } from './content';
import type { GameState } from './state';

export function speedMult(owned: number): number {
  let m = 1;
  for (const t of MILESTONES) if (owned >= t) m *= 2;
  return m;
}

export function nextMilestone(owned: number): number | null {
  for (const t of MILESTONES) if (owned < t) return t;
  return null;
}

export function revenueMult(gs: GameState): number {
  return 1 + gs.lobbyingPower * BALANCE.LP_REVENUE_BONUS;
}

export function powerMult(gs: GameState): number {
  return 1 + gs.lobbyingPower * BALANCE.LP_POWER_BONUS;
}

// Cost of buying `count` units of line `i` starting from `owned`.
export function bulkCost(i: number, owned: number, count: number): number {
  const L = LINES[i];
  // geometric series: base * g^owned * (g^count - 1) / (g - 1)
  const g = L.growth;
  return L.baseCost * Math.pow(g, owned) * (Math.pow(g, count) - 1) / (g - 1);
}

// Max affordable count for line `i` with `funds`.
export function maxAffordable(i: number, owned: number, funds: number): number {
  const L = LINES[i];
  const g = L.growth;
  const first = L.baseCost * Math.pow(g, owned);
  if (funds < first) return 0;
  // funds >= first * (g^n - 1)/(g - 1)  →  n = log_g(funds*(g-1)/first + 1)
  const n = Math.floor(Math.log(funds * (g - 1) / first + 1) / Math.log(g));
  return Math.max(0, n);
}

export function batchRevenue(gs: GameState, i: number): number {
  return LINES[i].revenue * gs.lines[i].owned * revenueMult(gs);
}

export function batchDuration(gs: GameState, i: number): number {
  return LINES[i].batchTime / speedMult(gs.lines[i].owned);
}

// Production influx in power/sec for a line, assuming it runs continuously.
export function lineInflux(gs: GameState, i: number): number {
  const ls = gs.lines[i];
  if (ls.owned === 0) return 0;
  const perBatch = ls.owned * LINES[i].power * powerMult(gs);
  return perBatch / batchDuration(gs, i);
}

export interface BuyResult { bought: number; cost: number; milestone: number | null; first: boolean }

export function buy(gs: GameState, i: number, count: number): BuyResult | null {
  const ls = gs.lines[i];
  const cost = bulkCost(i, ls.owned, count);
  if (count <= 0 || gs.funds < cost) return null;
  const before = ls.owned;
  gs.funds -= cost;
  ls.owned += count;
  let milestone: number | null = null;
  for (const t of MILESTONES) if (before < t && ls.owned >= t) milestone = t;
  return { bought: count, cost, milestone, first: before === 0 };
}

export function hire(gs: GameState, i: number): boolean {
  const ls = gs.lines[i];
  const cost = LINES[i].hire.cost;
  if (ls.hired || gs.funds < cost) return false;
  gs.funds -= cost;
  ls.hired = true;
  return true;
}

// Lobbying power that would be earned by prestiging now.
export function lobbyingGain(gs: GameState): number {
  const raw = BALANCE.LP_RATE * Math.sqrt(gs.lifetimeEarnings / BALANCE.LP_SCALE);
  return Math.max(0, Math.floor(raw));
}
