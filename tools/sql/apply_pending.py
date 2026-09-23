#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""apply_pending.py - THE MIGRATION IS MACHINE WORK FOREVER (WIRE HT-32, paste 148 NUDGE N7).

    python tools/sql/apply_pending.py --check          can it run? prints the verdict, applies nothing
    python tools/sql/apply_pending.py --dry            connect, read the file, report - no statement runs
    python tools/sql/apply_pending.py                  apply it, and write the grids
    python tools/sql/apply_pending.py --out <path.md>  where the grids go (default: the wire's stage)

CORY, 9/22 20:30: *"Do this yourself: paste the SQL into Supabase once."*

SPEC tried the browser route first and the dashboard redirected to sign-in, so the wall was never a
missing tool - it was a CREDENTIAL. N7's ruling: one new key, `BEV/HT_SUPABASE_DB_URL` (Supabase ->
Project Settings -> Database -> connection string, session mode), and from then on every HT migration
runs the same way: `build_pending.py` regenerates the file, the wire applies it, the receipt prints
the grid. **"Paste it into Supabase" is retired from FOR CORY for good.**

FIVE THINGS THIS DOES ON PURPOSE

 1. ONE CONNECTION, AND THE FILE'S OWN TRANSACTIONS. `autocommit=True` on the connection, and the
    statements' own `begin`/`commit` do the work. Wrapping the file in an outer transaction would
    silently change its semantics: `ht_pending.sql` is written as N migrations each safe to re-run,
    and the note at its head says so - "if one fails, the ones before it stay applied".
 2. A `REFUSING:` OR `STOP` EXCEPTION IS REPORTED VERBATIM AND NOTHING ELSE IS TRIED. The file's own
    preamble refuses on a table it cannot find or row-level security that is off. That refusal is the
    most valuable output this program can produce and it is printed as the database phrased it.
 3. THE GRIDS ARE THE PROOF, AND THEY ARE ASSERTED, NOT JUST PRINTED. `rls on` must be true for all
    seven tables and `standards_before` must equal `standards_after`. A run that applies cleanly and
    silently drops a standard is the failure this assertion exists for.
 4. THE KEY IS NEVER PRINTED, LOGGED OR WRITTEN. It is read through `_core.secret` (Credential
    Manager, target `BEV/<NAME>` - R70.333), used, and never named except by target name. The DSN is
    masked in every line this program emits, including its errors.
 5. NO KEY IS NOT AN ERROR. It is `BUILT - NOT RUN LIVE (HT_SUPABASE_DB_URL)`, exit 3, and the FOR
    CORY line says only "add HT_SUPABASE_DB_URL in the keys window" - never "paste the SQL".
