# Freedom Dynamics E2E: boots the built game, plays the core loop, asserts.
# Usage: py -3.12 test/e2e.py   (exit 0 = pass; screenshots land in test/artifacts)
import json, time, subprocess, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
ART = os.path.join(ROOT, "test", "artifacts")
os.makedirs(ART, exist_ok=True)

from playwright.sync_api import sync_playwright

failures = []
def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)

server = subprocess.Popen([sys.executable, "-m", "http.server", "8199", "--bind", "127.0.0.1"],
                          cwd=DIST, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)

lines = []
owned = [200, 80, 45, 20, 6, 2, 1, 0, 0]
army =  [900, 250, 90, 45, 9, 4, 2, 0, 0]
for o, a in zip(owned, army):
    lines.append({"owned": o, "hired": o > 0, "progress": 0.4, "running": False,
                  "army": a, "delivered": o * 40, "target": None})
midgame = {"version": 4, "company": "E2E Dynamics", "funds": 900000000, "lifetimeEarnings": 2e9,
           "lobbyingPower": 0, "worldSeed": 1, "owned": [], "garrisons": {}, "holdTimers": {},
           "captureStamp": 0, "fallenNations": [], "wave": None, "rentPerSec": 0,
           "territoriesWonTotal": 0, "engineers": 50, "activeResearch": None, "researchProgress": 0,
           "completedResearch": ["thunderclap"], "cooldowns": {}, "lines": lines,
           "lastSeen": int(time.time() * 1000), "founded": True,
           "stats": {"unitsLost": 0, "daysWonOffline": 0, "earnedOffline": 0}}

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # ——— Scenario 1: fresh boot + founding + first purchase ———
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto("http://127.0.0.1:8199/", wait_until="load")
        time.sleep(3)
        check("fresh: founding modal shows", page.query_selector("#found-go") is not None)
        page.click("#found-go")
        time.sleep(2)
        check("fresh: HUD renders", page.inner_text("#hud-funds") is not None)
        # Tap DELIVER until affordable, then buy one rifle line.
        for _ in range(40):
            rows = page.query_selector_all(".line-row")
            b = rows[0].query_selector(".btn-buy")
            r = rows[0].query_selector(".btn-run")
            if b and not b.is_disabled():
                b.click(); break
            if r and not r.is_disabled():
                r.click()
            time.sleep(0.5)
        time.sleep(1)
        owned_badge = page.query_selector_all(".line-row")[0].query_selector(".line-owned").inner_text()
        check("fresh: buying works", owned_badge == "2", f"owned badge = {owned_badge}")
        check("fresh: mech line hidden before research",
              page.query_selector_all(".line-row")[8].evaluate("el => el.style.display") == "none")
        check("fresh: no console errors", len(errors) == 0, "; ".join(errors[:3]))
        ctx.close()

        # ——— Scenario 2: midgame save — war, R&D, strikes, routing ———
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        ctx.add_init_script("try { localStorage.setItem('freedom-dynamics-save-v1', JSON.stringify(%s)); } catch (e) {}"
                            % json.dumps(midgame))
        page = ctx.new_page()
        errors2 = []
        page.on("pageerror", lambda e: errors2.append(str(e)))
        page.on("console", lambda m: errors2.append(m.text) if m.type == "error" else None)
        page.goto("http://127.0.0.1:8199/", wait_until="load")
        time.sleep(6)

        hud = page.inner_text("#hud-day") + " " + page.inner_text("#hud-adv")
        check("war: fronts active in HUD", "FRONT" in hud.upper(), hud)
        check("war: rent shows", "RENT" in page.inner_text("#hud-funds-label").upper())

        # R&D: engineers visible, direct a research program.
        check("rnd: capacity shown", "STAFF" in page.inner_text("#rnd-cap").upper())
        page.click("#rnd-active")
        time.sleep(0.5)
        items = page.query_selector_all(".rnd-item")
        check("rnd: research list opens", len(items) >= 3, f"{len(items)} items")
        if items: items[0].click()
        time.sleep(0.5)
        active = page.inner_text("#rnd-active")
        check("rnd: program directed", active.startswith("▶"), active)

        # Strike: button exists (thunderclap researched), arm + tap map.
        strike = page.query_selector(".strike-btn")
        check("strike: button present", strike is not None)
        box = page.query_selector("#battle-canvas").bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        if strike and not strike.is_disabled():
            strike.click()
            time.sleep(0.3)
            page.mouse.click(cx, cy - 40)
            time.sleep(1)
            cd = page.evaluate("() => JSON.parse(localStorage.getItem('freedom-dynamics-save-v1'))")
            # cooldown persists on next autosave; check live via __fd-free route: read save after forcing one
            page.evaluate("() => window.dispatchEvent(new Event('pagehide'))")
            cd = page.evaluate("() => JSON.parse(localStorage.getItem('freedom-dynamics-save-v1')).cooldowns")
            check("strike: fires and cools down", cd.get("thunderclap", 0) > 0, str(cd))

        # SEND HERE: arm line 0 flag, tap map, target persists.
        flags = page.query_selector_all(".line-flag")
        visible_flag = next((f for f in flags if f.is_visible()), None)
        check("routing: flag button visible", visible_flag is not None)
        if visible_flag:
            visible_flag.click()
            time.sleep(0.3)
            page.mouse.click(cx + 30, cy - 30)
            time.sleep(0.7)
            page.evaluate("() => window.dispatchEvent(new Event('pagehide'))")
            tgt = page.evaluate("() => JSON.parse(localStorage.getItem('freedom-dynamics-save-v1')).lines[0].target")
            check("routing: SEND HERE sets a target", tgt is not None, str(tgt))

        # Conquest progresses over time.
        t0 = page.evaluate("() => JSON.parse(localStorage.getItem('freedom-dynamics-save-v1')).owned.length")
        time.sleep(70)
        page.evaluate("() => window.dispatchEvent(new Event('pagehide'))")
        t1 = page.evaluate("() => JSON.parse(localStorage.getItem('freedom-dynamics-save-v1')).owned.length")
        check("war: territory captured within 70s under overwhelming force", t1 > t0, f"{t0} -> {t1}")

        # Screenshots for the visual reviewer.
        for _ in range(11):
            page.mouse.move(cx, cy); page.mouse.wheel(0, 120); time.sleep(0.05)
        time.sleep(2)
        page.screenshot(path=os.path.join(ART, "e2e_far.png"))
        # Strategic → operational: stop near the label/detail transition so
        # the visual gate actually exercises the designed mid zoom tier.
        for _ in range(7):
            page.mouse.move(cx, cy); page.mouse.wheel(0, -120); time.sleep(0.05)
        time.sleep(11)
        page.screenshot(path=os.path.join(ART, "e2e_mid.png"))
        for _ in range(9):
            page.mouse.move(cx, cy); page.mouse.wheel(0, -120); time.sleep(0.05)
        time.sleep(11)
        page.screenshot(path=os.path.join(ART, "e2e_close.png"))
        check("midgame: no console errors", len(errors2) == 0, "; ".join(errors2[:3]))
        ctx.close()
        browser.close()
finally:
    server.terminate()

print(f"\n{'ALL PASS' if not failures else 'FAILURES: ' + ', '.join(failures)}")
sys.exit(0 if not failures else 1)
