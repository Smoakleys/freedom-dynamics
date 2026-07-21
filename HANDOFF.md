# HANDOFF — Freedom Dynamics
*Continuously updated. Any agent must be able to resume from this file alone.*
*Last update: 2026-07-20 (three-view Engagement overhaul deployed/live-verified)*

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
- `npm run build` (tsc + vite) → `npm test` (25 vitest sim tests incl. balance
  harness) → `py -3.12 test/e2e.py` (27 assertions vs built dist; writes
  screenshots to test/artifacts/e2e_{far,mid,close}.png).
- Visual change? → fork-Fable harsh review of the three artifacts (see gate).
- Deploy: copy dist/* + .nojekyll into a temp dir, git init -b gh-pages,
  commit, force-push to origin gh-pages; poll live URL for the new JS hash.
- Commit style: end with Co-Authored-By Claude + Claude-Session link.

## Current state (all deployed & green unless noted)
- **CURRENT VISUAL DIRECTIVE:** Bridger says units remain difficult to read at
  the zoom where they become visible and explicitly rejects treating zoom as
  mere magnification of the same strategic map. The supported views must be
  genuinely different compositions. The closest view should become a local
  battle presentation along an active border, with units visibly fighting in
  that corridor. Do not solve this by making fixed-world units large again;
  solve it through close-only terrain/value structure, faction contrast,
  battle framing, and camera behavior. Before locking the implementation,
  present Bridger with specific choices for (1) tactical terrain treatment,
  (2) border-following versus free close camera, and (3) unit identification.
- **CLOSE-VIEW AUDIT MILESTONE:** `e2e_close.png` confirms the renderer only
  lowers the camera from 88 to 62 degrees and hides strategic labels/details;
  it keeps the same saturated ownership-map plane underneath. The hot front is
  still a thin glowing cartographic seam, while fixed-scale gold/gray models
  have no common local ground, faction base, or silhouette treatment. The eye
  therefore reads “province map with tiny objects,” not “battle along a
  border.” Implementation is deliberately paused at Bridger's concrete visual
  choice gate rather than locking a speculative close-mode art direction.
- **PREFERENCE-GATE CORRECTION:** Bridger rejected the first A/B questions as
  insufficiently specific. The next proposal must describe exact zoom-stop
  transitions, battlefield footprint, colors/signals, camera/thumb behavior,
  health/damage visibility, and what remains visible or disappears—not merely
  name broad styles such as “tactical diorama” or “premium board.”
- **CLOSE-VIEW DIRECTION LOCKED / IMPLEMENT NOW:** Bridger rejected five named
  layers as overdesigned and explicitly removed the proposed `Front` and
  `Battle` layers. The product has three meaningful views only: `Command`,
  `Theater`, and `Engagement`. Engagement is the one close view where the
  strategic map transforms into a modeled border battlefield and individual
  units fight. Proceed with the recommended modeled-terrain treatment,
  expanded phone battlefield/collapsed production drawer, and soft camera rail
  along the active border. Continuous pinch may interpolate, but controls and
  composition must not expose extra conceptual stops.
- **THREE-VIEW IMPLEMENTATION MILESTONE (deployed):** Renderer and
  explicit controls now author only `[Command 112, Theater 76, Engagement 28]`;
  continuous pinch remains interpolation. Engagement crossfades away all
  strategic labels, borders, routes, HQ/route flags, and the saturated map,
  replacing them with a locally aligned two-sided textured field plus a narrow
  no-man's-land. Existing front formations snap into truthful opposing cohorts
  on first reveal; later count increases still march in from the rear. Models
  remain fixed world scale but gain thin gold/slate contact rings and
  damage-only health rings. The soft rail stores limited cross-front offset and
  follows the moving seam; the phone battlefield expands from 58dvh to 76dvh.
  The first two geometry iterations were explicitly rejected for giant seam
  wedges/oversized bases, and then for empty/off-center battle framing. Current
  exact local build is `index-gAF3_Ijj.js` + `index-xr9wzsUd.css`. Full gate is
  green: 25/25 Vitest and all 27 phone E2E assertions, including exact authored
  stops, 76dvh Engagement height, centered HUD, soft-rail containment,
  70-second conquest, and zero console errors. Final far/mid/close artifacts
  pass whole-frame review. A separate in-app 390×844 boot check also found
  exact-width layout and zero browser errors. Commit/deploy/live verification
  completed as recorded below.
- **THREE-VIEW DEPLOYMENT VERIFIED:** Source commit `4884863` is on `main` and
  production commit `4a56f7fe38003726aba8c80214d9f1f8986e2be7` is on
  `gh-pages`. Cache-busted public HTML returned exact gated bundle
  `index-gAF3_Ijj.js`; `git ls-remote` matched the production commit. Generated
  deploy worktree
  `C:\Users\bhump\AppData\Local\Temp\fd-deploy-474addaa72774e89a5c85ac7b4dad8a0`
  remains because the recursive cleanup safety guard rejected removal.
- **CURRENT DIRECTIVE / SUPERSEDES CHECKPOINT THINKING:** Bridger rejected the
  pattern of explaining isolated gaps after deployment. He ordered a wide look
  at what the final product must be, followed by implementation with no
  shortcutting. The operative product is the North Star itself: a premium
  board-game war ant farm where a production purchase creates an identifiable
  class at HQ, that class visibly travels to its selected/automatic front,
  joins a formation, fights with its real stats and role, takes visible damage,
  affects occupation/counterattack, and changes ownership/income. Strategic,
  operational, and close zooms must tell the same causal story. Current work is
  auditing and replacing the entire production→transit→front→combat→capture
  chain before another deploy claim; continuity updates occur at each material
  milestone.
- **LOCAL CAUSAL REINFORCEMENT MILESTONE (not deployed):** save schema v5 now
  persists front-local class formations plus real reinforcement waves. A
  completed batch is paid for and dispatched from the deterministic homeland
  HQ to a specific live front with class-specific travel duration; it grants no
  combat power until arrival. AUTO sends future output to the weakest pressure-
  adjusted front, while DIRECT affects only future waves and never teleports a
  formation already fighting. Casualties mutate that front's surviving class
  mix. The renderer deleted cosmetic generic convoys: every visible route now
  comes from saved state, carries the delivered class model, starts at a
  physical pulsing HQ pad, and terminates at its actual assigned front. Non-hot
  pickets and hot-front pieces now use their own formation composition instead
  of the global arsenal. Automated microbatches aggregate deterministically so
  eight-hour offline catch-up remains phone-safe. `npm test -- --run` is 24/24
  (including transit/arrival/no-teleport/save-v5 invariants) and production
  build passes; superseded by the final local gate immediately below.
- **CAUSAL-WAR OVERHAUL DEPLOYED:** exact bundles are
  `index-BTWAVXXV.js` + `index-BlJBatsP.css`. Production now creates saved,
  class-specific HQ→front waves; no army/combat power exists before arrival.
  AUTO targets the weakest pressure-adjusted live formation and ROUTE changes
  only future output. Every front persists its own class mix; casualties mutate
  that formation. Nation-final counteroffensives select and attack one real
  front rather than the anonymous global army. UI rows distinguish FIELD from
  MOVING; the top HUD shows compact field/HQ-route/front totals, garrison health,
  final-wave health, and a truthful 60s SECURING countdown after defense breaks.
  Renderer routes originate at the exact visible `★ HOME / HQ` pad, are deduped
  per destination, show strategic beads and operational class models, and hide
  inside the close battle frame. Fake ScoutCar convoys and arrival shockwaves
  are gone; routine blasts and border strokes were reduced. Far/mid/close phone
  artifacts were regenerated repeatedly and harshly inspected as a whole.
  TypeScript/Vite pass; Vitest 25/25 in 2.33s; full 23-assert, ~120s phone E2E is
  all green with zero console errors. The higher-level runtime instruction did
  not permit a fork reviewer, so the primary agent performed the mandated harsh
  artifact review and logged each rejected iteration in this directive.
- **HONEST NEXT SIM DEPTH (not a blocker for this overhaul deploy):** surviving
  formations visually advance after capture but front-to-front redeployment is
  still instantaneous in simulation; counteroffensives inflict local formation
  losses/stall the targeted front but do not yet flip a recently held territory;
  callable strikes remain cooldown capabilities rather than banked stockpiles.
  These are the next North-Star operational layers—not reasons to regress the
  now-complete HQ→transit→arrival→local-combat causal chain.
- Source commit `f4f8bc6` is pushed to `main`. Production commit `dde49b5` is
  force-pushed to `gh-pages`. A cache-busted public request returned HTTP 200
  and referenced the exact reviewed `assets/index-BTWAVXXV.js` and
  `assets/index-BlJBatsP.css`; `git ls-remote` independently matched the full
  deployed commit `dde49b5477cf40b75e47b0fe1e24de4bc22f5432`. The deploy temp
  copy remains at
  `C:\Users\bhump\AppData\Local\Temp\fd-deploy-7d4e9e7cdcc446ed9b0ae7cf0ce82dba`
  because the command guard rejected recursive cleanup; it is isolated and not
  used by the repo or live build.
- **LOCAL, NOT DEPLOYED (23:46):** the rejection pass now has a real combat
  foundation in `src/game/combat.ts` and per-line profiles in `content.ts`.
  Every class has health, effective health/armor, damage, fire rate, range,
  speed, exposure, role multipliers, and occupation strength. Front routing
  allocates actual class counts; garrison/wave damage targets the classes on
  that front rather than deleting anonymous power from line 0; support, recon,
  combined-arms, air suppression, and capture-capable roles have deterministic
  effects. Lifetime damage dealt/taken is migrated into saves. Artillery and
  standoff weapons can break a defense but cannot occupy it alone.
- **LOCAL renderer/control/UI replacement:** drag now preserves the grabbed
  ground point using camera raycasts, pinch/wheel/buttons keep their focal
  point, and zoom buttons use five explicit altitude stops. Unit models and
  shadows were halved again, formation caps reduced, and class movement speed
  plus weapon range now affect board movement/standoff. The homeland has a
  persistent `★ HOME / HQ` chip and distinct gold; HUD copy begins at HQ.
  Curves now use denser sampling/lower tension/less simplification and lighter
  internal borders. The mobile drawer defaults to more battlefield, removes
  card prose, exposes compact combat stats, replaces the cryptic flag with a
  DIRECT/TARGET/TAP MAP control, and compresses repeated chrome.
- Compile checkpoint: `npm test -- --run` = 18/18 and `npm run build` passes.
  This is not a visual gate or deployment verdict. Next: dedicated combat
  invariants, mobile gesture E2E, real far/mid/close browser review, then
  iterate again wherever the full composition still fails.
- **FINAL LOCAL REJECTION-PASS GATE (00:03):** exact production bundles are
  `index-BlYRmRLD.js` + `index-DcUIU8zD.css`; build passes and Vitest is 22/22.
  The full 118-second phone E2E is all green (23 assertions): fresh purchase,
  R&D toggle/program, strikes, routing, capture, no horizontal drift, centered
  HUD at three altitudes, zero console errors, and the stronger pan invariant
  that the grabbed world coordinate remains under the moved finger. Latest
  full artifacts are `test/artifacts/e2e_{far,mid,close}.png`; latest exact-
  build rapid artifacts are `zoom_{far,mid,close}.png`.
- Harsh composition verdict for this checkpoint: FAR clearly shows homeland
  `★ HOME / HQ`, centered money, thin screen-stable borders, and strategic
  labels only; MID retains small finite pieces and one front chip; CLOSE shows
  tiny fixed-world class silhouettes with range-separated formations. R&D is
  collapsed by default. Automated lines compress BUY + DIRECT into one 56px
  summary row (five routine lines fit in the phone drawer); manual lines retain
  expanded teaching controls. This passes the specified checkpoint, not the
  entire product backlog.
- **DEPLOYED + VERIFIED (00:07):** source commit `a7c7137` is on `main`;
  production commit `f1f6dd8` is on `gh-pages`. Authenticated GitHub Pages
  status reports that exact commit `built`, and a cache-busted public
  `index.html` returned `assets/index-BlYRmRLD.js` and
  `assets/index-DcUIU8zD.css`. This rejection-recovery checkpoint is live at
  https://smoakleys.github.io/freedom-dynamics/.
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
- 2026-07-19 ~19:52 DEPLOYMENT CHECKPOINT / EXTERNAL DELAY: source commit
  `755d7c6` ("Raise visual bar for map and mobile UI") is pushed to `main`.
  Production commit `a639b6a` is force-pushed to `gh-pages` and contains the
  expected bundles `assets/index-ByuXqJEC.js` and
  `assets/index-B5GOXtGX.css`. GitHub's authenticated Pages API initially
  confirmed `status: building`, commit `a639b6a`; it then began returning HTTP
  503 for both status and supported rebuild requests. The cache-busted public
  index still returned the prior `index-CJlqyRRo.js` / `index-Bkvu4sxb.css` at
  19:52 CDT. Do **not** rewrite or repush the branch while the job is building.
  Next agent should poll the public URL with a new query string and verify the
  exact new JS/CSS pair; only retry publication if GitHub reports an error
  rather than `building`. The repo and deploy branch are complete and clean;
  public propagation is the sole outstanding item.
- 2026-07-19 ~23:28 DIRECT REJECTION / NEW WORKING AUTHORITY: Bridger says the
  current game still looks and functions badly and explicitly rejects the prior
  green-gate verdict. Concrete failures: units are still too large; pan
  direction and zoom still do not function properly; units lack real per-type
  fighting logic, damage, and health calculation; there is no obvious home
  nation/start; the map remains rough; the UI is oversized and cluttered; and
  the whole product needs an insanely critical, iterative review rather than a
  narrow patch. This supersedes all earlier self-review claims. Current agent
  has re-read the North Star, Living War spec, continuity log, and visual gate,
  and is auditing the renderer plus deterministic sim together before changing
  code. Required work order: establish actual combat/state gaps and control
  failure modes; implement formation/unit-class health/damage/targeting logic
  without micro or persistence; make origin and front direction unmistakable;
  repair camera gestures; reduce unit/UI scale again; then run repeated
  far/mid/close mobile visual and gameplay gates. Update this file and the log
  at every material milestone.
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
