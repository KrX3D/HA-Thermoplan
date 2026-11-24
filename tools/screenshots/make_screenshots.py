"""Regenerate docs/screenshots/*.png with headless Chrome (demo data, no Home Assistant needed).

Usage: python tools/screenshots/make_screenshots.py [en] [de] [--tab NAME ...]
Without a language both en and de are written. Set CHROME to the browser executable if it is
not found automatically.

Chrome is driven over the DevTools protocol: each tab waits until harness.html sets its title to
"ready" (or fails on "ERR ..."), then the page is sized to its content and captured. Only the
standard library is used (a minimal WebSocket client is included).
"""

from __future__ import annotations

import argparse
import base64
import itertools
import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HARNESS = Path(__file__).with_name("harness.html")
OUT = ROOT / "docs" / "screenshots"

# Same order as the panel tabs (TABS in thermoplan-panel.js).
TABS = ["overview", "hold", "history", "learning", "rooms", "schedules", "plans", "settings", "import", "log"]
WIDTH = 1400
MIN_HEIGHT = 590
READY_TIMEOUT = 30


def find_chrome() -> str:
    candidates = [
        os.environ.get("CHROME"),
        shutil.which("google-chrome"),
        shutil.which("chromium"),
        shutil.which("chromium-browser"),
        shutil.which("chrome"),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    sys.exit("Chrome not found; set the CHROME environment variable")


class WebSocket:
    """Just enough of RFC 6455 for the DevTools protocol on localhost (text frames, no extensions)."""

    def __init__(self, url: str) -> None:
        hostport, path = url.removeprefix("ws://").split("/", 1)
        host, port = hostport.rsplit(":", 1)
        self.sock = socket.create_connection((host, int(port)), timeout=READY_TIMEOUT)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall(
            (
                f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\n"
                f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
            ).encode()
        )
        response = b""
        while b"\r\n\r\n" not in response:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("DevTools closed the connection during the handshake")
            response += chunk
        if b" 101 " not in response.split(b"\r\n", 1)[0]:
            raise ConnectionError(f"DevTools handshake failed: {response[:200]!r}")
        self.buffer = response.split(b"\r\n\r\n", 1)[1]

    def _read(self, size: int) -> bytes:
        while len(self.buffer) < size:
            chunk = self.sock.recv(1 << 20)
            if not chunk:
                raise ConnectionError("DevTools connection closed")
            self.buffer += chunk
        data, self.buffer = self.buffer[:size], self.buffer[size:]
        return data

    def send(self, text: str) -> None:
        payload = text.encode()
        header = bytearray([0x81])
        if len(payload) < 126:
            header.append(0x80 | len(payload))
        elif len(payload) < 1 << 16:
            header += bytes([0x80 | 126]) + struct.pack(">H", len(payload))
        else:
            header += bytes([0x80 | 127]) + struct.pack(">Q", len(payload))
        mask = os.urandom(4)
        self.sock.sendall(bytes(header) + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload)))

    def recv(self) -> str:
        message = b""
        while True:
            first, second = self._read(2)
            size = second & 0x7F
            if size == 126:
                size = struct.unpack(">H", self._read(2))[0]
            elif size == 127:
                size = struct.unpack(">Q", self._read(8))[0]
            data = self._read(size)
            opcode = first & 0x0F
            if opcode == 0x8:
                raise ConnectionError("DevTools connection closed")
            if opcode in (0x0, 0x1, 0x2):
                message += data
                if first & 0x80:
                    return message.decode()
            # ping/pong frames are ignored

    def close(self) -> None:
        self.sock.close()