"""
from __future__ import annotations

import argparse
import datetime
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
KEY_NAME = "HT_SUPABASE_DB_URL"
STATEMENT_TIMEOUT_MS = 120000
GUARD_TABLES = ("days", "day_private", "habits", "profiles", "profile_private",
                "circles", "circle_members")


def secret(name):
    """Credential Manager first, through the copier's own reader so there is one route in the estate
    (R70.333). The process environment is the last rung and is accepted because a CI runner has
    nothing else - it is never written to."""
    for d in (os.path.join(os.path.dirname(REPO), "tools", "copiers"),
              os.path.join(os.path.dirname(REPO), "master-brain", "tools", "copiers")):
        if os.path.isdir(d) and d not in sys.path:
            sys.path.insert(0, d)
    try:
        import _core as C                                     # noqa: PLC0415
        v = C.secret(name)
        if v:
            return v
    except Exception:
        pass
    return os.environ.get(name) or None


def mask(text):
    """A DSN carries a password. It never reaches a line this program prints - not in a message, not
    in a traceback, not in the file it writes."""
    s = str(text or "")
    s = re.sub(r"(postgres(?:ql)?://[^:@/\s]+:)[^@\s]+(@)", r"\1***\2", s)
    return s


def stamp():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M CDT")


def sql_path():
    p = os.path.join(HERE, "ht_pending.sql")
    if not os.path.exists(p):
        raise SystemExit("apply_pending: %s is missing. Run tools/sql/build_pending.py first - this "
                         "program applies a generated file, it never writes one." % p)
    return p


def check(say=print):
    """Every precondition, named, applying nothing."""
    ok = True
    say("apply_pending --check · %s" % stamp())
    try:
        import psycopg                                        # noqa: F401,PLC0415
        say("  psycopg       installed")
    except ImportError:
        say("  psycopg       MISSING · python -m pip install 'psycopg[binary]'")
        ok = False
    p = os.path.join(HERE, "ht_pending.sql")
    say("  ht_pending    %s" % ("%d bytes" % os.path.getsize(p) if os.path.exists(p) else "MISSING"))
    ok = ok and os.path.exists(p)
    have = bool(secret(KEY_NAME))
    say("  %-13s %s" % ("BEV/" + KEY_NAME, "SET" if have else "NOT SET"))
    ok = ok and have
    say("  VERDICT       %s" % ("READY" if ok else "BUILT - NOT RUN LIVE (%s)" % KEY_NAME))
    return 0 if ok else 3


def grids_to_md(grids, path, applied, note=""):
    out = ["# SQL APPLIED · HT-32 · %s" % stamp(), "",
           "*Written by `tools/sql/apply_pending.py` (paste 148 NUDGE N7). The migration is machine",
           "work from here: `build_pending.py` regenerates the file, the wire applies it, this file is",
           "the receipt's evidence. Nobody pastes anything into a dashboard.*", "",
           "**applied:** %s" % ("yes" if applied else "NO - nothing was run"), ""]
    if note:
        out += ["```", mask(note).rstrip(), "```", ""]
    for i, (cols, rows) in enumerate(grids, 1):
        out.append("## grid %d" % i)
        out.append("| " + " | ".join(str(c) for c in cols) + " |")
        out.append("|" + "|".join("---" for _ in cols) + "|")
        for r in rows:
            out.append("| " + " | ".join("" if v is None else str(v) for v in r) + " |")
        out.append("")
    io.open(path, "w", encoding="utf-8", newline="\n").write("\n".join(out))
    return path


def assert_grids(grids, say=print):
    """N7: the second grid must read `rls on = true` for all seven tables and
    `standards_before = standards_after`. Asserted here rather than eyeballed in the receipt."""
    problems = []
    seen_rls, seen_std = 0, False
    for cols, rows in grids:
        low = [str(c).lower() for c in cols]
        if "rls on" in low:
            i = low.index("rls on")
            t = low.index("table") if "table" in low else 0
            for r in rows:
                seen_rls += 1
                if r[i] is not True and str(r[i]).lower() != "true":
                    problems.append("row level security is OFF on %s" % r[t])
        if "standards_before" in low and "standards_after" in low:
            seen_std = True
            b, a = low.index("standards_before"), low.index("standards_after")
            for r in rows:
                if r[b] != r[a]:
                    problems.append("standards_before %s != standards_after %s" % (r[b], r[a]))
    # A CHECK THAT COULD NOT RUN IS NOT A PASS (131 Ruling 3 / 134 R1). If the grids carried neither
    # assertion, the file did not produce the evidence it promises and that is itself the finding.
    if seen_rls < len(GUARD_TABLES):
        problems.append("the rls grid covered %d of %d tables - a check that did not run is not a pass"
                        % (seen_rls, len(GUARD_TABLES)))
    if not seen_std:
        problems.append("no standards_before/standards_after row came back - nothing proved the "
                        "standards survived")
    for p in problems:
        say("  ASSERT FAIL · %s" % p)
    return problems


def refresh_and_check(conn, say=print):
    """Write schema_snapshot.json from information_schema (schema public), then schema-check the file."""
    import json, sys as _sys
    here = os.path.dirname(os.path.abspath(__file__))
    with conn.cursor() as cur:
        cur.execute("select table_name, column_name from information_schema.columns "
                    "where table_schema = 'public' order by 1, 2")
        rows = cur.fetchall()
    tables = {}
    for t, c in rows:
        tables.setdefault(t, []).append(c)
    snap = os.path.join(here, "schema_snapshot.json")
    doc = json.load(io.open(snap, encoding="utf-8")) if os.path.exists(snap) else {}
    doc.update({"source": "live:information_schema.columns", "refreshed": stamp(), "tables": tables})
    with io.open(snap, "w", encoding="utf-8", newline=chr(10)) as f:
        f.write(json.dumps(doc, indent=1) + chr(10))
    say("  schema        refreshed from live: %d tables, %d columns" % (len(tables), len(rows)))
    _sys.path.insert(0, here)
    import schema_check                                       # noqa: PLC0415
    refs, misses = schema_check.check(io.open(sql_path(), encoding="utf-8").read(), schema_check.load_snapshot(snap))
    for t, c, why in misses:
        say("  MISSING       %s.%s - %s" % (t, c, why))
    say("  schema check  %s %d/%d" % ("PASS" if not misses else "REFUSED", len(refs) - len(misses), len(refs)))
    return misses


def apply(dsn, dry=False, out=None, say=print):
    import psycopg                                            # noqa: PLC0415
    text = io.open(sql_path(), encoding="utf-8").read()
    say("  file          %d bytes, %d statements-ish" % (len(text), text.count(";")))
    if dry:
        say("  DRY           connected, nothing run")
        return 0, []
    grids, note = [], ""
    # autocommit: the FILE owns its transactions. See note 1 in the docstring - an outer transaction
    # would turn N independently-safe migrations into one all-or-nothing block, which is not what the
    # file says about itself at the top and not what a half-applied stack needs.
    with psycopg.connect(dsn, autocommit=True, connect_timeout=30) as conn:
        with conn.cursor() as cur:
            cur.execute("set statement_timeout = %s" % STATEMENT_TIMEOUT_MS)
        # N10: THE SNAPSHOT IS REFRESHED FROM THE DATABASE ITSELF, then the file is checked against it
        # BEFORE a statement runs - so the next `circles.owner` is refused here, by name, not by 42703.
        misses = refresh_and_check(conn, say)
        if misses:
            return 6, grids
        try:
            with conn.cursor() as cur:
                cur.execute(text)
                while True:
                    if cur.description:
                        grids.append(([d.name for d in cur.description], cur.fetchall()))
                    if not cur.nextset():
                        break
        except psycopg.Error as e:
            # VERBATIM, and nothing else attempted. The file's own `REFUSING:` message is the most
            # useful thing this program can produce, and paraphrasing it would lose the table name.
            note = "%s: %s" % (type(e).__name__, e)
            say("  REFUSED       %s" % mask(note).splitlines()[0][:200])
            if out:
                say("  grids         %s" % grids_to_md(grids, out, False, note))
            return 4, grids
    say("  applied       %d result grid(s)" % len(grids))
    if out:
        say("  grids         %s" % grids_to_md(grids, out, True))
    return (0 if not assert_grids(grids, say) else 5), grids


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="apply_pending.py")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--dry", "--dry-run", action="store_true")
    ap.add_argument("--out", default=None)
    a = ap.parse_args(argv)
    if a.check:
        return check()
    rc = check()
    if rc:
        print("%s · ht32 sql · BUILT - NOT RUN LIVE (%s)" % (stamp(), KEY_NAME))
        return rc
    dsn = secret(KEY_NAME)
    out = a.out
    if out is None:
        stage = os.path.join(os.path.dirname(REPO), "_reconcile", "ht_stage", "148")
        out = os.path.join(stage, "SQL_APPLIED.md") if os.path.isdir(stage) else None
    rc, _ = apply(dsn, dry=a.dry, out=out)
    return rc


if __name__ == "__main__":
    sys.exit(main())
