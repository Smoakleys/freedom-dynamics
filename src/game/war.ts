// The Living War: multi-front territorial sim. Fronts emerge wherever owned
// land borders enemy land; forces auto-spread across fronts; territories are
// captured by grinding the garrison to zero and holding. Nation-fall triggers
// a finite counteroffensive wave. Deterministic, fast-forwardable, no supply.

import { LINES, BALANCE, RESEARCH } from './content';
import { unitPower, devPerSec as devSec } from './economy';
import { applyFormationDamage, formationCombat } from './combat';
import { unitCombatStats } from './combat';
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
  unitsByLine: number[]; // actual unit classes allocated to this front
  friendlyDps: number;   // class/role/synergy-aware damage per second
  capturePower: number;  // occupation ability after the garrison breaks
  suppression: number;   // air cover reducing incoming fire
  friendlyHealth: number;// surviving effective health physically at this front
  formationUnits: number;// actual unit count at this front
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

function emptyFormation(): number[] {
  return new Array(LINES.length).fill(0);
}

export function homeWorldCenter(board: Board): { x: number; z: number } {
  const home = board.territories.filter(t => t.nation === board.homeNation);
  // The visible HQ badge is anchored to the northernmost homeland province so
  // it remains above the mobile drawer. Dispatches must originate at that exact
  // landmark—not at an invisible average point elsewhere in the homeland.
  const hq = [...home].sort((a, b) => a.cy - b.cy)[0];
  return hq ? gridToWorld(hq.cx, hq.cy) : { x: 0, z: 0 };
}

function territoryWorld(board: Board, tid: number): { x: number; z: number } {
  const t = board.territories.find(q => q.id === tid);
  return t ? gridToWorld(t.cx, t.cy) : homeWorldCenter(board);
}

function nearestFront(board: Board, fronts: number[], point: { x: number; z: number }): number {
  let best = fronts[0], bestDistance = Infinity;
  for (const tid of fronts) {
    const c = territoryWorld(board, tid);
    const d = (c.x - point.x) ** 2 + (c.z - point.z) ** 2;
    if (d < bestDistance) { bestDistance = d; best = tid; }
  }
  return best;
}

// Persist actual class composition at each live front. Old saves and orphaned
// formations are deterministically redistributed; changing a line's DIRECT
// flag never moves formations already fighting.
export function ensureDeployments(board: Board, gs: GameState): void {
  const fronts = activeFronts(board, gs);
  if (fronts.length === 0) {
    gs.deployments = {};
    return;
  }
  const live = new Set(fronts);
  for (const [key, raw] of Object.entries(gs.deployments)) {
    const tid = Number(key);
    const safe = emptyFormation();
    if (Array.isArray(raw)) {
      for (let i = 0; i < LINES.length; i++) safe[i] = Math.max(0, Number(raw[i]) || 0);
    }
    if (live.has(tid)) gs.deployments[tid] = safe;
    else delete gs.deployments[tid];
  }
  for (const tid of fronts) gs.deployments[tid] ??= emptyFormation();

  for (let line = 0; line < LINES.length; line++) {
    const total = Math.max(0, gs.lines[line].army);
    let deployed = fronts.reduce((sum, tid) => sum + (gs.deployments[tid]?.[line] ?? 0), 0);
    if (deployed > total + 1e-8) {
      const scale = total / Math.max(deployed, 1e-9);
      for (const tid of fronts) gs.deployments[tid][line] *= scale;
      deployed = total;
    }
    const missing = total - deployed;
    if (missing <= 1e-8) continue;
    const target = gs.lines[line].target
      ? nearestFront(board, fronts, gs.lines[line].target!)
      : null;
    if (target !== null) {
      gs.deployments[target][line] += missing;
      continue;
    }
    let totalPressure = 0;
    for (const tid of fronts) totalPressure += Math.max(ensureGarrison(board, gs, tid), 1);
    for (const tid of fronts) {
      const share = Math.max(gs.garrisons[tid], 1) / Math.max(totalPressure, 1);
      gs.deployments[tid][line] += missing * share;
    }
  }
}

