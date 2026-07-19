// DOM UI: war HUD, production drawer, modals, toasts.

import { LINES, randomCompanyName, AAR_EUPHEMISMS } from '../game/content';
import { bulkCost, maxAffordable, buy, hire, batchDuration, batchRevenue, nextMilestone } from '../game/economy';
import { fmt, fmtMoney, fmtDuration } from '../game/format';
import type { GameState, GameEvent } from '../game/state';
import type { OfflineReport } from '../game/sim';
import type { Board } from '../render/board/gen';
import { Chyron } from './chyron';

const ICONS = ['🪖', '🛻', '🛸', '🎯', '💥', '✈️', '🚀', '🛰️'];
type BuyMode = 1 | 10 | 100 | 'max';

interface Row {
  root: HTMLElement;
  buyBtn: HTMLButtonElement;
  runBtn: HTMLButtonElement;
  hireBtn: HTMLButtonElement;
  ownedEl: HTMLElement;
  statsEl: HTMLElement;
  fillEl: HTMLElement;
  hiredTag: HTMLElement;
}

export class UI {
  chyron: Chyron;
  private rows: Row[] = [];
  private buyMode: BuyMode = 1;
  private fundsEl!: HTMLElement;
  private dayEl!: HTMLElement;
  private advEl!: HTMLElement;
  private frontFill!: HTMLElement;
  private frontLabel!: HTMLElement;
  private toasts!: HTMLElement;
  board: Board | null = null;

  constructor(private gs: GameState) {
    this.buildShell();
    this.chyron = new Chyron();
    this.buildRows();
    this.setupDrag();
  }

