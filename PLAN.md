# FREEDOM DYNAMICS — Design & Build Plan

*Locked with Bridger via grill session, 2026-07-18.*

**Pitch:** AdVenture Capitalist meets a live 3D war diorama. You run a defense contractor.
Your production lines literally put hardware on a battlefield you watch but never command.
The art is dead-serious war footage; the words around it are pure defense-industry satire.
Reference bar to beat: newhedge.io/bitcoin/battlefield (3D low-poly terrain, front-line
tug-of-war, masses of tiny units, HUD overlays) — ours must be *better* and must *progress*.

---

## 1. Locked design decisions

| # | Decision | Locked choice |
|---|----------|---------------|
| 1 | Battle role | Perpetual battle structured in **Days**. Each Day is a wall: you start getting wrecked, upgrades turn the tide, winning the Day progresses you. **You can never lose** — failing a day just means no progress yet. |
| 2 | Core loop | **Production lines ARE unit types.** Drone Line puts drones on the field; Tank Plant puts tanks on the field. Cash = government contracts paid per unit delivered. Every purchase visibly changes the battle. |
| 3 | Enemy | **"The Adversary"** — deliberately vague, ever-rebranded ("Near-Peer Threat", "Anomalous Belligerents"). Nobody asks who or why. No real-world targets, ever. |
| 4 | Prestige | **Fiscal Year reset.** Days stack into a Fiscal Year; prestiging = war declared won/rebranded, company "restructured", restart with **Lobbying Power** (permanent multiplier currency from lifetime revenue). |
| 5 | Offline | **Full fast-forward sim.** Days can be won overnight. Return greeted by an **AFTER-ACTION REPORT** (classified-doc styling, absurd euphemisms). Requires deterministic, tick-skippable battle sim. |
| 6 | Automation | AdCap arc: lines start **tap-to-produce**, then hire a themed automator per line (Congressman's Nephew, Retired 4-Star Board Member, Compliance AI…). Each hire = portrait + joke bio. |
| 7 | Humor v1 | Baseline: joke names/flavor text on every unit, upgrade, hire, milestone. Extra system: **news chyron** over the battle reacting to real player actions. **v1.5:** random contract events, Fiscal-Year awards ceremony. |
| 8 | Content v1 | **8 production lines, ~60 Days**, first prestige lands around Day 40–60 after a few real days of play. |
| 9 | Visuals | **3D from day one. No 2D POC.** Three.js low-poly terrain diorama, newhedge look but *elevated*: warm day-lit terrain, biome shifts as days escalate (farmland → desert → arctic → lunar), your faction in corporate-branded livery, Adversary in ominous generic gray. Sincere art + satirical HUD = the comedy. |
| 10 | Layout | **Battle top (~45%) always visible** with Day-progress HUD + chyron; production lines in a draggable sheet below (drag up to shop full-screen, down to watch war full-screen). Buy → see it land on the field instantly. |
| 11 | Platform | **PWA first** (free hosting, add-to-home-screen on iPhone, offline service worker). Architecture keeps a **Capacitor** native wrap as a later packaging step (clean storage/audio abstractions, no PWA-only APIs). |
| 12 | Title | **FREEDOM DYNAMICS.** At first launch you "incorporate" — company name generator with absurd suggestions (keep or reroll). |

---

## 2. Core loop — mechanical detail

### Economy (standard idle math, well-trodden)
- Line *i*: `cost(n) = base_i × growth_i^n` (growth ~1.07–1.15 per line).
- Each completed batch delivers units → paid per unit (contract revenue) → units also ship to the front.
- Milestone counts (25/50/100/200…) give per-line multipliers (themed: "Block II upgrade", "Cost-plus renegotiation").
- Global upgrades purchasable with cash; Lobbying Power gives a permanent global multiplier (AdCap angel math: LP earned ∝ √(lifetime revenue), tune later).

### Battle sim (deterministic, renderer-independent)
- Fixed timestep ticks (e.g. 4/sec). No physics, no randomness in outcomes — randomness only in cosmetic seeds.
- Your **Force** F = Σ (fielded units × unit power), replenished by production rate; units at the front attrit at a rate set by Adversary strength.
- Adversary strength A(day) scales exponentially with Day number (this is the wall).
- **Front position** p ∈ [0,1] moves by `k × (F_effective − A) / A` per tick, clamped to a floor near your edge — the line can pin you back but never break you. Day won when p = 1.
- Because it's pure math, offline fast-forward = run ticks in a tight loop (or closed-form per phase) — thousands of hours resolve in milliseconds.
- Sim emits an **event stream** (unit fielded, clash, push, day won) that both the renderer and the chyron/AAR consume. Renderer is a pure consumer: swapping/upgrading visuals never touches game logic.

### Day rhythm (target feel)
- Freshly walled: front pinned at 5–15%, visibly "getting wrecked".
- After buying the unlock/upgrades the wall teaches you to want: line pushes over ~2–5 minutes of watching, or resolves offline.
- Walls alternate "cheap push" days and "real wall" days so there's always a near-term goal.

---

## 3. Content v1

### Production lines / units (names draft — punch up during build)
| # | Line | Fielded unit | Joke angle |
|---|------|--------------|-----------|
| 1 | Surplus Rifle Refurbishment | Infantry squads | "Vintage 1962. Certified pre-owned." |
| 2 | Tactical Truck Reupholstering | Armored trucks | Cupholder-based upgrades |
| 3 | Attritable Drone Assembly | Quadcopter swarms | "Attritable = we get paid when they explode" |
| 4 | Main Battle Tank Plant | Tanks | Block II/III/IV milestone jokes |
| 5 | Freedom Howitzer Works | Artillery (arcing fire) | Named ordnance ("Diplomacy, 155mm") |
| 6 | Fifth-Generation-ish Fighter Program | Jets (flyovers + strikes) | "Only $1.7T over budget" |
| 7 | Hypersonic Something™ | Missile streaks | Nobody knows what it is; it's hypersonic |
| 8 | Orbital [REDACTED] | Orbital beam strikes | Unlock text fully redacted except the price |

- Adversary fields gray counterparts + absurd low-tier assets early (weather balloons, "a guy with a radio"), rebranding each theater.
- **Hires** (one per line + a few global): Congressman's Nephew, Retired 4-Star (Board), Compliance AI, Lobbyist Emeritus, Defense Influencer, Ethics Officer (does nothing, big salary)…
- **Chyron pool:** static absurd headlines + templated reactive ones fed by sim events ("LOCAL CONTRACTOR FIELDS 100TH DRONE — ADVERSARY 'CONCERNED'").
- **After-Action Report:** earnings, days won, units delivered, absurd euphemism stats, one procedurally chosen "commendation".

---

## 4. Tech stack

- **TypeScript + Vite + Three.js.** Battle uses `InstancedMesh` per unit type (thousands of units cheap), low-poly models, single directional light + hemisphere, no shadows on masses (blob decals), fog for depth.
- UI layer: plain DOM/CSS over the canvas (idle UI is lists and buttons — no framework needed; Preact only if state wiring gets painful).
- State: single game-state store, JSON-serializable. Saves to IndexedDB (`idb-keyval`) with abstraction layer (→ Capacitor Storage later). Autosave every 10s + on hide.
- PWA: manifest + service worker (precache), add-to-home-screen, portrait lock via CSS/viewport handling.
- Hosting: **GitHub Pages or Cloudflare Pages** (free, instant deploys). Roll immediately when green + ping Bridger with the URL, per standing rule.
- Perf bar: 60fps on iPhone for ≤2k on-screen instances; degrade gracefully (merge squads into bigger formations at high counts — also reads better).
- Asset pipeline: reuse GGG low-poly generation experience (`game/godot/models.py` know-how) → glTF exports; placeholder primitives day one, real models swapped in per-line.
- **Machine prereq: Node.js is NOT installed on this box** — install via winget as build step zero.

## 5. Quality bar (the "better than newhedge" checklist)
- Front line must **read as progress in one glance** (line position + Day % HUD agree).
- Every purchase produces a **visible field change within 2 seconds** (new unit type marches in with a callout flag on first delivery).
- Battle never looks static: idle armies still patrol/skirmish at the pinned front.
- Visual review discipline memory applies: judge captures HARSHLY against the newhedge screenshots side-by-side before calling any milestone done.

## 6. Milestones
- **M1 — Company (playable numbers game):** economy engine, 8 lines, tap→hire arc, milestones, saves, deployed as PWA to the iPhone. No 3D yet. *Exit: fun to poke for 10 min on the phone.*
- **M2 — War:** battle sim + Three.js diorama v0 (terrain, primitive units, front line, Day walls, Day HUD), drawer layout. *Exit: buying a line visibly pushes the front.*
- **M3 — Juice:** real low-poly models per line, explosions/tracers/arcs, chyron, After-Action Report, offline fast-forward, first-delivery callouts. *Exit: side-by-side beats newhedge screenshot.*
- **M4 — Year One:** Fiscal Year prestige + Lobbying Power, full 60-day balance pass, PWA polish (icon, splash, offline). *Exit: v1 shipped.*
- **v1.5 backlog:** contract events, awards ceremony, biome shifts per theater, sound, war-room monitor overlay flavor, Capacitor wrap.