class Browser:
    def __init__(self, chrome: str) -> None:
        self.profile = tempfile.mkdtemp(prefix="thermoplan-shots-")
        args = [
            chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
            "--allow-file-access-from-files", "--remote-debugging-port=0",
            f"--user-data-dir={self.profile}", f"--window-size={WIDTH},{MIN_HEIGHT}", "about:blank",
        ]
        if os.environ.get("CHROME_NO_SANDBOX"):  # containers without user namespaces
            args.insert(1, "--no-sandbox")
        self.process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.ids = itertools.count(1)
        self.ws = WebSocket(self._page_url())

    def _page_url(self) -> str:
        port_file = Path(self.profile) / "DevToolsActivePort"
        deadline = time.monotonic() + READY_TIMEOUT
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                sys.exit(
                    f"Chrome exited with code {self.process.returncode}"
                    " (in a container without user namespaces set CHROME_NO_SANDBOX=1)"
                )
            if port_file.exists() and port_file.read_text().strip():
                port = port_file.read_text().split()[0]
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=5) as resp:
                    pages = [t for t in json.load(resp) if t["type"] == "page"]
                if pages:
                    return pages[0]["webSocketDebuggerUrl"]
            time.sleep(0.1)
        sys.exit("Chrome did not open its DevTools port")

    def call(self, method: str, **params):
        msg_id = next(self.ids)
        self.ws.send(json.dumps({"id": msg_id, "method": method, "params": params}))
        while True:
            reply = json.loads(self.ws.recv())
            if reply.get("id") != msg_id:
                continue  # events
            if "error" in reply:
                raise RuntimeError(f"{method}: {reply['error']}")
            return reply["result"]

    def evaluate(self, expression: str):
        result = self.call("Runtime.evaluate", expression=expression, awaitPromise=True, returnByValue=True)
        if "exceptionDetails" in result:
            raise RuntimeError(f"{expression}: {result['exceptionDetails']}")
        return result["result"].get("value")

    def resize(self, height: int) -> None:
        self.call("Emulation.setDeviceMetricsOverride", width=WIDTH, height=height, deviceScaleFactor=1, mobile=False)

    def close(self) -> None:
        self.ws.close()
        self.process.terminate()
        try:
            self.process.wait(10)
        except subprocess.TimeoutExpired:
            self.process.kill()
        shutil.rmtree(self.profile, ignore_errors=True)


def capture(browser: Browser, tab: str, lang: str) -> bytes:
    # A fragment change does not reload the page, so leave it first.
    browser.call("Page.navigate", url="about:blank")
    browser.resize(MIN_HEIGHT)
    browser.call("Page.navigate", url=HARNESS.as_uri() + f"#tab={tab}&lang={lang}")
    deadline = time.monotonic() + READY_TIMEOUT
    while True:
        title = browser.evaluate("document.readyState === 'complete' ? document.title : ''") or ""
        if title == "ready":
            break
        if title.startswith("ERR"):
            raise RuntimeError(f"{tab} ({lang}): {title}")
        if time.monotonic() > deadline:
            raise RuntimeError(f"{tab} ({lang}): harness not ready after {READY_TIMEOUT} s (title {title!r})")
        time.sleep(0.1)
    # The panel has min-height 100vh: measure at the minimum height, then grow to the content.
    height = max(MIN_HEIGHT, int(browser.evaluate("document.documentElement.scrollHeight")))
    browser.resize(height)
    browser.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))")
    shot = browser.call("Page.captureScreenshot", format="png", fromSurface=True)
    return base64.b64decode(shot["data"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("langs", nargs="*", help="en and/or de (default: both)")
    parser.add_argument("--tab", action="append", choices=TABS, help="only these tabs (repeatable)")
    args = parser.parse_args()
    if bad := set(args.langs) - {"en", "de"}:
        parser.error(f"unknown language: {', '.join(sorted(bad))}")
    browser = Browser(find_chrome())
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        browser.call("Page.enable")
        browser.call("Emulation.setScrollbarsHidden", hidden=True)
        for lang in args.langs or ["en", "de"]:
            for tab in args.tab or TABS:
                target = OUT / (f"{tab}.png" if lang == "en" else f"{tab}-{lang}.png")
                target.write_bytes(capture(browser, tab, lang))
                print("wrote", target.relative_to(ROOT).as_posix())
    finally:
        browser.close()


if __name__ == "__main__":
    main()
