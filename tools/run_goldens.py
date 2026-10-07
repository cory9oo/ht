#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-652 S4 — ONE RUNNER FOR THE GOLDEN SUITE.

Runs every golden listed in tools/goldens.txt against the headless fixture and exits 1 on ANY
failure, 0 only when every one is green. The rail's TESTS line calls it after the job; every later
HT paste adds its golden to goldens.txt and is run by this same command.

It first brings the fixture (_machine/ht3) in step with THIS checkout, exactly as each golden expects
(tools/sync_fixture.py) — idempotent, so on an already-synced tree it writes nothing. If the fixture
directory is absent it is seeded once from ht-carried/ht3 (which carries the mock.js seam), the one
place a committed fixture lives; ht-carried is never modified.
"""
import os, sys, subprocess, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)                      # _machine/ht
MACHINE = os.path.dirname(REPO)                   # the bus root, _machine
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass


def fixture():
    env = os.environ.get('HT_FIXTURE_DIR')
    if env:
        return env
    for d in (os.path.join(MACHINE, 'ht3'), os.path.join(os.path.dirname(MACHINE), 'ht3')):
        if os.path.isdir(d):
            return d
    return os.path.join(MACHINE, 'ht3')


def ensure_fixture(fx):
    if os.path.exists(os.path.join(fx, 'mock.js')):
        return True
    seed = os.path.join(MACHINE, 'ht-carried', 'ht3')
    if os.path.isdir(seed) and os.path.exists(os.path.join(seed, 'mock.js')):
        print('seeding fixture %s from %s' % (fx, seed))
        shutil.copytree(seed, fx, dirs_exist_ok=True)
        return os.path.exists(os.path.join(fx, 'mock.js'))
    return False


def manifest():
    path = os.path.join(HERE, 'goldens.txt')
    out = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                out.append(line)
    return out


def main():
    fx = fixture()
    if not ensure_fixture(fx):
        print('run_goldens: no fixture with a mock.js seam at %s and none to seed from' % fx)
        return 1
    env = dict(os.environ, HT_FIXTURE_DIR=fx)
    # bring the fixture in step with this checkout (idempotent)
    sync = subprocess.run([sys.executable, os.path.join(HERE, 'sync_fixture.py')], env=env,
                          capture_output=True, text=True)
    if sync.returncode != 0:
        print('run_goldens: sync_fixture failed\n' + sync.stdout + sync.stderr)
        return 1

    goldens = manifest()
    if not goldens:
        print('run_goldens: goldens.txt lists nothing to run')
        return 1

    results = []
    for g in goldens:
        gp = os.path.join(HERE, g)
        if not os.path.exists(gp):
            print('  MISS %s (not found)' % g)
            results.append((g, False))
            continue
        r = subprocess.run([sys.executable, gp], env=env, capture_output=True, text=True)
        tail = (r.stdout.strip().splitlines() or [''])[-1]
        print('  %-4s %-26s %s' % ('PASS' if r.returncode == 0 else 'FAIL', g, tail))
        if r.returncode != 0:
            # surface the failing lines so the receipt is not a silent red
            for ln in r.stdout.splitlines():
                if 'FAIL' in ln:
                    print('         ' + ln.strip())
        results.append((g, r.returncode == 0))

    npass = sum(1 for _, ok in results if ok)
    print('\nGOLDEN SUITE: %d/%d green' % (npass, len(results)))
    return 0 if npass == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
