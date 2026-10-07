#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-652 S5 — THE BUILD MOVED PAST ITS BASE.

Reads version.json and exits 1 while it still says the base version this paste started from, 0 once
it has moved. The base is written in here (paste 652 started from ht-v53); the rail runs it after the
job so a landing that forgot to bump the version — the one thing that makes an installed phone fetch
the new build — cannot pass. Kept and re-based by every later HT paste.
"""
import os, sys, json

BASE = 'ht-v53'      # paste 652's starting version; the bump must take it past this
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass


def main():
    p = os.path.join(REPO, 'version.json')
    try:
        v = json.load(open(p, encoding='utf-8')).get('version')
    except Exception as e:
        print('version_moved: cannot read %s (%s)' % (p, e))
        return 1
    if v == BASE:
        print('version_moved: still at the base %s — not bumped' % BASE)
        return 1
    print('version_moved: %s (moved past %s)' % (v, BASE))
    return 0


if __name__ == '__main__':
    sys.exit(main())