  private buildShell(): void {
    const app = document.getElementById('app')!;
    app.innerHTML = `
      <div id="battle-pane">
        <canvas id="battle-canvas"></canvas>
        <div id="war-hud">
          <div class="hud-left">
            <div class="day-label" id="hud-day">DAY 1</div>
            <div class="adversary" id="hud-adv">vs THE ADVERSARY</div>
          </div>
          <div class="hud-right">
            <div class="funds" id="hud-funds">$0</div>
            <div class="funds-label" id="hud-funds-label">OPERATING FUNDS</div>
          </div>
        </div>
        <div id="front-bar-wrap">
          <div id="front-bar"><div id="front-fill"></div></div>
          <div id="front-label">FRONT LINE</div>
        </div>
        <div id="chyron">
          <span class="tag">LIVE</span>
          <div id="chyron-track"><span id="chyron-text"></span></div>
        </div>
      </div>
      <div id="drag-handle"></div>
      <div id="drawer">
        <div id="drawer-header">
          <div id="company-name"></div>
          <div id="buy-mult">
            <button data-mode="1" class="active">x1</button>
            <button data-mode="10">x10</button>
            <button data-mode="100">x100</button>
            <button data-mode="max">MAX</button>
          </div>
        </div>
        <div id="lines"></div>
      </div>
      <div id="toasts"></div>
    `;
    this.fundsEl = document.getElementById('hud-funds')!;
    this.dayEl = document.getElementById('hud-day')!;
    this.advEl = document.getElementById('hud-adv')!;
    this.frontFill = document.getElementById('front-fill')!;
    this.frontLabel = document.getElementById('front-label')!;
    this.toasts = document.getElementById('toasts')!;
    document.getElementById('company-name')!.textContent = this.gs.company || 'UNINCORPORATED';

    document.querySelectorAll('#buy-mult button').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#buy-mult button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const m = (b as HTMLElement).dataset.mode!;
        this.buyMode = m === 'max' ? 'max' : (Number(m) as BuyMode);
        this.refresh();
      });
    });
  }

  private buildRows(): void {
    const wrap = document.getElementById('lines')!;
    wrap.innerHTML = '';
    this.rows = [];
    LINES.forEach((L, i) => {
      const row = document.createElement('div');
      row.className = 'line-row';
      row.innerHTML = `
        <div class="line-top">
          <div class="line-icon">${ICONS[i]}<span class="line-owned">0</span></div>
          <div class="line-info">
            <div class="line-name">${L.name}</div>
            <div class="line-desc">${L.desc}</div>
            <div class="line-stats"></div>
          </div>
        </div>
        <div class="line-progress"><div class="line-progress-fill"></div></div>
        <div class="line-actions">
          <button class="btn btn-run">DELIVER<small></small></button>
          <button class="btn btn-buy">BUY<small></small></button>
          <button class="btn btn-hire">HIRE<small></small></button>
        </div>
      `;
      wrap.appendChild(row);
      const r: Row = {
        root: row,
        buyBtn: row.querySelector('.btn-buy') as HTMLButtonElement,
        runBtn: row.querySelector('.btn-run') as HTMLButtonElement,
        hireBtn: row.querySelector('.btn-hire') as HTMLButtonElement,
        ownedEl: row.querySelector('.line-owned') as HTMLElement,
        statsEl: row.querySelector('.line-stats') as HTMLElement,
        fillEl: row.querySelector('.line-progress-fill') as HTMLElement,
        hiredTag: document.createElement('span')
      };
      r.runBtn.addEventListener('click', () => {
        const ls = this.gs.lines[i];
        if (ls.owned > 0 && !ls.running && !ls.hired) { ls.running = true; this.refresh(); }
      });
      r.buyBtn.addEventListener('click', () => {
        const count = this.buyCount(i);
        const res = buy(this.gs, i, count);
        if (res) {
          if (res.first) this.toast(`${L.name} ONLINE — first ${L.unitName} inbound`);
          if (res.milestone) this.toast(`${L.name}: ${res.milestone} owned — output DOUBLED`);
          this.chyron.pushBuy(this.gs, i, this.gs.lines[i].owned);
          this.refresh();
        }
      });
      r.hireBtn.addEventListener('click', () => {
        if (hire(this.gs, i)) {
          this.toast(`HIRED: ${L.hire.name}, ${L.hire.title} — "${L.hire.bio}"`);
          this.chyron.pushHire(this.gs, i);
          this.refresh();
        }
      });
      this.rows.push(r);
    });
  }

  private buyCount(i: number): number {
    const ls = this.gs.lines[i];
    if (this.buyMode === 'max') return Math.max(1, maxAffordable(i, ls.owned, this.gs.funds));
    return this.buyMode;
  }

  // Cheap-to-run refresh of button states/costs — call a few times per second.
  refresh(): void {
    const gs = this.gs;
    for (let i = 0; i < LINES.length; i++) {
      const L = LINES[i], ls = gs.lines[i], r = this.rows[i];
      const count = this.buyCount(i);
      const cost = bulkCost(i, ls.owned, count);
      const affordable = gs.funds >= cost;
      const unlockable = ls.owned > 0 || gs.funds >= L.baseCost;

      r.root.classList.toggle('locked', ls.owned === 0 && !unlockable);
      r.root.classList.toggle('affordable-unlock', ls.owned === 0 && unlockable);
      r.ownedEl.textContent = fmt(ls.owned);

      const ms = nextMilestone(ls.owned);
      r.statsEl.textContent = ls.owned === 0
        ? `${fmtMoney(L.revenue)}/unit · power ${fmt(L.power)}`
        : `${fmtMoney(batchRevenue(gs, i))}/batch · ${fmtDuration(batchDuration(gs, i))}` + (ms ? ` · next x2 @ ${ms}` : '');

      r.buyBtn.disabled = !affordable || count === 0;
      (r.buyBtn.querySelector('small') as HTMLElement).textContent =
        `${this.buyMode === 'max' ? `x${count}` : `x${count}`} · ${fmtMoney(cost)}`;

      r.runBtn.style.display = ls.hired ? 'none' : '';
      r.runBtn.disabled = ls.owned === 0 || ls.running;
      (r.runBtn.querySelector('small') as HTMLElement).textContent =
        ls.owned === 0 ? '—' : ls.running ? 'IN TRANSIT' : `${fmt(ls.owned)} units`;

      if (ls.hired) {
        r.hireBtn.style.display = 'none';
      } else {
        r.hireBtn.style.display = '';
        r.hireBtn.disabled = gs.funds < L.hire.cost || ls.owned === 0;
        (r.hireBtn.querySelector('small') as HTMLElement).textContent =
          `${L.hire.name} · ${fmtMoney(L.hire.cost)}`;
      }
    }

    // (Prestige is a design placeholder — no fiscal-year button in the Living War.)
  }

  // Per-frame lightweight updates (funds counter, progress bars, front bar).
  frame(info?: { title: string; sub: string; pct: number; label: string }): void {
    const gs = this.gs;
    this.fundsEl.textContent = fmtMoney(gs.funds);
    const lbl = document.getElementById('hud-funds-label');
    if (lbl) lbl.textContent = gs.rentPerSec > 0.5 ? `FUNDS · RENT +${fmtMoney(gs.rentPerSec)}/S` : 'OPERATING FUNDS';
    if (info) {
      this.dayEl.textContent = info.title;
      this.advEl.textContent = info.sub;
      this.frontFill.style.width = `${(info.pct * 100).toFixed(1)}%`;
      this.frontLabel.textContent = info.label;
    }
    for (let i = 0; i < LINES.length; i++) {
      const ls = gs.lines[i];
      const fill = this.rows[i].fillEl;
      const dur = batchDuration(gs, i);
      if (ls.owned === 0) { fill.style.width = '0%'; continue; }
      if (dur < 0.35 && ls.hired) {
        fill.style.width = '100%';
        fill.classList.add('instant');
      } else {
        fill.classList.remove('instant');
        fill.style.width = `${Math.min(ls.progress * 100, 100)}%`;
      }
    }
  }

  onEvents(events: GameEvent[]): void {
    this.chyron.onEvents(this.gs, events);
    const b = this.board;
    for (const e of events) {
      if (e.type === 'territoryWon' && b) {
        const t = b.territories.find(q => q.id === e.tid);
        this.toast(`★ ${(t?.name ?? 'TERRITORY').toUpperCase()} ANNEXED — war bond ${fmtMoney(e.bond)}`);
      } else if (e.type === 'waveStarted' && b) {
        this.toast(`⚠ ${b.nations[e.nation].name.toUpperCase()} LAUNCHES ITS FINAL COUNTEROFFENSIVE`);
      } else if (e.type === 'nationFell' && b) {
        this.toast(`★★★ ${b.nations[e.nation].name.toUpperCase()} HAS FALLEN — NATION ACQUIRED`);
      }
    }
  }

  toast(msg: string): void {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    this.toasts.appendChild(t);
    setTimeout(() => t.remove(), 3800);
    while (this.toasts.children.length > 3) this.toasts.firstChild!.remove();
  }

  private setupDrag(): void {
    const handle = document.getElementById('drag-handle')!;
    const pane = document.getElementById('battle-pane')!;
    let startY = 0, startH = 0, dragging = false;
    handle.addEventListener('pointerdown', (e) => {
      dragging = true; startY = e.clientY; startH = pane.clientHeight;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const h = startH + (e.clientY - startY);
      pane.style.height = `${h}px`;
    });
    handle.addEventListener('pointerup', () => { dragging = false; });
  }

  // ————— Modals —————

  founding(onDone: (name: string) => void): void {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    let name = randomCompanyName();
    overlay.innerHTML = `
      <div class="modal">
        <h2>ARTICLES OF INCORPORATION</h2>
        <div class="sub">STATE OF DELAWARE (WHERE ELSE) · FORM DD-★</div>
        <input id="found-name" maxlength="40" />
        <div class="row">
          <button class="btn-ghost" id="found-reroll">🎲</button>
          <button class="btn-primary" id="found-go">INCORPORATE</button>
        </div>
        <div class="sub" style="margin-top:12px">By incorporating you agree to defend freedom at competitive rates.</div>
      </div>
    `;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#found-name') as HTMLInputElement;
    input.value = name;
    overlay.querySelector('#found-reroll')!.addEventListener('click', () => {
      input.value = randomCompanyName();
    });
    overlay.querySelector('#found-go')!.addEventListener('click', () => {
      const finalName = input.value.trim() || name;
      overlay.remove();
      onDone(finalName);
      document.getElementById('company-name')!.textContent = finalName;
    });
  }

  afterAction(report: OfflineReport, onDone: () => void): void {
    const euphemism = AAR_EUPHEMISMS[Math.floor(Math.random() * AAR_EUPHEMISMS.length)];
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal aar">
        <div class="stamp">TOP SECRET-ISH</div>
        <h2>AFTER-ACTION REPORT</h2>
        <div class="sub">WHILE YOU WERE AWAY (${fmtDuration(report.seconds)})</div>
        <table>
          <tr><td>Revenue recognized</td><td>${fmtMoney(report.earned)}</td></tr>
          <tr><td>Territories annexed</td><td>${report.territoriesWon}</td></tr>
          <tr><td>Units delivered</td><td>${fmt(report.unitsDelivered)}</td></tr>
          <tr><td>${euphemism}</td><td>${fmt(report.unitsLost)}</td></tr>
          <tr><td>Rules of engagement</td><td><span class="redacted">redacted</span></td></tr>
        </table>
        <div class="row"><button class="btn-primary" id="aar-ok">ACKNOWLEDGE &amp; INVOICE</button></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#aar-ok')!.addEventListener('click', () => { overlay.remove(); onDone(); });
  }

}
