// The Living War: multi-front territorial sim. Fronts emerge wherever owned
// land borders enemy land; forces auto-spread across fronts; territories are
// captured by grinding the garrison to zero and holding. Nation-fall triggers
// a finite counteroffensive wave. Deterministic, fast-forwardable, no supply.

import { LINES, BALANCE, RESEARCH } from './content';
import { unitPower, devPerSec as devSec } from './economy';
import { gridToWorld } from '../render/board/gen';
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
  let p = 0;
  for (let i = 0; i < LINES.length; i++) p += gs.lines[i].army * unitPower(gs, i);
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
  if (fronts.length === 0) return [];

  // Split army power into routed (lines with a SEND HERE target) and auto.
  let autoPower = 0;
  const routed: { power: number; x: number; z: number }[] = [];
  for (let i = 0; i < LINES.length; i++) {
    const ls = gs.lines[i];
    if (ls.army <= 0) continue;
    const p = ls.army * unitPower(gs, i);
    if (ls.target) routed.push({ power: p, x: ls.target.x, z: ls.target.z });
    else autoPower += p;
  }

  let totalG = 0;
  const cents: Record<number, { x: number; z: number }> = {};
  for (const tid of fronts) {
    const g = ensureGarrison(board, gs, tid);
    totalG += Math.max(g, 1);
    const t = board.territories.find(q => q.id === tid)!;
    cents[tid] = gridToWorld(t.cx, t.cy);
  }
  const committedByTid: Record<number, number> = {};
  for (const tid of fronts) {
    const share = totalG > 0 ? Math.max(gs.garrisons[tid], 1) / totalG : 1 / fronts.length;
    committedByTid[tid] = autoPower * share;
  }
  // Routed power reinforces the front nearest each line's flag.
  for (const r of routed) {
    let best = fronts[0], bd = Infinity;
    for (const tid of fronts) {
      const c = cents[tid];
      const d = (c.x - r.x) ** 2 + (c.z - r.z) ** 2;
      if (d < bd) { bd = d; best = tid; }
    }
    committedByTid[best] += r.power;
  }

  return fronts.map(tid => {
    const t = board.territories.find(q => q.id === tid)!;
    const g = gs.garrisons[tid];
    return {
      tid,
      garrison: g,
      strength: t.strength,
      committed: committedByTid[tid],
      progress: t.strength > 0 ? 1 - g / t.strength : 1,
      holding: g <= 0,
      holdLeft: g <= 0 ? Math.max(0, WAR.HOLD_SECONDS - (gs.holdTimers[tid] ?? 0)) : WAR.HOLD_SECONDS
    };
  });
}

export function warTick(board: Board, gs: GameState, dt: number, events: GameEvent[]): void {
  const fronts = frontInfos(board, gs);
  const P = armyPower(gs);

  // — Your army takes damage: garrison bite + wave bite + friction —
  let incoming = P * WAR.SELF_ATTRITION * dt;
  for (const f of fronts) incoming += Math.max(0, f.garrison) * WAR.GARRISON_BITE * dt;
  if (gs.wave) incoming += gs.wave.power * WAR.WAVE_BITE * dt;
  if (incoming > 0 && P > 0) {
    let damage = incoming;
    for (let i = 0; i < LINES.length && damage > 0; i++) {
      const ls = gs.lines[i];
      if (ls.army <= 0) continue;
      const up = unitPower(gs, i);
      const poolPower = ls.army * up;
      const spent = Math.min(poolPower, damage);
      ls.army -= spent / up;
      gs.stats.unitsLost += spent / up;
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

  // — R&D: engineers pour capacity into the active program —
  if (gs.activeResearch) {
    const def = RESEARCH.find(r => r.id === gs.activeResearch);
    if (!def || gs.completedResearch.includes(def.id)) {
      gs.activeResearch = null;
      gs.researchProgress = 0;
    } else {
      gs.researchProgress += devSec(gs) * dt;
      if (gs.researchProgress >= def.cost) {
        gs.completedResearch.push(def.id);
        gs.activeResearch = null;
        gs.researchProgress = 0;
        events.push({ type: 'researchDone', id: def.id });
      }
    }
  }
  // Capability cooldowns tick down (offline too).
  for (const k of Object.keys(gs.cooldowns)) {
    gs.cooldowns[k] = Math.max(0, gs.cooldowns[k] - dt);
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

// ————— Callable strikes —————
// Damage scales with your army (a strike is your whole apparatus focused for a
// moment). Hits garrisons near the tap point; LIGHT DRIZZLE hits everything.
export function applyStrike(board: Board, gs: GameState, kind: string, wx: number, wz: number): boolean {
  const def = RESEARCH.find(r => r.id === kind);
  if (!def || !gs.completedResearch.includes(kind)) return false;
  if ((gs.cooldowns[kind] ?? 0) > 0) return false;
  const P = Math.max(armyPower(gs), 50);
  const spec = kind === 'thunderclap' ? { dmg: 0.6 * P, radius: 26 }
    : kind === 'skyfall' ? { dmg: 1.6 * P, radius: 40 }
    : { dmg: 3 * P, radius: Infinity };  // weather: everywhere
  const fronts = activeFronts(board, gs);
  let hit = false;
  for (const tid of fronts) {
    const t = board.territories.find(q => q.id === tid)!;
    const c = gridToWorld(t.cx, t.cy);
    const d = Math.hypot(c.x - wx, c.z - wz);
    if (d > spec.radius) continue;
    ensureGarrison(board, gs, tid);
    gs.garrisons[tid] = Math.max(0, gs.garrisons[tid] - spec.dmg / Math.max(1, fronts.length * (spec.radius === Infinity ? 1 : 0.4)));
    hit = true;
  }
  if (gs.wave) { gs.wave.power = Math.max(0, gs.wave.power - spec.dmg * 0.5); hit = true; }
  if (hit) gs.cooldowns[kind] = def.cooldown ?? 120;
  return hit;
}
