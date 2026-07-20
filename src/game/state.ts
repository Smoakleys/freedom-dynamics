// Central game state — plain JSON-serializable data, no class instances.

import { LINES } from './content';

export interface LineState {
  owned: number;
  hired: boolean;
  progress: number;      // 0..1 batch progress
  running: boolean;      // a manual batch is in flight
  army: number;          // fielded units currently surviving at the fronts
  delivered: number;     // lifetime units delivered
  target: { x: number; z: number } | null;  // SEND HERE destination (world coords)
}

export interface Stats {
  unitsLost: number;
  damageDealt: number;
  damageTaken: number;
  daysWonOffline: number;
  earnedOffline: number;
}

export interface WaveState {
  nation: number;
  power: number;
  initial: number;
}

export interface GameState {
  version: number;
  company: string;
  funds: number;
  lifetimeEarnings: number;
  lobbyingPower: number;          // dormant — prestige is a design placeholder
  worldSeed: number;
  owned: number[];                // captured/held territory ids (includes homeland)
  garrisons: Record<number, number>;
  holdTimers: Record<number, number>;
  captureStamp: number;           // bumps on every ownership change (cache key)
  fallenNations: number[];
  wave: WaveState | null;
  rentPerSec: number;
  territoriesWonTotal: number;
  engineers: number;
  activeResearch: string | null;
  researchProgress: number;
  completedResearch: string[];
  cooldowns: Record<string, number>;
  lines: LineState[];
  lastSeen: number;
  founded: boolean;
  stats: Stats;
}

export function newLineState(): LineState {
  return { owned: 0, hired: false, progress: 0, running: false, army: 0, delivered: 0, target: null };
}

export function newGame(): GameState {
  const lines = LINES.map(() => newLineState());
  lines[0].owned = 1; // the company begins with one proud refurbished-rifle line
  return {
    version: 4,
    company: '',
    funds: 0,
    lifetimeEarnings: 0,
    lobbyingPower: 0,
    worldSeed: 1,
    owned: [],            // homeland territories are granted on first board bind
    garrisons: {},
    holdTimers: {},
    captureStamp: 0,
    fallenNations: [],
    wave: null,
    rentPerSec: 0,
    territoriesWonTotal: 0,
    engineers: 0,
    activeResearch: null,
    researchProgress: 0,
    completedResearch: [],
    cooldowns: {},
    lines,
    lastSeen: Date.now(),
    founded: false,
    stats: { unitsLost: 0, damageDealt: 0, damageTaken: 0, daysWonOffline: 0, earnedOffline: 0 }
  };
}

// Events emitted by the sim for UI/chyron/AAR consumption.
export type GameEvent =
  | { type: 'delivered'; line: number; count: number; revenue: number }
  | { type: 'territoryWon'; tid: number; bond: number }
  | { type: 'waveStarted'; nation: number }
  | { type: 'nationFell'; nation: number }
  | { type: 'milestone'; line: number; threshold: number }
  | { type: 'researchDone'; id: string }
  | { type: 'firstUnit'; line: number };
