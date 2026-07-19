// Balance harness: simulates a semi-smart player and reports pacing.
// Run: npm test (included) — soft assertions keep pacing inside sane bounds.
import { describe, it, expect, beforeAll } from 'vitest';
import { generateBoard } from '../src/render/board/gen';
import { newGame } from '../src/game/state';
import { bindBoard, tick } from '../src/game/sim';
import { LINES, RESEARCH } from '../src/game/content';
import { bulkCost, hire, buy, engineerCost, lineUnlocked, availableResearch } from '../src/game/economy';

beforeAll(() => {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); }
  };
});

describe('pacing (simulated player)', () => {
  it('a fresh company reaches milestones on schedule', () => {
    const gs = newGame();
    gs.founded = true; gs.company = 'Pacing Test';
    const board = generateBoard(gs.worldSeed);
    bindBoard(board, gs);

    const RESEARCH_ORDER = ['armor1', 'retool1', 'thunderclap', 'armor2', 'mech', 'retool2', 'skyfall', 'weather'];
    let firstCapture = -1, firstNation = -1, mechAt = -1;
    const log: string[] = [];

    const HOURS = 12;
    for (let sec = 0; sec < HOURS * 3600; sec += 1) {
      // Player behavior every ~15 sim-seconds: tap idle lines, spend greedily.
      if (sec % 15 === 0) {
        for (let i = 0; i < LINES.length; i++) {
          const ls = gs.lines[i];
          if (ls.owned > 0 && !ls.hired && !ls.running) ls.running = true;
        }
        // Buy priority: hires → engineers (10% of funds) → best line units.
        for (let i = 0; i < LINES.length; i++) {
          if (gs.lines[i].owned > 0 && !gs.lines[i].hired && gs.funds > LINES[i].hire.cost * 2) hire(gs, i);
        }
        if (gs.funds * 0.1 > engineerCost(gs, 1)) {
          gs.funds -= engineerCost(gs, 1);
          gs.engineers += 1;
        }
        if (!gs.activeResearch) {
          const avail = availableResearch(gs).map(r => r.id);
          const next = RESEARCH_ORDER.find(id => avail.includes(id));
          if (next) gs.activeResearch = next;
        }
        for (let i = LINES.length - 1; i >= 0; i--) {
          if (!lineUnlocked(gs, i)) continue;
          const c = bulkCost(i, gs.lines[i].owned, 1);
          if (gs.funds > c * 1.5) buy(gs, i, 1);
        }
      }
      const events = tick(gs, 1);
      for (const e of events) {
        if (e.type === 'territoryWon' && firstCapture < 0) firstCapture = sec;
        if (e.type === 'nationFell' && firstNation < 0) firstNation = sec;
        if (e.type === 'researchDone' && e.id === 'mech' && mechAt < 0) mechAt = sec;
      }
      if (sec % 3600 === 0 && sec > 0) {
        log.push(`h${sec / 3600}: $${Math.round(gs.funds).toExponential(2)} | terr ${gs.owned.length} | nations ${gs.fallenNations.length} | eng ${gs.engineers} | R&D done ${gs.completedResearch.length}`);
      }
    }

    console.log('\n=== PACING REPORT (12 simulated hours, semi-smart player) ===');
    console.log(`first capture: ${firstCapture >= 0 ? (firstCapture / 60).toFixed(1) + ' min' : 'NEVER'}`);
    console.log(`first nation fell: ${firstNation >= 0 ? (firstNation / 3600).toFixed(2) + ' h' : 'NEVER'}`);
    console.log(`mech unlocked: ${mechAt >= 0 ? (mechAt / 3600).toFixed(2) + ' h' : 'NEVER'}`);
    log.forEach(l => console.log(l));

    // Soft bounds: idle pacing should land in these windows.
    expect(firstCapture).toBeGreaterThan(0);
    expect(firstCapture).toBeLessThan(45 * 60);            // first territory within 45 min
    expect(firstNation).toBeGreaterThan(0);                 // a nation falls within 12h
    expect(gs.owned.length).toBeGreaterThan(8);             // real expansion happened
    expect(Number.isFinite(gs.funds)).toBe(true);
  }, 120000);
});
