// Deterministic battle simulation. Pure math over GameState — no rendering,
// no randomness. The renderer and chyron consume the emitted events.

import { LINES, BALANCE } from './content';
import { powerMult } from './economy';
import type { GameState, GameEvent } from './state';

export function adversaryStrength(day: number): number {
  return BALANCE.ADV_BASE * Math.pow(BALANCE.ADV_GROWTH, day - 1);
}

// Total standing army power.
export function armyPower(gs: GameState): number {
  const pm = powerMult(gs);
  let p = 0;
  for (let i = 0; i < LINES.length; i++) p += gs.lines[i].army * LINES[i].power * pm;
  return p;
}

// One battle tick of `dt` seconds. Mutates gs, pushes events.
export function battleTick(gs: GameState, dt: number, events: GameEvent[]): void {
  const A = adversaryStrength(gs.day);
  const pm = powerMult(gs);
  let P = armyPower(gs);

  // Attrition: adversary fire + general combat losses, applied power-weighted
  // from the cheapest units up (screening forces die first).
  let damage = (A * BALANCE.ADV_DPS_FRAC + P * BALANCE.SELF_ATTRITION) * dt;
  if (damage > 0 && P > 0) {
    for (let i = 0; i < LINES.length && damage > 0; i++) {
      const ls = gs.lines[i];
      if (ls.army <= 0) continue;
      const unitPower = LINES[i].power * pm;
      const poolPower = ls.army * unitPower;
      const spent = Math.min(poolPower, damage);
      const lost = spent / unitPower;
      ls.army -= lost;
      gs.stats.unitsLost += lost;
      damage -= spent;
    }
    P = armyPower(gs);
  }

  // Front movement.
  const r = P / A;
  let v: number;
  if (r >= 1) v = BALANCE.FRONT_K * (r - 1);
  else v = BALANCE.FRONT_K * (r - 1) * BALANCE.FRONT_RETREAT_SCALE;
  // Cap advance speed so a massive overmatch still reads as a battle, not a teleport.
  v = Math.min(v, 0.03);
  gs.front = Math.max(BALANCE.FRONT_FLOOR, gs.front + v * dt);

  if (gs.front >= 1) {
    const bond = BALANCE.BOND_MULT * A;
    gs.funds += bond;
    gs.lifetimeEarnings += bond;
    events.push({ type: 'dayWon', day: gs.day, bond });
    gs.daysWonTotal += 1;
    gs.day += 1;
    gs.front = BALANCE.FRONT_START;
    // The counterattack scatters part of the standing army (keeps days honest
    // without ever feeling like a loss — production replaces it fast).
    for (const ls of gs.lines) ls.army *= 0.5;
    events.push({ type: 'newDay', day: gs.day });
  }
}
