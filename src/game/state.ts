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
  sector: number;             // index of the sector currently being contested
  front: number;              // 0..1 progress through the contested sector
  sectorsWonTotal: number;
  lines: LineState[];
  lastSeen: number;           // epoch ms of last save
  founded: boolean;
  stats: Stats;
}

export function newLineState(): LineState {
  return { owned: 0, hired: false, progress: 0, running: false, army: 0, delivered: 0 };
}

export function newGame(): GameState {
  const lines = LINES.map(() => newLineState());
  lines[0].owned = 1; // the company begins with one proud refurbished-rifle line
  return {
    version: 2,
    company: '',
    funds: 0,
    lifetimeEarnings: 0,
    lobbyingPower: 0,
    fiscalYear: 1,
    sector: 0,
    front: 0.15,
    sectorsWonTotal: 0,
    lines,
    lastSeen: Date.now(),
    founded: false,
    stats: { unitsLost: 0, daysWonOffline: 0, earnedOffline: 0 }
  };
}

// The front's absolute position along the theater's advance axis, in world units.
export function advanceX(gs: GameState, spacing: number): number {
  return (gs.sector + gs.front) * spacing;
}

// Events emitted by the sim for UI/chyron/AAR consumption.
export type GameEvent =
  | { type: 'delivered'; line: number; count: number; revenue: number }
  | { type: 'sectorWon'; sector: number; bond: number }
  | { type: 'newSector'; sector: number }
  | { type: 'milestone'; line: number; threshold: number }
  | { type: 'firstUnit'; line: number };
