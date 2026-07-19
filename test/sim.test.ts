// Living War sim test suite — deterministic, no DOM (localStorage stubbed).
import { describe, it, expect, beforeAll } from 'vitest';
import { generateBoard, gridToWorld, GRID_W, GRID_H } from '../src/render/board/gen';
import { newGame, type GameState } from '../src/game/state';
import { bindBoard, tick, fastForward } from '../src/game/sim';
import { warTick, frontInfos, activeFronts, applyStrike, armyPower } from '../src/game/war';
import { unitPower, devPerSec, engineerCost, availableResearch, lineUnlocked } from '../src/game/economy';
import { LINES, RESEARCH } from '../src/game/content';
import { load, save } from '../src/game/save';

// localStorage stub for node.
const store = new Map<string, string>();
beforeAll(() => {
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); }
  };
});

function freshWar(armies: number[] = [2000, 500, 200, 100, 20, 8, 4, 1, 0]) {
  const gs = newGame();
  gs.founded = true;
  gs.company = 'Test Dynamics';
  for (let i = 0; i < armies.length && i < LINES.length; i++) {
    gs.lines[i].army = armies[i];
    gs.lines[i].owned = Math.max(1, Math.floor(armies[i] / 10));
    gs.lines[i].hired = true;
  }
  const board = generateBoard(gs.worldSeed);
  bindBoard(board, gs);
  return { gs, board };
}

describe('world generation', () => {
  it('is deterministic for the same seed', () => {
    const a = generateBoard(1), b = generateBoard(1);
    let ha = 0, hb = 0;
    for (let i = 0; i < a.labels.length; i += 97) { ha = (ha * 31 + a.labels[i]) | 0; hb = (hb * 31 + b.labels[i]) | 0; }
    expect(ha).toBe(hb);
    expect(a.territories.length).toBe(b.territories.length);
    expect(a.homeNation).toBe(b.homeNation);
  });

  it('produces a playable continent', () => {
    const b = generateBoard(1);
    expect(b.territories.length).toBeGreaterThan(35);
    expect(b.nations.length).toBeGreaterThanOrEqual(6);
    const home = b.territories.filter(t => t.nation === b.homeNation);
    expect(home.length).toBeGreaterThanOrEqual(4);
    // Every territory connects to the graph (no orphan islands in the war).
    for (const t of b.territories) expect(t.neighbors.size).toBeGreaterThan(0);
    // Labels stay in range.
    expect(b.labels.length).toBe(GRID_W * GRID_H);
  });

  it('gives deeper territories stronger garrisons', () => {
    const b = generateBoard(1);
    const home = new Set(b.territories.filter(t => t.nation === b.homeNation).map(t => t.id));
    const frontier = b.territories.filter(t => !home.has(t.id) && [...t.neighbors].some(n => home.has(n)));
    const deep = b.territories.filter(t => !home.has(t.id) && ![...t.neighbors].some(n => home.has(n)));
    const avgF = frontier.reduce((s, t) => s + t.strength, 0) / frontier.length;
    const avgD = deep.reduce((s, t) => s + t.strength, 0) / deep.length;
    expect(avgD).toBeGreaterThan(avgF);
  });
});

describe('the living war', () => {
  it('binds the homeland on first contact', () => {
    const { gs, board } = freshWar();
    const home = board.territories.filter(t => t.nation === board.homeNation);
    expect(gs.owned.length).toBe(home.length);
  });

  it('opens fronts on every border and spreads force', () => {
    const { gs, board } = freshWar();
    const fronts = frontInfos(board, gs);
    expect(fronts.length).toBeGreaterThan(0);
    const total = fronts.reduce((s, f) => s + f.committed, 0);
    expect(total).toBeGreaterThan(armyPower(gs) * 0.95);
  });

  it('SEND HERE routes a line to the nearest front', () => {
    const { gs, board } = freshWar();
    const fronts = activeFronts(board, gs);
    const target = board.territories.find(t => t.id === fronts[0])!;
    const w = gridToWorld(target.cx, target.cy);
    gs.lines[0].target = { x: w.x, z: w.z };
    const infos = frontInfos(board, gs);
    const routed = infos.find(f => f.tid === fronts[0])!;
    // Line 0's full power should be sitting on the flagged front.
    expect(routed.committed).toBeGreaterThanOrEqual(gs.lines[0].army * unitPower(gs, 0) * 0.99);
  });

  it('grinds, holds 60s, and flips territories; rent flows', () => {
    const { gs, board } = freshWar();
    const before = gs.owned.length;
    for (let i = 0; i < 300; i++) warTick(board, gs, 1, []);
    expect(gs.owned.length).toBeGreaterThan(before);
    expect(gs.rentPerSec).toBeGreaterThan(0);
    expect(gs.funds).toBeGreaterThan(0);
  });

  it('eventually fells a nation and fires its final wave', () => {
    const { gs, board } = freshWar([100000, 20000, 8000, 4000, 800, 300, 100, 20, 0]);
    const events: import('../src/game/state').GameEvent[] = [];
    for (let i = 0; i < 4000 && gs.fallenNations.length === 0; i++) warTick(board, gs, 1, events);
    expect(gs.fallenNations.length).toBeGreaterThan(0);
    expect(events.some(e => e.type === 'waveStarted')).toBe(true);
  });

  it('never NaNs or loses owned land over a long offline run', () => {
    const { gs } = freshWar();
    const ownedBefore = gs.owned.length;
    const rep = fastForward(gs, 3600 * 8);
    expect(Number.isFinite(gs.funds)).toBe(true);
    expect(Number.isFinite(armyPower(gs))).toBe(true);
    expect(gs.owned.length).toBeGreaterThanOrEqual(ownedBefore);
    expect(rep.seconds).toBe(3600 * 8);
  });

  it('offline fast-forward is deterministic', () => {
    const a = freshWar(); const b = freshWar();
    fastForward(a.gs, 1800); fastForward(b.gs, 1800);
    expect(a.gs.funds).toBeCloseTo(b.gs.funds, 6);
    expect(a.gs.owned.length).toBe(b.gs.owned.length);
  });
});

