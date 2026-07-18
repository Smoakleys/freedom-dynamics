// News chyron: scrolling ticker mixing static headlines with reactive ones.

import { CHYRON_STATIC, CHYRON_REACTIVE, adversaryName, LINES } from '../game/content';
import { fmt } from '../game/format';
import type { GameState, GameEvent } from '../game/state';

export class Chyron {
  private queue: string[] = [];
  private staticPool: string[] = [];
  private el: HTMLElement;
  private track: HTMLElement;
  private x = 0;
  private textWidth = 0;

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
    // Show three headlines per scroll pass so the strip never feels empty.
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
    for (const e of events) {
      if (e.type === 'dayWon') {
        this.push(pick(CHYRON_REACTIVE.dayWon)
          .replace('{DAY}', String(e.day))
          .replace('{ADVERSARY}', adversaryName(e.day)));
      } else if (e.type === 'newDay') {
        this.push(pick(CHYRON_REACTIVE.newDay)
          .replace(/\{DAY\}/g, String(e.day))
          .replace('{ADVERSARY}', adversaryName(e.day)));
      } else if (e.type === 'milestone') {
        this.push(pick(CHYRON_REACTIVE.milestone).replace('{LINE}', LINES[e.line].name));
      } else if (e.type === 'firstUnit') {
        this.push(`FIRST ${LINES[e.line].unitPlural} REACH FRONT; CROWD GOES MILD`);
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
