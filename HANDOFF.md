# HANDOFF — Freedom Dynamics
*Continuously updated. Any agent must be able to resume from this file alone.*
*Last update: 2026-07-19 ~04:00 (mid visual-overhaul, session budget near limit)*

## What this is
Defense-contractor idle game ("Warlord Corp" PMC fiction) for Bridger's iPhone.
LIVE: https://smoakleys.github.io/freedom-dynamics/ (PWA; GitHub Pages)
Repo: C:\Users\bhump\freedom-dynamics · github.com/Smoakleys/freedom-dynamics
(git creds stored, user Smoakleys; NO gh CLI — use git + api.github.com with
token from `git credential fill`).

## Read these before touching anything
1. `PLAN.md` — top section = NORTH STAR (what Bridger wants, predictive tests);
   then LIVING WAR SPEC (locked line-by-line); then history.
2. `docs/VISUAL_REVIEW.md` — MANDATORY gate for any visual change.
3. Memory files (auto-loaded): freedom-dynamics-north-star, -visual-gate,
   -marathon-2026-07-19, never-announce-unstarted-work.
4. `CONVERSATION_LOG.md` — the running log (append every conversation).

## Build / test / deploy (the loop for EVERY change)
- Node lives at `C:\Users\bhump\tools\node-v24.18.0-win-x64` (NOT on PATH —
  prefix it). Python via `py -3.12` (has playwright, PIL, numpy, gdown).
- `npm run build` (tsc + vite) → `npm test` (18 vitest sim tests incl. balance
  harness) → `py -3.12 test/e2e.py` (16 assertions vs built dist; writes
  screenshots to test/artifacts/e2e_{far,mid,close}.png).
- Visual change? → fork-Fable harsh review of the three artifacts (see gate).
- Deploy: copy dist/* + .nojekyll into a temp dir, git init -b gh-pages,
  commit, force-push to origin gh-pages; poll live URL for the new JS hash.
- Commit style: end with Co-Authored-By Claude + Claude-Session link.

## Current state (all deployed & green unless noted)
- Living War v0.4b + five fork-review rounds: nations continent (~9 nations,
  free-form multi-front conquest), overrun capture (+60s hold), nation-fall
  final waves (red-alert HUD, camera cut), territorial rent, arms exports,
  war bonds; Engineering Corps R&D (capacity/min, one program at a time; tree:
  armor1/2, retool1/2, thunderclap, skyfall, weather, mech); callable strikes
  (tap-to-target, cooldowns); per-line SEND HERE routing flags; kitbashed Mech
  line (research-gated line index 8); sprite label layer; cold-nation palettes
  vs gold empire; contested = cold fill + gold hatch + dashed ring; pickets at
  every front + hold-phase remnants (war reads two-sided everywhere); streaming
  rear-spawn reinforcements; convoys; conquest gold shockwaves; momentum
  arrows (strategic-only, drift-animated); onboarding toasts; mobile zoom
  overhaul (Safari pinch-hijack killed, pinch exp 1.35, two-finger pan,
  double-tap zoom toggle); FIXED-world-scale units (invisible at altitude);
  TRUE fog of war (non-bordering nations render as open sea).
- Balance: garrison = 30·11^(ring-1); conquest decelerates (first nation in
  minutes, ~6/8 nations by simulated h9, deep rings gate for days).
- Prestige = PLACEHOLDER (fiscal year cut from identity; lobbyingPower dormant).

## IN FLIGHT RIGHT NOW: visual overhaul (hotter/colder search)
Bridger rejected the "blocky art map"; target = SMOOTH AND SIMPLE. Process he
mandated: rounds of small code-rendered concept maps, maximally different,
he picks best-of-round, branch around winners, repeat. NO verbal style
questions; NO AI mood images — code renders only.
- Warm signal so far: he picked "A — Vector-crisp" (flat fills, uniform ~2px
  ink borders, zero texture) over soft-premium and flat-plates, but said
  "nothing is stable".
- A fork interrogator agent directs rounds. Its ROUND 1 SPEC (render these 6
  as ~780×900 portrait crops of the SAME map corner — reuse
  scratchpad mock_styles.py geometry approach: warped-Voronoi labels field,
  supersample 2x, smooth borders, same layout/labels/⚔ in all):
  1. INK ATLAS — warm off-white paper ground; territories near-white (±3%
     tints); empire = sole saturated element (flat gold); 1px ink borders;
     sea = paper + 1.5px coast line; small ink caps labels; thin gold hatch.
  2. BOLD BOARD — saturated flat poster fills (gold vs deep teal/plum/forest);
     3px warm-charcoal borders; deep navy-teal sea; white chunky caps in
     rounded chips; wide gold hatch.
  3. MIDNIGHT OPS — dark-mode board: near-black navy sea #0b1220, dark slate
     territory steps, luminous gold empire w/ faint outer glow (empire only),
     1.5px cool-gray borders; light-gray labels; glowing hatch. Command-screen,
     NOT moody terrain.
  4. PASTEL PROVINCES — muted pastels (sage/dusty blue/sand/clay), soft-ochre
     empire; NO drawn borders — 3px negative-space gaps showing off-white
     ground; pale ice-blue sea; thin gray-brown caps; dotted contested outline.
  5. DUOTONE FIELD — two hue families only: gold + deep slate-blue; enemy
     nations = lightness bands; sea = darkest band; no border lines except 1px
     empire outline; single-weight labels. Data-viz minimal.
  6. CARVED INLAY — medium-saturation flat fills; 1px lighter inner edge
     (top-left) + 1px darker outer line per territory (inlaid-board tactility,
     zero gradients); warm dark parchment-brown sea; engraved-feel caps.
  Ask Bridger: "Pick the best (and any second). What's warmer/colder about the
  others — steal or kill elements freely." Then relay verbatim to the
  interrogator fork (spawn a fresh fork if its transcript expired — forks
  inherit full context) for ROUND 2 SPEC branching around winners.
- After the style is locked ("VISUAL BIBLE" from the interrogator): rewrite
  paint.ts to the bible (likely: hi-res smooth borders — supersample or
  polygon-based, delete grain/glyph/scar layers per bible), re-run the full
  visual gate, deploy.

## Bridger's hard rules (violating any = instant rejection)
- Units: FIXED world scale, invisible fully zoomed out. Map symbology may
  scale; units never.
- True fog: unexplored nations don't exist visually (open sea).
- Smooth + simple map; blocky/procedural-looking = rejected.
- Never announce work as started without doing it in the same turn
  (global rule in ~/.claude/CLAUDE.md after a violation).
- Show code renders, not AI mood frames, for visual decisions.
- He answers best to ultra-specific yes/no specs or picking from rendered
  options; vague words in his feedback ("dull", "smooth") must be
  operationalized via mocks or drilling, not guessed.
- No supply mechanic. No unit veterancy/persistence. No micro.

## Known gotchas
- ScheduleWakeup ENDS the turn — only call it as the very last action.
- E2E save injection must use ctx.add_init_script (pagehide autosave clobbers
  localStorage set before reload).
- Playwright headless chromium fine on localhost; real sites (Cloudflare)
  need headed msedge channel.
- Strike-bar style DOM: rebuild only when capability set changes (E2E caught
  tap-eating rebuild bug — don't regress).
- three.js: assigning a material ARRAY to a mesh whose geometry has no groups
  renders NOTHING (cost hours; see tinted()).
- Free-tier only: no paid APIs; Pollinations for AI images (rate-limits:
  sequential w/ retries); assets from Poly Pizza/Quaternius (credits.txt).
