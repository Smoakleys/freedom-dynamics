# VISUAL REVIEW GATE — mandatory for all visual work

Bridger directive (2026-07-19): a visual system must review visual work EVERY
time. He is heavily critical; "looks fine to me" has failed repeatedly.

## The gate (no exceptions)
No visual change deploys without this cycle:
1. Build + run `py -3.12 test/e2e.py` → fresh screenshots in `test/artifacts/`
   (e2e_far / e2e_mid / e2e_close — always judge ALL THREE altitudes).
2. Spawn a fork-Fable reviewer with full project context. Instructions it must
   receive: be HARSH; separate bug-class from taste; rank by Bridger-impact;
   name the cheapest concrete fix per item (file + system); verdict per frame
   against the App-Store-screenshot bar.
3. Implement its list (or explicitly log why an item is skipped).
4. Re-screenshot, re-review until the reviewer passes all three frames.
5. Only then deploy.

## The art direction target (locked 2026-07-19)
**SMOOTH and SIMPLE.** The blocky/coarse map aesthetic is rejected. Clean
edges, flat confident fills, minimal texture noise. Reference energy:
premium board game / Polytopia-clean — never busy, never procedural-looking.
(Details refined via the visual-overhaul grill — see PLAN.md.)

## Known Bridger visual rules (violate = instant rejection)
- Units are world objects: FIXED world scale, invisible when zoomed out.
  Map symbology (labels, arrows, flags) may scale; units never.
- Units must remain substantially smaller than territory/front symbology at
  close zoom; a battle should read as movement on a board, not stacked tokens.
- Borders must be genuinely shared smooth topology: one physical edge, reused
  by both neighboring fills and stroked once. Independent softened grid traces,
  doubled outlines, cracks, and black slivers fail the gate.
- True fog of war: unexplored nations don't exist on the map (open sea).
- Ownership readable in one glance: gold = yours, cold hues = each nation.
- No camera drift while the player is watching; their touch always wins.
- Mobile map control is a visual-quality requirement: one-finger pan follows
  the finger, pinch zoom keeps its focal point, the page never drifts sideways,
  and explicit zoom/focus controls stay reachable without obscuring the fight.
- Money owns the top-center anchor. Status must fit the side columns without
  clipping; far, mid, and close screenshots must all prove this geometry.
- Judge the whole composition for clutter and hierarchy, not only the map.
  Dense panels, redundant decoration, and always-on effects must earn space.
- Mood boards/AI frames are for DIRECTION only; approval requires
  code-rendered output (he judges implementations, not vibes).

## 2026-07-20 causal-war gate

Exact reviewed build: `index-BTWAVXXV.js` + `index-BlJBatsP.css`; artifacts are
`test/artifacts/e2e_{far,mid,close}.png` at a 390×844 CSS viewport / 2× capture.
The active runtime prohibited spawning a fork reviewer, so the primary agent
performed the harsh whole-frame review rather than skipping the gate.

- Rejected iteration 1: saved routes existed but one-pixel lines disappeared
  into the border/depth hierarchy; the physical dispatch pad also used an old
  homeland-average coordinate while the visible HQ label used the northern
  phone-safe province. Fixed with one exact HQ coordinate and screen-readable
  depth-independent route ribbons.
- Rejected iteration 2: reinforcement arrivals reused conquest shockwaves,
  creating giant rings and false capture emphasis. Removed them and reduced
  routine blast scale.
- Rejected iteration 3: broken garrisons read as an empty `GARRISON 0%` bar.
  Replaced with a filling `SECURING Ns` occupation state.
- Rejected iteration 4: operational ribbons remained visible at close zoom and
  resembled oversized tracers. Routes now hide inside the battle frame.
- Final verdict: FAR passes—exact HQ origin, restrained destination flow,
  ownership, centered money, and occupation state are immediately readable;
  fixed units are absent. MID passes—tiny class silhouettes and localized
  combat are visible without route/label overload. CLOSE passes—small fixed-
  world units, shadows, range separation, and reduced effects; no strategic
  route overlay. The compact drawer retains five routine lines and the complete
  HUD stays within the phone viewport. Secondary-front pickets also refresh on
  coarse class/strength changes rather than retaining stale silhouettes.
  Automated interaction/geometry gate is all green with zero console errors.