describe('R&D and strikes', () => {
  it('engineers generate capacity and research completes', () => {
    const { gs, board } = freshWar();
    gs.engineers = 100;
    expect(devPerSec(gs)).toBeGreaterThan(1);
    gs.activeResearch = 'armor1';
    const p0 = unitPower(gs, 0);
    const events: import('../src/game/state').GameEvent[] = [];
    for (let i = 0; i < 120 && gs.activeResearch; i++) warTick(board, gs, 1, events);
    expect(gs.completedResearch).toContain('armor1');
    expect(events.some(e => e.type === 'researchDone')).toBe(true);
    expect(unitPower(gs, 0)).toBeGreaterThan(p0);
  });

  it('engineer cost curve rises', () => {
    const gs = newGame();
    const c1 = engineerCost(gs, 1);
    gs.engineers = 10;
    expect(engineerCost(gs, 1)).toBeGreaterThan(c1);
  });

  it('research gates respect prerequisites and unlock the mech line', () => {
    const gs = newGame();
    expect(availableResearch(gs).map(r => r.id)).not.toContain('armor2');
    expect(lineUnlocked(gs, 8)).toBe(false);
    gs.completedResearch = ['mech'];
    expect(lineUnlocked(gs, 8)).toBe(true);
  });

  it('strikes damage garrisons and start cooldowns', () => {
    const { gs, board } = freshWar();
    gs.completedResearch = ['thunderclap'];
    const fronts = activeFronts(board, gs);
    const t = board.territories.find(q => q.id === fronts[0])!;
    const w = gridToWorld(t.cx, t.cy);
    frontInfos(board, gs); // ensure garrisons initialized
    const g0 = gs.garrisons[t.id];
    const ok = applyStrike(board, gs, 'thunderclap', w.x, w.z);
    expect(ok).toBe(true);
    expect(gs.garrisons[t.id]).toBeLessThan(g0);
    expect(gs.cooldowns['thunderclap']).toBeGreaterThan(0);
    // Cooldown blocks refire.
    expect(applyStrike(board, gs, 'thunderclap', w.x, w.z)).toBe(false);
  });
});

describe('save migration', () => {
  it('migrates a v2 save, keeping economy and total wins', () => {
    const v2 = {
      version: 2, company: 'Old Corp', funds: 5000, lifetimeEarnings: 9999, lobbyingPower: 3,
      fiscalYear: 2, sector: 7, front: 0.5, sectorsWonTotal: 7,
      lines: LINES.slice(0, 8).map(() => ({ owned: 5, hired: true, progress: 0, running: false, army: 10, delivered: 100 })),
      lastSeen: Date.now(), founded: true,
      stats: { unitsLost: 42, daysWonOffline: 0, earnedOffline: 0 }
    };
    store.set('freedom-dynamics-save-v1', JSON.stringify(v2));
    const gs = load()!;
    expect(gs).not.toBeNull();
    expect(gs.company).toBe('Old Corp');
    expect(gs.funds).toBe(5000);
    expect(gs.territoriesWonTotal).toBe(7);
    expect(gs.owned.length).toBe(0);          // map restarts
    expect(gs.lines[0].target).toBeNull();    // new fields defaulted
    expect(gs.engineers).toBe(0);
  });

  it('round-trips a v4 save', () => {
    const gs = newGame();
    gs.company = 'RT Corp';
    gs.engineers = 7;
    gs.completedResearch = ['armor1'];
    gs.lines[2].target = { x: 5, z: -10 };
    save(gs);
    const back = load()!;
    expect(back.company).toBe('RT Corp');
    expect(back.engineers).toBe(7);
    expect(back.completedResearch).toContain('armor1');
    expect(back.lines[2].target).toEqual({ x: 5, z: -10 });
  });
});

describe('content sanity', () => {
  it('every research id referenced exists', () => {
    const ids = new Set(RESEARCH.map(r => r.id));
    for (const r of RESEARCH) if (r.requires) expect(ids.has(r.requires)).toBe(true);
    for (const L of LINES) if (L.research) expect(ids.has(L.research)).toBe(true);
  });
});
