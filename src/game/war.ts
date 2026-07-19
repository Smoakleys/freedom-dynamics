// The Living War: multi-front territorial sim. Fronts emerge wherever owned
// land borders enemy land; forces auto-spread across fronts; territories are
// captured by grinding the garrison to zero and holding. Nation-fall triggers
// a finite counteroffensive wave. Deterministic, fast-forwardable, no supply.

import { LINES, BALANCE } from './content';
import { powerMult } from './economy';
import type { Board } from '../render/board/gen';
import type { GameState, GameEvent } from './state';

export const WAR = {
  YOUR_DPS: 0.045,        // fraction of committed power dealt to garrison per sec
  GARRISON_BITE: 0.028,   // fraction of remaining garrison damaging your army per sec
  SELF_ATTRITION: 0.004,  // combat friction on your standing army per sec
  HOLD_SECONDS: 60,       // occupy time after garrison breaks before the flip
  WAVE_SCALE: 1.6,        // final wave power = scale * nation's total starting strength
  WAVE_DPS: 0.05,         // how fast your power grinds the wave per sec
  WAVE_BITE: 0.05,        // extra attrition the wave inflicts per sec
  RENT_RATE: 0.35,        // $/sec per point of captured territory strength
  HOME_RENT: 2            // flat $/sec per homeland territory
};

export function armyPower(gs: GameState): number {
  const pm = powerMult(gs);
  let p = 0;
  for (let i = 0; i < LINES.length; i++) p += gs.lines[i].army * LINES[i].power * pm;
  return p;
}

export interface FrontInfo {
  tid: number;
  garrison: number;
  strength: number;      // starting garrison
  committed: number;     // your power engaged here this tick
  progress: number;      // 0..1 toward broken garrison
  holding: boolean;      // garrison broken, hold timer running
  holdLeft: number;
}

// Enemy territories currently adjacent to owned land.
export function activeFronts(board: Board, gs: GameState): number[] {
  const owned = new Set(gs.owned);
  const out: number[] = [];
  for (const t of board.territories) {
    if (owned.has(t.id)) continue;
    for (const nb of t.neighbors) {
      if (owned.has(nb)) { out.push(t.id); break; }
    }
  }
  return out;
}

// Nations visible = home + any nation owning a territory adjacent to yours.
export function visibleNations(board: Board, gs: GameState): Set<number> {
  const vis = new Set<number>([board.homeNation]);
  for (const tid of activeFronts(board, gs)) {
    const t = board.territories.find(q => q.id === tid);
    if (t) vis.add(t.nation);
  }
  for (const tid of gs.owned) {
    const t = board.territories.find(q => q.id === tid);
    if (t) vis.add(t.nation);
  }
  return vis;
}

function ensureGarrison(board: Board, gs: GameState, tid: number): number {
  if (gs.garrisons[tid] === undefined) {
    const t = board.territories.find(q => q.id === tid)!;
    gs.garrisons[tid] = t.strength;
  }
  return gs.garrisons[tid];
}

export function frontInfos(board: Board, gs: GameState): FrontInfo[] {
  const fronts = activeFronts(board, gs);
  const P = armyPower(gs);
  // Auto-spread: committed power proportional to remaining garrison (heavier
  // resistance draws more force). v0.4b adds per-line SEND HERE overrides.
  let totalG = 0;
  const infos: FrontInfo[] = [];
  for (const tid of fronts) {
    const g = ensureGarrison(board, gs, tid);
    totalG += Math.max(g, 1);
  }
  for (const tid of fronts) {
    const t = board.territories.find(q => q.id === tid)!;
    const g = gs.garrisons[tid];
    const share = totalG > 0 ? Math.max(g, 1) / totalG : 1 / fronts.length;
    infos.push({
      tid,
      garrison: g,
      strength: t.strength,
      committed: P * share,
      progress: t.strength > 0 ? 1 - g / t.strength : 1,
      holding: g <= 0,
      holdLeft: g <= 0 ? Math.max(0, WAR.HOLD_SECONDS - (gs.holdTimers[tid] ?? 0)) : WAR.HOLD_SECONDS
    });
  }
  return infos;
}

export function warTick(board: Board, gs: GameState, dt: number, events: GameEvent[]): void {
  const fronts = frontInfos(board, gs);
  const P = armyPower(gs);
  const pm = powerMult(gs);

  // — Your army takes damage: garrison bite + wave bite + friction —
  let incoming = P * WAR.SELF_ATTRITION * dt;
  for (const f of fronts) incoming += Math.max(0, f.garrison) * WAR.GARRISON_BITE * dt;
  if (gs.wave) incoming += gs.wave.power * WAR.WAVE_BITE * dt;
  if (incoming > 0 && P > 0) {
    let damage = incoming;
    for (let i = 0; i < LINES.length && damage > 0; i++) {
      const ls = gs.lines[i];
      if (ls.army <= 0) continue;
      const unitPower = LINES[i].power * pm;
      const poolPower = ls.army * unitPower;
      const spent = Math.min(poolPower, damage);
      ls.army -= spent / unitPower;
      gs.stats.unitsLost += spent / unitPower;
      damage -= spent;
    }
  }

  // — The wave soaks your offensive power before territories do —
  let offense = P;
  if (gs.wave) {
    const grind = Math.min(gs.wave.power, offense * WAR.WAVE_DPS * dt);
    gs.wave.power -= grind;
    offense *= 0.35; // most of the army is busy repelling the counteroffensive
    if (gs.wave.power <= 0) {
      events.push({ type: 'nationFell', nation: gs.wave.nation });
      gs.wave = null;
    }
  }

  // — Grind garrisons, run hold timers, flip territories —
  for (const f of fronts) {
    if (!f.holding) {
      const dmg = (f.committed / Math.max(P, 1)) * offense * WAR.YOUR_DPS * dt;
      gs.garrisons[f.tid] = Math.max(0, f.garrison - dmg);
      continue;
    }
    gs.holdTimers[f.tid] = (gs.holdTimers[f.tid] ?? 0) + dt;
    if (gs.holdTimers[f.tid] >= WAR.HOLD_SECONDS) {
      const t = board.territories.find(q => q.id === f.tid)!;
      gs.owned.push(f.tid);
      gs.captureStamp++;
      gs.territoriesWonTotal++;
      const bond = BALANCE.BOND_MULT * Math.max(t.strength, 10);
      gs.funds += bond;
      gs.lifetimeEarnings += bond;
      events.push({ type: 'territoryWon', tid: f.tid, bond });
      // Nation fully conquered → its final counteroffensive.
      const nation = board.nations[t.nation];
      const remaining = nation.territories.filter(id => !gs.owned.includes(id));
      if (remaining.length === 0 && t.nation !== board.homeNation && !gs.fallenNations.includes(t.nation)) {
        gs.fallenNations.push(t.nation);
        const wavePower = WAR.WAVE_SCALE * nation.territories
          .reduce((s, id) => s + (board.territories.find(q => q.id === id)?.strength ?? 0), 0);
        gs.wave = { nation: t.nation, power: wavePower, initial: wavePower };
        events.push({ type: 'waveStarted', nation: t.nation });
      }
    }
  }

  // — Territorial rent: the empire pays —
  let rent = 0;
  for (const tid of gs.owned) {
    const t = board.territories.find(q => q.id === tid);
    if (!t) continue;
    rent += t.nation === board.homeNation ? WAR.HOME_RENT : t.strength * WAR.RENT_RATE;
  }
  gs.rentPerSec = rent;
  gs.funds += rent * dt;
  gs.lifetimeEarnings += rent * dt;
}
