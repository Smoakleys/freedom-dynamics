import './ui/styles.css';
import { newGame, type GameState } from './game/state';
import { load, save } from './game/save';
import { tick, fastForward, bindBoard } from './game/sim';
import { frontInfos, applyStrike } from './game/war';
import { generateBoard } from './render/board/gen';
import { UI } from './ui/ui';
import { BoardView } from './render/boardview';

const gs: GameState = load() ?? newGame();

// The world is deterministic from its seed — same board every session.
const board = generateBoard(gs.worldSeed);
bindBoard(board, gs);

// Offline catch-up before anything renders.
const awaySeconds = (Date.now() - gs.lastSeen) / 1000;
const report = gs.founded && awaySeconds > 60 ? fastForward(gs, awaySeconds) : null;

const ui = new UI(gs);
ui.board = board;
ui.chyron.board = board;
const battlefield = new BoardView(document.getElementById('battle-canvas') as HTMLCanvasElement, gs, board);

// Quartermaster's hands: SEND HERE flags and callable strikes.
ui.onArmSend = (line) => {
  battlefield.armTap((w) => {
    gs.lines[line].target = w;
    ui.armedLine = -1;
    ui.refresh();
  });
};
ui.onArmStrike = (kind) => {
  battlefield.armTap((w) => {
    if (applyStrike(board, gs, kind, w.x, w.z)) {
      battlefield.strikeFx(kind, w);
    }
    ui.refresh();
  });
};

function hudInfo(): { title: string; sub: string; pct: number; label: string } {
  const fronts = frontInfos(board, gs);
  const total = board.territories.length;
  const held = gs.owned.length;
  const pct = held / Math.max(total, 1);
  if (gs.wave) {
    const n = board.nations[gs.wave.nation];
    return {
      title: `${n.name.toUpperCase()} — FINAL OFFENSIVE`,
      sub: `REPEL THE WAVE · ${Math.round((gs.wave.power / Math.max(gs.wave.initial, 1)) * 100)}% REMAINING`,
      pct,
      label: `EMPIRE — ${held}/${total} TERRITORIES · ${fronts.length} FRONTS`
    };
  }
  const hot = fronts.length > 0 ? fronts.reduce((a, b) => (b.committed > a.committed ? b : a)) : null;
  const t = hot ? board.territories.find(q => q.id === hot.tid) : null;
  const nation = t ? board.nations[t.nation] : null;
  return {
    title: t ? t.name.toUpperCase() : 'ALL QUIET',
    sub: t && nation ? `${fronts.length} FRONTS ACTIVE · vs ${nation.adversaryName.toUpperCase()}` : 'THE CONTINENT AWAITS',
    pct,
    label: `EMPIRE — ${held}/${total} TERRITORIES · ${gs.territoriesWonTotal} ANNEXED`
  };
}

function begin(): void {
  document.getElementById('splash')?.remove();
  if (report && (report.earned > 0 || report.territoriesWon > 0)) {
    ui.afterAction(report, () => { /* resume */ });
  }

  let last = performance.now();
  let acc = 0;
  let uiAcc = 0;
  let saveAcc = 0;
  const STEP = 0.25;

  function frame(now: number): void {
    const dt = Math.min((now - last) / 1000, 2);
    last = now;

    acc += dt;
    const events = [];
    while (acc >= STEP) {
      acc -= STEP;
      events.push(...tick(gs, STEP));
    }
    if (events.length) ui.onEvents(events);

    battlefield.update(gs, dt, events, now / 1000);
    ui.chyron.update(dt);
    ui.frame(hudInfo());

    uiAcc += dt;
    if (uiAcc > 0.3) { uiAcc = 0; ui.refresh(); }
    saveAcc += dt;
    if (saveAcc > 10) { saveAcc = 0; save(gs); }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

if (!gs.founded) {
  document.getElementById('splash')?.remove();
  ui.founding((name) => {
    gs.company = name;
    gs.founded = true;
    save(gs);
    begin();
  });
} else {
  begin();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save(gs);
});
window.addEventListener('pagehide', () => save(gs));

// PWA service worker.
if ('serviceWorker' in navigator && !location.hostname.includes('localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* fine */ });
  });
}