export function reinforcementTarget(board: Board, gs: GameState, line: number): number | null {
  const fronts = activeFronts(board, gs);
  if (fronts.length === 0) return null;
  ensureDeployments(board, gs);
  const explicit = gs.lines[line].target;
  if (explicit) return nearestFront(board, fronts, explicit);
  // AUTO fills the front with the least friendly power relative to pressure.
  let best = fronts[0], bestScore = Infinity;
  for (const tid of fronts) {
    const formation = gs.deployments[tid] ?? emptyFormation();
    const power = formation.reduce((sum, units, i) => sum + units * unitPower(gs, i), 0);
    const score = power / Math.max(ensureGarrison(board, gs, tid), 1);
    if (score < bestScore) { bestScore = score; best = tid; }
  }
  return best;
}

export function queueReinforcement(
  board: Board,
  gs: GameState,
  line: number,
  count: number,
  events: GameEvent[]
): void {
  const targetTid = reinforcementTarget(board, gs, line);
  if (targetTid === null) {
    // No war remains; completed hardware stays in the homeland reserve.
    gs.lines[line].army += count;
    return;
  }
  const from = homeWorldCenter(board);
  const to = territoryWorld(board, targetTid);
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const role = LINES[line].combat.role;
  const travelSpeed = Math.max(LINES[line].combat.speed, role === 'orbital' ? 40 : 1);
  const duration = role === 'orbital' ? 2.5
    : role === 'missile' ? Math.max(3, distance / 18)
    : role === 'air' ? Math.max(4, distance / 13)
    : Math.min(24, Math.max(4, distance / (3.2 + travelSpeed)));
  // Very fast lines aggregate batches into a single visible convoy instead of
  // producing hundreds of save objects per minute.
  const merge = gs.reinforcements.find(w => w.line === line && w.targetTid === targetTid && w.progress < 0.18);
  if (merge) {
    merge.count += count;
    events.push({ type: 'reinforcementDispatched', id: merge.id, line, count, targetTid, eta: (1 - merge.progress) * merge.duration });
    return;
  }
  const id = gs.nextReinforcementId++;
  gs.reinforcements.push({ id, line, count, targetTid, from, to, progress: 0, duration });
  events.push({ type: 'reinforcementDispatched', id, line, count, targetTid, eta: duration });
}

export function reinforcementTick(board: Board, gs: GameState, dt: number, events: GameEvent[]): void {
  if (gs.reinforcements.length === 0) return;
  const fronts = activeFronts(board, gs);
  for (let i = gs.reinforcements.length - 1; i >= 0; i--) {
    const wave = gs.reinforcements[i];
    wave.progress = Math.min(1, wave.progress + dt / Math.max(wave.duration, 0.25));
    if (wave.progress < 1) continue;
    let targetTid = wave.targetTid;
    if (fronts.length > 0 && !fronts.includes(targetTid)) targetTid = nearestFront(board, fronts, wave.to);
    gs.lines[wave.line].army += wave.count;
    if (fronts.length > 0) {
      gs.deployments[targetTid] ??= emptyFormation();
      gs.deployments[targetTid][wave.line] += wave.count;
    }
    events.push({ type: 'reinforcementArrived', id: wave.id, line: wave.line, count: wave.count, targetTid });
    gs.reinforcements.splice(i, 1);
  }
}

export function frontInfos(board: Board, gs: GameState): FrontInfo[] {
  const fronts = activeFronts(board, gs);
  if (fronts.length === 0) return [];
  ensureDeployments(board, gs);
  for (const tid of fronts) {
    ensureGarrison(board, gs, tid);
  }

  return fronts.map(tid => {
    const t = board.territories.find(q => q.id === tid)!;
    const g = gs.garrisons[tid];
    const unitsByLine = gs.deployments[tid];
    const formation = formationCombat(gs, unitsByLine, 'garrison');
    return {
      tid,
      garrison: g,
      strength: t.strength,
      committed: unitsByLine.reduce((sum, units, i) => sum + units * unitPower(gs, i), 0),
      unitsByLine,
      friendlyDps: formation.dps,
      capturePower: formation.capturePower,
      suppression: formation.suppression,
      friendlyHealth: unitsByLine.reduce((sum, units, i) => sum + units * unitCombatStats(gs, i).effectiveHealth, 0),
      formationUnits: unitsByLine.reduce((sum, units) => sum + units, 0),
      progress: t.strength > 0 ? 1 - g / t.strength : 1,
      holding: g <= 0,
      holdLeft: g <= 0 ? Math.max(0, WAR.HOLD_SECONDS - (gs.holdTimers[tid] ?? 0)) : WAR.HOLD_SECONDS
    };
  });
}

