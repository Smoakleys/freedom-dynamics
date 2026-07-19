// News chyron: scrolling ticker mixing static headlines with reactive ones.

import { CHYRON_STATIC, CHYRON_REACTIVE, LINES, capturedName } from '../game/content';
import { fmt } from '../game/format';
import type { Board } from '../render/board/gen';
import type { GameState, GameEvent } from '../game/state';

export class Chyron {
  private queue: string[] = [];
  private staticPool: string[] = [];
  private el: HTMLElement;
  private track: HTMLElement;
  private x = 0;
  private textWidth = 0;
  board: Board | null = null;

  constructor() {
    this.track = document.getElementById('chyron-track')!;
    this.el = document.getElementById('chyron-text')!;
    this.next();
  }

  private pull(): string {
    if (this.queue.length > 0) return this.queue.shift()!;
    if (this.staticPool.length === 0) {
      this.staticPool = [...CHYRON_STATIC].sort(() => Math.random() - 0.5);
    }
    return this.staticPool.pop()!;
  }

  private next(): void {
    const items = [this.pull(), this.pull(), this.pull()];
    this.el.textContent = items.join('   •••   ');
    this.x = this.track.clientWidth + 10;
    this.el.style.transform = `translateX(${this.x}px)`;
    this.textWidth = this.el.clientWidth;
  }

  push(headline: string): void {
    this.queue.push(headline.toUpperCase());
  }

  onEvents(gs: GameState, events: GameEvent[]): void {
    const b = this.board;
    for (const e of events) {
      if (e.type === 'territoryWon' && b) {
        const t = b.territories.find(q => q.id === e.tid);
        if (!t) continue;
        this.push(pick(CHYRON_REACTIVE.territoryWon)
          .replace('{SECTOR}', t.name)
          .replace('{RENAMED}', capturedName(gs.company, e.tid))
          .replace('{ADVERSARY}', b.nations[t.nation].adversaryName));
      } else if (e.type === 'waveStarted' && b) {
        this.push(pick(CHYRON_REACTIVE.waveStarted).replace(/\{NATION\}/g, b.nations[e.nation].name));
      } else if (e.type === 'nationFell' && b) {
        this.push(pick(CHYRON_REACTIVE.nationFell).replace(/\{NATION\}/g, b.nations[e.nation].name));
      } else if (e.type === 'milestone') {
        this.push(pick(CHYRON_REACTIVE.milestone).replace('{LINE}', LINES[e.line].name));
      } else if (e.type === 'firstUnit') {
        this.push(`FIRST ${LINES[e.line].unitPlural} REACH THE FRONT; CROWD GOES MILD`);
      }
    }
  }

  pushBuy(gs: GameState, line: number, owned: number): void {
    if (owned % 100 === 0 || owned === 25 || owned === 50) {
      this.push(pick(CHYRON_REACTIVE.buy)
        .replace('{COMPANY}', gs.company)
        .replace('{N}', fmt(owned))
        .replace('{UNIT}', LINES[line].unitName)
        .replace('{UNITS}', LINES[line].unitPlural));
    }
  }

  pushHire(gs: GameState, line: number): void {
    const h = LINES[line].hire;
    this.push(pick(CHYRON_REACTIVE.hire)
      .replace('{COMPANY}', gs.company)
      .replace('{HIRE}', `${h.name} (${h.title})`));
  }

  update(dt: number): void {
    this.x -= dt * 55;
    this.el.style.transform = `translateX(${this.x}px)`;
    if (this.x < -this.textWidth - 20) this.next();
  }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
