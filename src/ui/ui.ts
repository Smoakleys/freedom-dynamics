// DOM UI: war HUD, production drawer, modals, toasts.

import { LINES, RESEARCH, randomCompanyName, AAR_EUPHEMISMS } from '../game/content';
import { bulkCost, maxAffordable, buy, hire, batchDuration, batchRevenue, nextMilestone, engineerCost, devPerSec, availableResearch, lineUnlocked } from '../game/economy';
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
  // Wired by main: arm a map-tap action for strikes / per-line send-here.
  onArmStrike: ((kind: string) => void) | null = null;
  onArmSend: ((line: number) => void) | null = null;
  armedLine = -1;   // line currently waiting for a map tap (visual state)

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
        <div id="strike-bar"></div>
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
        <div id="rnd-panel">
          <div class="rnd-row">
            <div class="rnd-info">
              <div class="rnd-title">ENGINEERING CORPS</div>
              <div class="rnd-cap" id="rnd-cap">no staff</div>
            </div>
            <button class="btn btn-buy" id="rnd-buy">RECRUIT<small></small></button>
          </div>
          <button class="rnd-active" id="rnd-active">DIRECT R&amp;D →</button>
          <div class="line-progress"><div class="line-progress-fill" id="rnd-fill"></div></div>
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

    document.getElementById('rnd-buy')!.addEventListener('click', () => {
      const cost = engineerCost(this.gs, 1);
      if (this.gs.funds >= cost) {
        this.gs.funds -= cost;
        this.gs.engineers += 1;
        if (this.gs.engineers === 1) this.toast('ENGINEERING CORPS founded — R&D capacity online');
        this.refresh();
      }
    });
    document.getElementById('rnd-active')!.addEventListener('click', () => this.researchModal());
  }

  private researchModal(): void {
    const gs = this.gs;
    const avail = availableResearch(gs);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const dps = devPerSec(gs);
    const rows = avail.map(r => {
      const eta = dps > 0 ? fmtDuration((r.cost - (gs.activeResearch === r.id ? gs.researchProgress : 0)) / dps) : '∞';
      const active = gs.activeResearch === r.id;
      return `<button class="rnd-item ${active ? 'active' : ''}" data-id="${r.id}">
        <span class="rnd-branch rnd-${r.branch}">${r.branch.toUpperCase()}</span>
        <b>${r.name}</b>
        <small>${r.desc}</small>
        <em>${fmt(r.cost)} dev-pts · ETA ${eta}${active ? ' · IN PROGRESS' : ''}</em>
      </button>`;
    }).join('');
    overlay.innerHTML = `
      <div class="modal">
        <h2>DIRECT R&amp;D</h2>
        <div class="sub">ONE PROGRAM AT A TIME · UNUSED CAPACITY EVAPORATES</div>
        ${rows || '<p style="color:var(--dim);font-size:13px">Everything is researched. The engineers are playing cards.</p>'}
        <div class="row" style="margin-top:12px"><button class="btn-ghost" id="rnd-close">CLOSE</button></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#rnd-close')!.addEventListener('click', () => overlay.remove());
    overlay.querySelectorAll('.rnd-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.id!;
        if (this.gs.activeResearch !== id) {
          this.gs.activeResearch = id;
          this.gs.researchProgress = 0;
          this.toast(`R&D directed: ${RESEARCH.find(r => r.id === id)?.name}`);
        }
        overlay.remove();
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
          <button class="line-flag" title="Send this line's output somewhere">⚑</button>
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
      const flagBtn = row.querySelector('.line-flag') as HTMLButtonElement;
      flagBtn.addEventListener('click', () => {
        const ls = this.gs.lines[i];
        if (ls.target) {
          ls.target = null;
          this.toast(`${L.unitPlural} return to auto-deployment`);
          this.refresh();
        } else {
          this.armedLine = i;
          this.toast(`Tap the map — ${L.unitPlural} will concentrate there`);
          this.onArmSend?.(i);
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

    // R&D panel.
    const cap = document.getElementById('rnd-cap');
    if (cap) {
      const dps = devPerSec(gs);
      cap.textContent = gs.engineers === 0 ? 'no staff — recruit engineers'
        : `${fmt(gs.engineers)} staff · ${fmt(dps * 60)} dev-pts/min`;
    }
    const buyBtn = document.getElementById('rnd-buy') as HTMLButtonElement | null;
    if (buyBtn) {
      const cost = engineerCost(gs, 1);
      buyBtn.disabled = gs.funds < cost;
      (buyBtn.querySelector('small') as HTMLElement).textContent = `x1 · ${fmtMoney(cost)}`;
    }
    const activeEl = document.getElementById('rnd-active');
    const fillEl = document.getElementById('rnd-fill');
    if (activeEl && fillEl) {
      if (gs.activeResearch) {
        const def = RESEARCH.find(r => r.id === gs.activeResearch)!;
        activeEl.textContent = `▶ ${def.name.toUpperCase()}`;
        (fillEl as HTMLElement).style.width = `${Math.min(100, (gs.researchProgress / def.cost) * 100)}%`;
      } else {
        activeEl.textContent = gs.engineers > 0 ? 'DIRECT R&D → (capacity evaporating!)' : 'DIRECT R&D →';
        (fillEl as HTMLElement).style.width = '0%';
      }
    }

    // Strike bar: structure rebuilds only when the capability SET changes;
    // cooldown text updates in place (rebuilding every tick eats taps).
    const bar = document.getElementById('strike-bar');
    if (bar) {
      const caps2 = RESEARCH.filter(r => r.branch === 'capabilities' && gs.completedResearch.includes(r.id));
      const key = caps2.map(r => r.id).join(',');
      if (bar.dataset.caps !== key) {
        bar.dataset.caps = key;
        bar.innerHTML = caps2.map(r => {
          const label = r.id === 'thunderclap' ? '✈' : r.id === 'skyfall' ? '☄' : '⛈';
          return `<button class="strike-btn" data-kind="${r.id}">${label}<small></small></button>`;
        }).join('');
        bar.querySelectorAll('.strike-btn').forEach(el => {
          el.addEventListener('click', () => {
            const kind = (el as HTMLElement).dataset.kind!;
            this.toast('Tap the map to designate the strike');
            this.onArmStrike?.(kind);
          });
        });
      }
      bar.querySelectorAll('.strike-btn').forEach(el => {
        const kind = (el as HTMLElement).dataset.kind!;
        const cd = gs.cooldowns[kind] ?? 0;
        (el as HTMLButtonElement).disabled = cd > 0;
        (el.querySelector('small') as HTMLElement).textContent = cd > 0 ? `${Math.ceil(cd)}s` : 'READY';
      });
    }

    for (let i = 0; i < LINES.length; i++) {
      const L = LINES[i], ls = gs.lines[i], r = this.rows[i];
      // Research-locked lines stay hidden until unlocked.
      const unlocked = lineUnlocked(gs, i);
      r.root.style.display = unlocked ? '' : 'none';
      if (!unlocked) continue;
      const flagBtn = r.root.querySelector('.line-flag') as HTMLButtonElement;
      flagBtn.classList.toggle('set', !!ls.target);
      flagBtn.classList.toggle('arming', this.armedLine === i);
      flagBtn.style.display = ls.army > 0 || ls.target ? '' : 'none';
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
      } else if (e.type === 'researchDone') {
        const def = RESEARCH.find(r => r.id === e.id);
        this.toast(`🔬 ${def?.name ?? e.id} COMPLETE — ${def?.desc ?? ''}`);
        this.chyron.push(`${(def?.name ?? 'CLASSIFIED PROGRAM').toUpperCase()} DECLARED OPERATIONAL; BUDGET DECLARED CLASSIFIED`);
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
          ${report.nationsFallen > 0 ? `<tr><td>Nations acquired</td><td>${report.nationsFallen}</td></tr>` : ''}
          ${report.researchDone.length > 0 ? `<tr><td>Programs completed</td><td>${report.researchDone.length}</td></tr>` : ''}
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
