#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-705 — the subprocess entry run_goldens.py uses to run ONE golden UNDER THE DIET.

    python tools/_golden_runner.py <path-to-golden.py> [golden args...]

It imports ht_diet, installs the launch policy, then runs the golden as `__main__` via runpy — so the
diet (chrome-headless-shell, GPU off) is active in every golden with NO golden file touched. The
golden's own `sys.exit(...)` propagates out of this process unchanged, so run_goldens.py still grades
on the golden's real exit code.
"""
import os
import runpy
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)                        # so `import ht_diet` finds the sibling

import ht_diet


def main(argv):
    if not argv:
        print("_golden_runner: need a golden path")
        return 2
    golden = argv[0]
    if os.environ.get("HT_DIET") != "0":            # HT_DIET=0 is the S6 "before the diet" measurement
        ht_diet.install()
    # the golden sees its own argv (its path, then any args), exactly as `python <golden>` would
    sys.argv = [golden] + list(argv[1:])
    runpy.run_path(golden, run_name="__main__")     # the golden's sys.exit() raises through here
    return 0                                         # only reached if the golden never calls sys.exit


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
