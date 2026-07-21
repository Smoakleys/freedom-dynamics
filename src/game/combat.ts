// Deterministic formation combat. Units remain disposable production flow, but
// every class now owns real health, damage, rate, armor, range, exposure, and a
// battlefield role. No individual identity or veterancy is introduced.

import { LINES, type CombatRole } from './content';
import { unitPower } from './economy';
import type { GameState } from './state';

export interface UnitCombatStats {
  role: CombatRole;
  roleLabel: string;
  maxHealth: number;
  effectiveHealth: number;
  damage: number;
  fireRate: number;
  dps: number;
  range: number;
  speed: number;
  armor: number;
  exposure: number;
  capture: number;
}

export interface FormationCombat {
  dps: number;
  capturePower: number;
  suppression: number;
  supportBonus: number;
  reconBonus: number;
  combinedArmsBonus: number;
  contributions: number[];
}

export function unitCombatStats(gs: GameState, line: number): UnitCombatStats {
  const def = LINES[line];
  const profile = def.combat;
  const statScale = unitPower(gs, line) / Math.max(def.power, 1e-9);
  const maxHealth = profile.maxHealth * statScale;
  const armor = Math.min(0.75, Math.max(0, profile.armor));
  const damage = profile.damage * statScale;
  return {
    role: profile.role,
    roleLabel: profile.roleLabel,
    maxHealth,
    effectiveHealth: maxHealth / Math.max(0.25, 1 - armor),
    damage,
    fireRate: profile.fireRate,
    dps: damage * profile.fireRate,
    range: profile.range,
    speed: profile.speed,
    armor,
    exposure: profile.exposure,
    capture: profile.capture
  };
}

export function formationCombat(
  gs: GameState,
  unitsByLine: number[],
  target: 'garrison' | 'wave'
): FormationCombat {
  const has = (role: CombatRole) => unitsByLine.some((n, i) => n > 0.001 && LINES[i].combat.role === role);
  const supportUnits = unitsByLine.reduce((n, u, i) => n + (LINES[i].combat.role === 'support' ? u : 0), 0);
  const reconUnits = unitsByLine.reduce((n, u, i) => n + (LINES[i].combat.role === 'recon' ? u : 0), 0);
  const airUnits = unitsByLine.reduce((n, u, i) => n + (LINES[i].combat.role === 'air' ? u : 0), 0);
  const supportBonus = Math.min(0.18, Math.log1p(supportUnits) * 0.022);
  const reconBonus = Math.min(0.24, Math.log1p(reconUnits) * 0.028);
  const combinedArmsBonus = has('infantry') && (has('armor') || has('mech')) ? 0.1 : 0;
  const suppression = Math.min(0.18, Math.log1p(airUnits) * 0.025);
  const contributions = new Array(LINES.length).fill(0);
  let capturePower = 0;

  for (let i = 0; i < LINES.length; i++) {
    const units = Math.max(0, unitsByLine[i] ?? 0);
    if (units <= 0) continue;
    const profile = LINES[i].combat;
    const stats = unitCombatStats(gs, i);
    let mult = target === 'garrison' ? profile.vsGarrison : profile.vsWave;
    if (profile.role === 'infantry' || profile.role === 'armor' || profile.role === 'mech') {
      mult *= 1 + supportBonus + combinedArmsBonus;
    }
    if (profile.role === 'artillery' || profile.role === 'missile' || profile.role === 'air') {
      mult *= 1 + reconBonus;
    }
    contributions[i] = units * stats.dps * mult;
    capturePower += units * stats.capture * unitPower(gs, i);
  }

  return {
    dps: contributions.reduce((a, b) => a + b, 0),
    capturePower,
    suppression,
    supportBonus,
    reconBonus,
    combinedArmsBonus,
    contributions
  };
}

// Apply enemy damage to the classes actually committed to a front. Targeting
// weights favor exposed, high-output assets while standoff/orbital systems are
// difficult to reach. Armor and class health turn damage into real casualties.
export function applyFormationDamage(gs: GameState, unitsByLine: number[], rawDamage: number): number {
  let remaining = Math.max(0, rawDamage);
  if (remaining <= 0) return 0;
  const active = unitsByLine.map((allocated, line) => ({
    line,
    allocated: Math.min(Math.max(allocated, 0), gs.lines[line].army),
    stats: unitCombatStats(gs, line)
  })).filter(x => x.allocated > 1e-8);
  let applied = 0;

  // Two passes redistribute overflow after a fragile class is wiped out.
  for (let pass = 0; pass < 2 && remaining > 1e-8; pass++) {
    const live = active.filter(x => gs.lines[x.line].army > 1e-8);
    const totalWeight = live.reduce((sum, x) =>
      sum + Math.min(x.allocated, gs.lines[x.line].army) * x.stats.exposure * Math.sqrt(Math.max(x.stats.dps, 1)), 0);
    if (totalWeight <= 0) break;
    const passDamage = remaining;
    let spentThisPass = 0;
    for (const x of live) {
      const available = Math.min(x.allocated, gs.lines[x.line].army);
      const weight = available * x.stats.exposure * Math.sqrt(Math.max(x.stats.dps, 1));
      const share = passDamage * weight / totalWeight;
      const poolHealth = available * x.stats.effectiveHealth;
      const spent = Math.min(poolHealth, share);
      const lost = spent / Math.max(x.stats.effectiveHealth, 1e-9);
      gs.lines[x.line].army = Math.max(0, gs.lines[x.line].army - lost);
      unitsByLine[x.line] = Math.max(0, (unitsByLine[x.line] ?? 0) - lost);
      gs.stats.unitsLost += lost;
      spentThisPass += spent;
    }
    applied += spentThisPass;
    remaining -= spentThisPass;
    if (spentThisPass <= 1e-8) break;
  }
  gs.stats.damageTaken += applied;
  return applied;
}
