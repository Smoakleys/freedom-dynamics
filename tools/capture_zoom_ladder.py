"""Fast visual-only capture of the strategic/operational/battle zoom ladder.

Unlike test/e2e.py this seeds a representative war and skips the 70-second
conquest assertion, so renderer iterations can be reviewed in under a minute.
"""

import json
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
ART = os.path.join(ROOT, "test", "artifacts")


def representative_save():
    owned = [200, 80, 45, 20, 6, 2, 1, 0, 0]
    army = [900, 250, 90, 45, 9, 4, 2, 0, 0]
    lines = [
        {
            "owned": units,
            "hired": units > 0,
            "progress": 0.4,
            "running": False,
            "army": deployed,
            "delivered": units * 40,
            "target": None,
        }
        for units, deployed in zip(owned, army)
    ]
    return {
        "version": 4,
        "company": "E2E Dynamics",
        "funds": 900_000_000,
        "lifetimeEarnings": 2e9,
        "lobbyingPower": 0,
        "worldSeed": 1,
        "owned": [],
        "garrisons": {},
        "holdTimers": {},
        "captureStamp": 0,
        "fallenNations": [],
        "wave": None,
        "rentPerSec": 0,
        "territoriesWonTotal": 0,
        "engineers": 50,
        "activeResearch": None,
        "researchProgress": 0,
        "completedResearch": ["thunderclap"],
        "cooldowns": {},
        "lines": lines,
        "lastSeen": int(time.time() * 1000),
        "founded": True,
        "stats": {"unitsLost": 0, "daysWonOffline": 0, "earnedOffline": 0},
    }


def main():
    os.makedirs(ART, exist_ok=True)
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", "8200", "--bind", "127.0.0.1"],
        cwd=DIST,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        time.sleep(1.0)
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
            payload = json.dumps(representative_save())
            ctx.add_init_script(
                "try { localStorage.setItem('freedom-dynamics-save-v1', JSON.stringify(%s)); } catch (e) {}"
                % payload
            )
            page = ctx.new_page()
            page.goto("http://127.0.0.1:8200/", wait_until="load")
            time.sleep(6)
            box = page.query_selector("#battle-canvas").bounding_box()
            cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2

            for _ in range(11):
                page.mouse.move(cx, cy)
                page.mouse.wheel(0, 120)
            time.sleep(1)
            page.screenshot(path=os.path.join(ART, "zoom_far.png"))

            for _ in range(7):
                page.mouse.move(cx, cy)
                page.mouse.wheel(0, -120)
            time.sleep(5)
            page.screenshot(path=os.path.join(ART, "zoom_mid.png"))

            for _ in range(9):
                page.mouse.move(cx, cy)
                page.mouse.wheel(0, -120)
            time.sleep(11)
            page.screenshot(path=os.path.join(ART, "zoom_close.png"))
            ctx.close()
            browser.close()
    finally:
        server.terminate()


if __name__ == "__main__":
    main()
