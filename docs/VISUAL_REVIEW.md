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
- True fog of war: unexplored nations don't exist on the map (open sea).
- Ownership readable in one glance: gold = yours, cold hues = each nation.
- No camera drift while the player is watching; their touch always wins.
- Mood boards/AI frames are for DIRECTION only; approval requires
  code-rendered output (he judges implementations, not vibes).
