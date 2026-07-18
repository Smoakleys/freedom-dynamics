// Central game state — plain JSON-serializable data, no class instances.

import { LINES } from './content';

export interface LineState {
  owned: number;
  hired: boolean;
  progress: number;      // 0..1 batch progress
  running: boolean;      // a manual batch is in flight
  army: number;          // fielded units currently surviving at the front
  delivered: number;     // lifetime units delivered (this fiscal year)
}

export interface Stats {
  unitsLost: number;
  daysWonOffline: number;
  earnedOffline: number;
}

export interface GameState {
  version: number;
  company: string;
  funds: number;
  lifetimeEarnings: number;   // this fiscal year, for LP calc
  lobbyingPower: number;
  fiscalYear: number;
  day: number;
  front: number;              // 0..1 front-line position
  daysWonTotal: number;
  lines: LineState[];
  lastSeen: number;           // epoch ms of last save
  founded: boolean;
  stats: Stats;
}

export function newLineState(): LineState {
  return { owned: 0, hired: false, progress: 0, running: false, army: 0, delivered: 0 };
}

export function newGame(): GameState {
  return {
    version: 1,
    company: '',
    funds: 0,
    lifetimeEarnings: 0,
    lobbyingPower: 0,
    fiscalYear: 1,
    day: 1,
    front: 0.15,
    daysWonTotal: 0,
    lines: LINES.map(() => newLineState()),
    lastSeen: Date.now(),
    founded: false,
    stats: { unitsLost: 0, daysWonOffline: 0, earnedOffline: 0 }
  };
}

// Events emitted by the sim for UI/chyron/AAR consumption.
export type GameEvent =
  | { type: 'delivered'; line: number; count: number; revenue: number }
  | { type: 'dayWon'; day: number; bond: number }
  | { type: 'newDay'; day: number }
  | { type: 'milestone'; line: number; threshold: number }
  | { type: 'firstUnit'; line: number };
