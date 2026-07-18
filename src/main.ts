import './ui/styles.css';
import { newGame, type GameState } from './game/state';
import { load, save } from './game/save';
import { tick, fastForward } from './game/sim';
import { UI, applyPrestige } from './ui/ui';
import { Battlefield } from './render/battlefield';
import { CHYRON_REACTIVE } from './game/content';

let gs: GameState = load() ?? newGame();

// Offline catch-up before anything renders.
const awaySeconds = (Date.now() - gs.lastSeen) / 1000;
const report = gs.founded && awaySeconds > 60 ? fastForward(gs, awaySeconds) : null;

const ui = new UI(gs);
const battlefield = new Battlefield(document.getElementById('battle-canvas') as HTMLCanvasElement);

ui.onPrestige = () => {
  gs = applyPrestige(gs);
  save(gs);
  ui.chyron.push(CHYRON_REACTIVE.prestige[Math.floor(Math.random() * CHYRON_REACTIVE.prestige.length)]
    .replace('{COMPANY}', gs.company));
  // Cheap full restart keeps every system consistent with the fresh state.
  location.reload();
};

function begin(): void {
  document.getElementById('splash')?.remove();
  if (report && (report.earned > 0 || report.daysWon > 0)) {
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
    ui.frame();

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