export function warTick(board: Board, gs: GameState, dt: number, events: GameEvent[]): void {
  const fronts = frontInfos(board, gs);

  // — Your army takes damage: garrison bite + wave bite + friction —
  for (const f of fronts) {
    const garrisonFire = Math.max(0, f.garrison) * WAR.GARRISON_BITE * (1 - f.suppression);
    const friction = f.committed * WAR.SELF_ATTRITION;
    applyFormationDamage(gs, f.unitsByLine, (garrisonFire + friction) * dt);
  }
  if (gs.wave && fronts.length > 0) {
    let target = fronts.find(f => f.tid === gs.wave!.targetTid);
    if (!target) {
      const oldTarget = territoryWorld(board, gs.wave.targetTid);
      gs.wave.targetTid = nearestFront(board, fronts.map(f => f.tid), oldTarget);
      target = fronts.find(f => f.tid === gs.wave!.targetTid)!;
    }
    applyFormationDamage(gs, target.unitsByLine, gs.wave.power * WAR.WAVE_BITE * (1 - target.suppression) * dt);
  }

  // — The wave soaks your offensive power before territories do —
  let offenseFactor = 1;
  if (gs.wave) {
    const target = fronts.find(f => f.tid === gs.wave!.targetTid);
    const waveFormation = formationCombat(gs, target?.unitsByLine ?? emptyFormation(), 'wave');
    const grind = Math.min(gs.wave.power, waveFormation.dps * WAR.WAVE_DPS * dt);
    gs.wave.power -= grind;
    gs.stats.damageDealt += grind;
    offenseFactor = 0.35;
    if (gs.wave.power <= 0) {
      events.push({ type: 'nationFell', nation: gs.wave.nation });
      gs.wave = null;
    }
  }

  // — Grind garrisons, run hold timers, flip territories —
  for (const f of fronts) {
    if (!f.holding) {
      const localOffenseFactor = gs.wave && f.tid === gs.wave.targetTid ? offenseFactor : 1;
      const dmg = f.friendlyDps * WAR.YOUR_DPS * localOffenseFactor * dt;
      gs.garrisons[f.tid] = Math.max(0, f.garrison - dmg);
      gs.stats.damageDealt += Math.min(f.garrison, dmg);
      continue;
    }
    const occupationNeeded = Math.max(0.5, Math.sqrt(Math.max(f.strength, 1)) * 0.15);
    const occupied = f.capturePower >= occupationNeeded;
    gs.holdTimers[f.tid] = Math.max(0, (gs.holdTimers[f.tid] ?? 0) + (occupied ? dt : -dt * 2));
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
        const nextFronts = activeFronts(board, gs);
        const lastPoint = territoryWorld(board, t.id);
        const targetTid = nextFronts.length > 0 ? nearestFront(board, nextFronts, lastPoint) : t.id;
        gs.wave = { nation: t.nation, power: wavePower, initial: wavePower, targetTid };
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
    const before = gs.garrisons[tid];
    gs.garrisons[tid] = Math.max(0, before - spec.dmg / Math.max(1, fronts.length * (spec.radius === Infinity ? 1 : 0.4)));
    gs.stats.damageDealt += before - gs.garrisons[tid];
    hit = true;
  }
  if (gs.wave) {
    const before = gs.wave.power;
    gs.wave.power = Math.max(0, gs.wave.power - spec.dmg * 0.5);
    gs.stats.damageDealt += before - gs.wave.power;
    hit = true;
  }
  if (hit) gs.cooldowns[kind] = def.cooldown ?? 120;
  return hit;
}
