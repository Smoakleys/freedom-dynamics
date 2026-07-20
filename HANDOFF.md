# HANDOFF — Freedom Dynamics
*Continuously updated. Any agent must be able to resume from this file alone.*
*Last update: 2026-07-19 ~19:39 (premium UI/map/control redo gate green; deployment next)*

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
  harness) → `py -3.12 test/e2e.py` (23 assertions vs built dist; writes
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
  vs gold empire; contested = flat magenta action field; pickets at
  every front + hold-phase remnants (war reads two-sided everywhere); streaming
  rear-spawn reinforcements; convoys; conquest gold shockwaves; momentum
  arrows (strategic-only, drift-animated); onboarding toasts; mobile map
  controls with focal pinch zoom, one-finger follow-the-finger pan, explicit
  zoom/focus buttons, and double-tap zoom toggle; much smaller fixed-world-scale
  units (invisible at altitude);
  TRUE fog of war (non-bordering nations render as open sea).
- Balance: garrison = 30·11^(ring-1); conquest decelerates (first nation in
  minutes, ~6/8 nations by simulated h9, deep rings gate for days).
- Prestige = PLACEHOLDER (fiscal year cut from identity; lobbyingPower dormant).

## IN FLIGHT RIGHT NOW: visual overhaul (hotter/colder search)
Bridger rejected the "blocky art map"; target = SMOOTH AND SIMPLE. Process he
mandated: rounds of small code-rendered concept maps, maximally different,
he picks best-of-round, branch around winners, repeat. NO verbal style
questions; NO AI mood images — code renders only.
- 2026-07-19 ~11:50: Bridger resumed the project and ordered a serious visual
  overhaul. Current agent inspected PLAN, this handoff, the visual gate, the
  renderer, and all three existing E2E frames. The live map still visibly
  fails the target: pixel-derived coast/border contours, heavy black seams,
  muddy contested magenta, noisy terrain glyphs/grain, and map detail that
  competes with units at mid/close zoom. Work has started on the locked six-
  direction Round 1 code-rendered comparison using one shared smooth geometry.
- 2026-07-19 ~12:05: Round 1 is rendered. Source:
  `tools/render_visual_round1.py`. Outputs:
  `test/artifacts/visual_round1/01_ink_atlas.png` through
  `06_carved_inlay.png`; comparison board:
  `test/artifacts/visual_round1/round1_contact_sheet.png`. The renderer uses
  identical supersampled organic geometry, labels, ownership, and contested
  territory in all six frames. Current agent recommendation is **2 Bold Board**
  as the best north-star match, with **5 Duotone Field** as the cleanest second
  branch. PAUSED ONLY for Bridger's best/second choice; do not rewrite live
  `paint.ts` until that visual choice is made. Then produce a narrower Round 2
  branching around the winner before locking the visual bible.
- 2026-07-19 ~12:15: Bridger verdict: **"Bold board is by far the best option
  but not perfect."** Bold Board is now the locked Round 1 winner. Preserve its
  saturation, decisive faction colors, dark sea, and graphic readability.
  Round 2 is branching specifically across border hierarchy/weight, label-chip
  density, palette temperature, and contested grammar. Do not fall back toward
  the pale, monochrome, pastel, or dark-command-board directions.
- 2026-07-19 ~12:25: Round 2 rendered from
  `tools/render_visual_round2.py`; outputs are under
  `test/artifacts/visual_round2/` with comparison board
  `round2_contact_sheet.png`. Six branches: Tuned Original, Lighter Seams,
  Nation Hierarchy, Color-Forward, Warm Premium, Front Signal. Current agent
  recommendation: **2 Lighter Seams** as the cleanest preservation of the
  winner; borrow the nation/coast hierarchy from **3 Nation Hierarchy** if
  desired. **6 Front Signal** is the diagnostic branch for stronger battle
  state. Await Bridger pick/critique, then do one final narrow refinement round
  or lock a visual bible if the answer is decisive.
- 2026-07-19 ~12:35: Bridger accepted the direction **at a high level** and
  explicitly called for multiple zoom levels plus small effects. Working lock:
  **Lighter Seams** is the strategic/far altitude. The visual system must now
  be a progressive zoom ladder, not one texture doing everything:
  - FAR: smooth saturated nations, thin province seams, strong nation/coast
    edge, only essential strategic labels/front state.
  - MID: territory labels, town/industry marks, restrained contested hatch,
    momentum/front symbols.
  - CLOSE: sparse infrastructure/map micro-detail plus small battle effects;
    never restore grain, procedural terrain glyph clutter, or giant FX.
  Units remain fixed world scale and invisible at far zoom. Implementation of
  the live renderer and zoom-dependent overlay is now authorized.
- 2026-07-19 ~16:35: the live **Bold Board / Lighter Seams zoom ladder is
  implemented** in `src/render/board/paint.ts` and `src/render/boardview.ts`.
  The painter now traces the territory and nation label fields into smoothed
  vector contours on a 2048x4096 texture, uses saturated jewel nations/gold
  empire/deep teal sea, hairline province seams, decisive national/coast
  outlines, and a quieter contested hatch. Removed the previous grain, terrain
  glyphs, scars, waves/grid, building clusters, halftone, and vignette noise.
  BoardView now has scale-aware nation labels, smaller collision-pruned
  territory chips, sparse nearest-neighbor in-country roads/tiny hubs, and a
  zoom ladder: nation strategy far; territory/front/infrastructure mid; labels
  clear and fixed-scale unit battle/effects close. Unit caps were cut from a
  possible ~100-piece pile to a representative tableau (~10-25 depending on
  seam room/wave), while seam glow, chevrons, flashes, tracers, convoys, and
  strikes remain restrained live effects. Strategic camera centers the visible
  land bounds; a stranded-camera guard returns mid/close zoom to the live front.
  Added `tools/capture_zoom_ladder.py` for a <30s representative visual capture,
  writing `test/artifacts/zoom_{far,mid,close}.png`. Production build passes,
  Vitest 18/18 passed before final camera polish, first full E2E passed 16/16,
  rapid three-altitude captures have been reviewed, and in-app desktop review
  shows zero console errors. Final build/test/full E2E rerun and durable visual
  gate verdict are the remaining pre-deploy work.
- 2026-07-19 ~16:45 FINAL LOCAL GATE: production build passed; Vitest 18/18;
  Playwright E2E 16/16; no fresh-boot or midgame console errors. Final artifacts
  are `test/artifacts/e2e_far.png`, `e2e_mid.png`, `e2e_close.png`. Harsh frame
  review verdict: **FAR PASS** (clean Bold Board hierarchy, ownership/nations at
  a glance); **MID PASS** (single restrained label tier, sparse hub/road cues,
  front dominates); **CLOSE PASS** (fixed-scale finite unit tableau, faction
  silhouettes and small live effects readable, no label clutter). No bug-class
  visual issue remains. Taste-level watch items for Bridger feedback: whether
  the contested diagonal hatch should become still quieter/dotted, and whether
  close units should shrink another ~10%. The required independent fork review
  could not be invoked under the current no-delegation execution policy, so the
  primary agent performed and documented the same harsh three-frame checklist
  instead of falsely claiming a fork verdict. Source + gh-pages deploy is next.
- 2026-07-19 ~16:50 DEPLOYED: source commit `637adec` pushed to `main`;
  production commit `0c20df1` force-pushed to `gh-pages`. Live index at
  `https://smoakleys.github.io/freedom-dynamics/` was cache-busted and verified
  to reference the expected new bundle `assets/index-CJlqyRRo.js`. This visual
  overhaul checkpoint is complete and live. Resume from direct Bridger visual
  feedback; do not reopen the discarded broad style branches unless requested.
- 2026-07-19 ~17:05 DIRECT LIVE FEEDBACK / NEW AUTHORITY: Bridger rejected the
  deployed polish level: **units must be way smaller; borders do not read as
  truly vectorized; the map feels thrown together; UI is messy/clunky; money
  must move to the top center; mobile map controls do not work well.** He wants
  a cleaner, clearer UI and materially higher standards across the whole
  composition. He explicitly welcomes questions only when they are specific.
  This supersedes the previous self-review pass. Created root `AGENTS.md` so
  these continuity, visual-standard, mobile-control, and collaboration rules
  are automatically durable for future agents. Current pass begins with a live
  mobile/UI/control audit, then implements the four concrete corrections and
  re-runs the full visual gate. Continue updating this file and the log at each
  milestone.
- 2026-07-19 ~19:39 IMPLEMENTATION MILESTONE / GATE GREEN: Replaced the prior
  independently smoothed territory outlines with a shared-edge topology
  renderer: each physical boundary is built once, simplified, spline-sampled,
  reused by both neighboring fills, and stroked once. This removed doubled
  seams, raster-grid character, and the black slivers caught in the first
  rewrite attempt. Contested land is now a quiet flat magenta instead of noisy
  hatch. Unit targets, model scales, shadows, flyer heights, and formation
  jitter were reduced substantially (roughly half the previous visual mass).
  The HUD is a clean three-column composition with money fixed at top center,
  compact title/adversary at left, and held-territory progress at right. The
  ticker, drawer, Engineering Corps panel, production cards, and controls were
  flattened and compacted. Mobile input now uses camera-derived world-per-pixel
  movement, correct follow-the-finger direction, focal pinch/wheel zoom,
  pinch-safe tap suppression, and explicit zoom/focus controls. Horizontal
  overflow is locked and battle UI has an explicit isolated layer order above
  WebGL. Root `AGENTS.md` permanently records these standards and the required
  continuity cadence.
  Verification on the exact build: production build PASS; Vitest 18/18 PASS;
  Playwright 23/23 PASS (including zoom buttons, one-finger pan direction,
  horizontal viewport stability, far/mid/close HUD centering, conquest, and
  zero console errors). Fresh rapid and full far/mid/close phone evidence is in
  `test/artifacts/`. A headless WebGL screenshot occasionally omitted part of a
  DOM layer while exact bounding-box assertions and the real in-app browser
  remained correct; explicit battle layer order was added anyway and this
  capture-engine quirk is documented rather than hidden. No app-layout failure
  remains. Source/deploy commits and live hash verification are next.
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
