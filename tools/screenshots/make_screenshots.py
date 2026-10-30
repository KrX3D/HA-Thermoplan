"""Regenerate docs/screenshots/*.png with headless Chrome (demo data, no Home Assistant needed).

Usage: python tools/screenshots/make_screenshots.py [en|de]
Set CHROME to the browser executable if it is not found automatically.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HARNESS = Path(__file__).with_name("harness.html")
OUT = ROOT / "docs" / "screenshots"

# tab -> viewport height
TABS = {
    "overview": 590,
    "rooms": 880,
    "schedules": 1230,
    "plans": 830,
    "settings": 1420,
    "import": 980,
    "log": 640,
}


def find_chrome() -> str:
    candidates = [
        os.environ.get("CHROME"),
        shutil.which("google-chrome"),
        shutil.which("chromium"),
        shutil.which("chrome"),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    sys.exit("Chrome not found; set the CHROME environment variable")


def main() -> None:
    lang = sys.argv[1] if len(sys.argv) > 1 else "en"
    chrome = find_chrome()
    OUT.mkdir(parents=True, exist_ok=True)
    for tab, height in TABS.items():
        suffix = "" if lang == "en" else f"-{lang}"
        target = OUT / f"{tab}{suffix}.png"
        url = HARNESS.as_uri() + f"#tab={tab}&lang={lang}"
        subprocess.run(
            [
                chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                "--allow-file-access-from-files", "--force-device-scale-factor=1",
                f"--window-size=1400,{height}", "--virtual-time-budget=6000",
                f"--screenshot={target}", url,
            ],
            check=True,
            capture_output=True,
        )
        print("wrote", target.relative_to(ROOT))


if __name__ == "__main__":
    main()
