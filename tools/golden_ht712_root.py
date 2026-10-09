#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PASTE 712 GOLDEN — THE FIXTURE THIS RUN PREPARED IS WHOLE, AND IS THE OFFLINE HARNESS FIXTURE.

Browser-free and fast (well under a second). It reads HT_FIXTURE_DIR — the fixture run_goldens.py
prepared for THIS run: the shared _machine/ht3 in a default run, or the per-root
_machine/.ht_fixtures/<name> under `run_goldens.py --root <checkout>` — and asserts that fixture is
whole and is the offline harness fixture, never the live app:

  A1  index.html exists in the fixture
  A2  index.html carries the offline ./mock.js seam (sync_fixture's CDN substitution)
  A3  index.html does NOT carry the live Supabase CDN <script> (it was replaced, so the harness is offline)
  A4  app.js is present and non-empty
  A5  version.json is present

It prints its assertion count and FAILs on zero (R134 R1). It is valid in BOTH modes (shared ht3 or a
per-root fixture), so the full suite (ht_push, nightly) runs it too; and it is the one golden the
parallel proof runs under `--only`, because it exercises the whole --root pipeline (resolve → seed →
sync → run a golden against the per-root fixture) without a browser.
"""
import io
import os
import sys
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

RES = []


def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:220])))


def fixture_dir():
    """The fixture run_goldens.py prepared for this run: HT_FIXTURE_DIR wins (it always sets it); the
    fall-back mirrors run_goldens.fixture() so the golden is runnable by hand too."""
    fx = os.environ.get('HT_FIXTURE_DIR')
    if fx:
        return fx
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(here)
    machine = os.path.dirname(repo)
    for d in (os.path.join(machine, 'ht3'), os.path.join(os.path.dirname(machine), 'ht3')):
        if os.path.isdir(d):
            return d
    return os.path.join(machine, 'ht3')


def main():
    fx = fixture_dir()
    idx = os.path.join(fx, 'index.html')
    chk("A1 index.html exists in the fixture", os.path.isfile(idx), fx)
    html = ""
    if os.path.isfile(idx):
        try:
            html = io.open(idx, encoding='utf-8').read()
        except OSError as e:
            chk("A1b index.html readable", False, e)
    # A2/A3: sync_fixture turns the live Supabase CDN <script> into `./mock.js` — the supported offline
    # seam. A whole harness fixture carries the seam and NOT the CDN; the live app is the reverse.
    chk("A2 index.html carries the offline ./mock.js seam", './mock.js' in html, fx)
    chk("A3 index.html does NOT carry the live Supabase CDN script",
        'cdn.jsdelivr.net/npm/@supabase' not in html, fx)
    appjs = os.path.join(fx, 'app.js')
    chk("A4 app.js is present and non-empty",
        os.path.isfile(appjs) and os.path.getsize(appjs) > 0, appjs)
    chk("A5 version.json is present", os.path.isfile(os.path.join(fx, 'version.json')), fx)

    npass = sum(1 for ok, _ in RES if ok)
    print("\nGOLDEN HT-712-ROOT: %d/%d PASS, %d FAIL  (fixture %s)"
          % (npass, len(RES), len(RES) - npass, fx))
    sys.exit(0 if npass == len(RES) and RES else 1)


if __name__ == '__main__':
    main()
