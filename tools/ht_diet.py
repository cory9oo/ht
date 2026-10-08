#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-705 — THE GOLDEN SUITE'S DIET, applied at ONE seam (no golden file touched).

Every golden launches its browser through `playwright.async_api.BrowserType.launch()`.
`install()` monkeypatches that one method so every `pw.chromium.launch(...)` a golden makes is given
the **chrome-headless-shell** channel and a set of GPU-off / low-weight flags. A golden that already
set a key keeps it (the caller wins); flags already present are not duplicated. Idempotent.

The policy IS the diet: one chrome-headless-shell renders each golden with its separate GPU process
suppressed, so one browser tree sits comfortably under the 0.4 GB cap `run_goldens.py` enforces. No
video and no trace are ever turned on here (the goldens record none today; the policy never does).

    python tools/ht_diet.py --selftest     # fast, usage-free, write-free proof the policy is real
"""
import sys

# The installed headless shell is chromium_headless_shell-1234 beside chromium-1234; Playwright 1.62
# reaches it through this channel. It is always headless and spawns a lighter tree than full chrome.
HS_CHANNEL = "chromium-headless-shell"

# GPU process OFF (the ~95 MB separate process is the swing over the cap) plus weight trims. NO
# --single-process: it crashes headless render (705 stress 4, proven at build). Tuned at build so one
# browser tree sits comfortably under 0.4 GB (target ~0.3 GB), not on the line.
HS_ARGS = [
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-gpu-compositing",
    "--in-process-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-background-networking",
    "--mute-audio",
    "--no-first-run",
]

_INSTALLED = False


def merged(kwargs):
    """`kwargs` for launch() with the diet merged in: the diet's channel unless the caller set one,
    and every HS_ARGS flag not already in the caller's `args`. Never mutates the caller's dict."""
    out = dict(kwargs)
    out.setdefault("channel", HS_CHANNEL)
    args = list(out.get("args") or [])
    for a in HS_ARGS:
        if a not in args:
            args.append(a)
    out["args"] = args
    return out


def install():
    """Monkeypatch BrowserType.launch so every pw.chromium.launch(...) runs under the diet. A second
    call is a no-op (idempotent) — so importing this in each golden subprocess is safe."""
    global _INSTALLED
    if _INSTALLED:
        return
    import playwright.async_api as pa
    orig = pa.BrowserType.launch

    async def launch(self, **kwargs):               # every golden calls launch with kwargs only
        return await orig(self, **merged(kwargs))

    launch.__ht_diet_orig__ = orig                  # keep the original reachable (never lost)
    pa.BrowserType.launch = launch
    _INSTALLED = True


# --------------------------------------------------------------------------- the selftest (no browser)
def _selftest():
    """Assert the policy is well-formed and that install() injects it into a captured launch(**kw).
    Uses a stub in place of the real launch, so NO browser is started: usage-free, write-free, fast,
    and independent of memory noise."""
    import asyncio
    import playwright.async_api as pa

    res = []

    def chk(name, ok):
        res.append(bool(ok))
        print("  %-4s %s" % ("PASS" if ok else "FAIL", name))

    # 1 — the policy itself is well-formed
    chk("channel is the headless shell", HS_CHANNEL == "chromium-headless-shell")
    chk("the GPU process is turned off in the args",
        "--disable-gpu" in HS_ARGS and "--disable-software-rasterizer" in HS_ARGS)
    chk("--single-process is NOT used (it crashes headless render)",
        "--single-process" not in HS_ARGS)
    chk("no video / trace flag is ever added by the policy",
        not any("record" in a or "trace" in a for a in HS_ARGS))

    # 2 — install() injects the policy into a launch() the way a golden calls it
    global _INSTALLED
    captured = {}

    async def stub(self, **kw):
        captured.clear()
        captured.update(kw)
        return "browser"

    saved = pa.BrowserType.launch
    try:
        pa.BrowserType.launch = stub
        _INSTALLED = False
        install()                                   # wraps the stub exactly as it wraps the real launch

        asyncio.run(pa.BrowserType.launch(None))    # a launch with nothing set -> the diet fills it
        chk("install() gives a bare launch() the headless-shell channel",
            captured.get("channel") == HS_CHANNEL)
        chk("install() gives a bare launch() the GPU-off args",
            "--disable-gpu" in (captured.get("args") or []))

        # a caller's own key is kept; its own arg is kept AND the diet's are still added
        asyncio.run(pa.BrowserType.launch(None, channel="keep-me", args=["--mine"]))
        chk("a channel the golden set is kept (the caller wins)",
            captured.get("channel") == "keep-me")
        chk("a golden's own arg is kept and the diet's are still merged in",
            "--mine" in (captured.get("args") or []) and "--disable-gpu" in (captured.get("args") or []))
    finally:
        pa.BrowserType.launch = saved
        _INSTALLED = False

    ok = sum(1 for r in res if r)
    print("\nHT-705 DIET SELFTEST: %d/%d PASS" % (ok, len(res)))
    return 0 if ok == len(res) else 1


if __name__ == "__main__":
    if "--selftest" in sys.argv[1:]:
        sys.exit(_selftest())
    print("ht_diet: the golden suite's launch policy. Run with --selftest to prove it, or import and "
          "call install() (see _golden_runner.py).")
    sys.exit(0)
