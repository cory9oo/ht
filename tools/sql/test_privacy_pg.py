#!/usr/bin/env python3
"""test_privacy_pg.py - paste 133 S4 proven on a real Postgres before anyone pastes the SQL (WIRE HT-29).

    python tools/sql/test_privacy_pg.py            # needs Docker and the local postgres:17-alpine image
    python tools/sql/test_privacy_pg.py --variant json_textarray

WHAT IT PROVES. The live database cannot be reached from this laptop (no service key, no CLI), so the
SQL is proven here instead: a throwaway Postgres gets Supabase's roles and auth.uid() plus the app's
seven tables (harness_supabase.sql), three people - an owner, a member, a stranger - each with standards,
days and a journal, and then:
  BEFORE  the believed live policies reproduce the bug: owner and member each see only themselves.
  AFTER   2026-09-15_ht29.sql: both see each other; nobody reads anybody's journal (a planted wider
          policy on day_private is gone); a co-member reads task names and check-offs through
          ht29_member_day and the rating NUMBER through ht29_circle_ratings, never a journal column;
          a stranger reads nothing; every owner path the app uses still works; a second run changes
          nothing; the one-line revoke takes the rating number away; the rollback restores the backup.
The container is named ht29-privacy-<hex>, started with --rm, and stopped at the end whatever happens.
No test user, email or name here is real (R3: `standard` is a public repository).
"""
from __future__ import annotations

import argparse, datetime, json, os, socket, subprocess, sys, time, uuid

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
IMAGE = "postgres:17-alpine"
RES: list[tuple[bool, str]] = []

OWNER, MEMBER, STRANGER = (str(uuid.UUID(int=i)) for i in (0x0A, 0x0B, 0x0C))
TODAY = datetime.date(2026, 9, 15)
JOURNAL = {"why": "WHY-TEXT", "tasks": "COMPLETED-TEXT", "prayer": "PRAYER-TEXT", "brain_dump": "DUMP-TEXT"}
JOURNAL_COLS = ("why", "tasks", "prayer", "brain_dump", "predict")
# (name, group_name, cadence, planned_start, time_anchor) - one of each shape the app draws today
OWNER_ROWS = [("Morning prayer", "Morning", "daily", "06:00", None),              # TIMED -> morning
              ("Gym", "Other", "daily", None, None),                               # ANYTIME -> standards
              ("Lights out", "Night", "daily", None, "21:45"),                     # TIMED (anchor) -> morning
              ("Weekly review", "Other", "weekly", None, None),                    # WEEKLY -> weekly
              ("Sabbath - rest and worship", "SABBATH", "dow:6", None, None)]      # the Sabbath -> night


def chk(name, ok, got=""):
    RES.append((bool(ok), name))
    print("  %-6s %s%s" % ("PASS" if ok else "FAIL", name, "" if ok else ("   -> " + str(got)[:300])))


def read(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return f.read()


# ------------------------------------------------------------------------------------------ the container
class Postgres:
    def __init__(self):
        self.name = "ht29-privacy-%s" % uuid.uuid4().hex[:8]
        s = socket.socket(); s.bind(("127.0.0.1", 0)); self.port = s.getsockname()[1]; s.close()

    def __enter__(self):
        subprocess.run(["docker", "run", "-d", "--rm", "--name", self.name, "-e", "POSTGRES_PASSWORD=ht29",
                        "-p", "127.0.0.1:%d:5432" % self.port, IMAGE], check=True, capture_output=True)
        import psycopg
        deadline = time.time() + 60
        while True:
            try:
                self.conn = psycopg.connect(host="127.0.0.1", port=self.port, user="postgres",
                                            password="ht29", dbname="postgres", autocommit=True)
                return self
            except Exception:
                if time.time() > deadline:
                    raise
                time.sleep(0.5)

    def __exit__(self, *exc):
        try:
            self.conn.close()
        except Exception:
            pass
        subprocess.run(["docker", "stop", self.name], capture_output=True)


def run_script(conn, sql):
    """A whole file, as the SQL editor runs it (the file carries its own begin/commit)."""
    with conn.cursor() as cur:
        cur.execute(sql)


def run_value(conn, sql, params=None):
    """One row, as the database owner. HT-31: the tests above read as a PERSON; a couple of setup facts
    (a join code, a column's default) are the database's own and are read as the database."""
    with conn.cursor() as cur:
        cur.execute(sql, params or ())
        return cur.fetchone()


def as_user(conn, uid, sql, params=None, write=False):
    """(rows, error) for one statement under `authenticated` with that person's JWT subject.
    Rolled back unless write=True, so a probe never changes what the next probe sees."""
    import psycopg
    rows, err = None, None
    with conn.transaction() as tx:
        with conn.cursor() as cur:
            cur.execute("set local role authenticated")
            cur.execute("select set_config('request.jwt.claims', %s, true)",
                        (json.dumps({"sub": uid, "role": "authenticated"}),))
            try:
                with conn.transaction():
                    cur.execute(sql, params or ())
                    rows = cur.fetchall() if cur.description else []
            except psycopg.Error as e:
                err = e
        if not write:
            raise_rollback(tx)
    return rows, err


class _Rollback(Exception):
    pass


def raise_rollback(tx):
    import psycopg
    raise psycopg.Rollback(tx)


def seed(conn, variant):
    with conn.cursor() as cur:
        for uid, mail in ((OWNER, "owner@example.com"), (MEMBER, "member@example.com"),
                          (STRANGER, "stranger@example.com")):
            cur.execute("insert into auth.users (id, email) values (%s, %s)", (uid, mail))
        cur.execute("insert into public.profiles (id, display_name) values (%s, 'Owner'), (%s, 'Stranger')",
                    (OWNER, STRANGER))                                   # the member has no profile row yet
        for uid, rows_ in ((OWNER, OWNER_ROWS),
                           (MEMBER, [("Read", None, "daily", None, None), ("Walk", None, "daily", None, None)]),
                           (STRANGER, [("Swim", None, "daily", None, None)])):
            ids = []
            for k, (n, g, cad, ps, ta) in enumerate(rows_):
                cur.execute("insert into public.habits (user_id, name, group_name, cadence, sort_order, notes, "
                            "planned_start, time_anchor) values (%s, %s, %s, %s, %s, %s, %s, %s) returning id",
                            (uid, n, g, cad, k, "done when %s is done" % n.lower(), ps, ta))
                ids.append(str(cur.fetchone()[0]))
            checked = {ids[0]: "06:12"}
            if variant == "json_textarray":
                cur.execute("insert into public.days (user_id, date, checked, active_set, pct) "
                            "values (%s, %s, %s::json, %s::text[], 50)",
                            (uid, TODAY, json.dumps(checked), ids))
            else:
                cur.execute("insert into public.days (user_id, date, checked, active_set, pct) "
                            "values (%s, %s, %s::jsonb, %s::jsonb, 50)",
                            (uid, TODAY, json.dumps(checked), json.dumps(ids)))
            cur.execute("insert into public.day_private (user_id, date, rating, why, tasks, prayer, brain_dump) "
                        "values (%s, %s, 7, %s, %s, %s, %s)",
                        (uid, TODAY, *(JOURNAL[c] + "-" + uid[-1] for c in ("why", "tasks", "prayer", "brain_dump"))))
        cur.execute("insert into public.circles (name, join_code, owner) values ('Circle', 'ABC123', %s) returning id",
                    (OWNER,))
        circle = str(cur.fetchone()[0])
        cur.execute("insert into public.circle_members (circle_id, user_id) values (%s, %s), (%s, %s)",
                    (circle, OWNER, circle, MEMBER))
    return circle


def apply_variant(sql, variant):
    if variant == "json_textarray":
        sql = sql.replace("checked jsonb default '{}'::jsonb, active_set jsonb default '[]'::jsonb",
                          "checked json default '{}'::json, active_set text[] default '{}'")
    return sql


def policies(conn, tables=("day_private", "profile_private", "habits")):
    with conn.cursor() as cur:
        cur.execute("select tablename, policyname, cmd, coalesce(qual,''), coalesce(with_check,'') "
                    "from pg_policies where schemaname='public' and tablename = any(%s) order by 1, 2",
                    (list(tables),))
        return cur.fetchall()


def denied(c, sql: str):
    """True only when `anon` was refused for the RIGHT reason - 42501 insufficient_privilege.

    The old shape caught every Exception, so a typo'd table name, an aborted transaction or a dropped socket
    all read as "permission denied". An assertion that any failure satisfies proves nothing about permissions.
    """
    import psycopg
    with c.cursor() as cur:
        cur.execute("set role anon")
        try:
            cur.execute(sql)
            got = (False, "anon READ IT - %d row(s)" % len(cur.fetchall() or []))
        except psycopg.errors.InsufficientPrivilege as e:
            got = (True, e.sqlstate)
        except Exception as e:                       # a different failure is not a proof of privacy
            got = (False, "%s %s" % (type(e).__name__, getattr(e, "sqlstate", "")))
        c.rollback()
    with c.cursor() as cur:
        cur.execute("reset role")
    return got


# ------------------------------------------------------------------------------------------------ the test
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", choices=["jsonb", "json_textarray"], default="jsonb")
    a = ap.parse_args()
    # A SKIP IS NOT A PASS, and it must not read like one. CLAUDE.md cites this file as the proof the privacy
    # migration is safe, so a caller that only reads the exit code would take "psycopg is missing" for "51/51".
    # Exit 3 means "asserted nothing"; only a complete run prints the VERDICT line at the end.
    try:
        import psycopg  # noqa: F401
    except ImportError:
        print("SKIP · psycopg is not installed · VERDICT: NOT RUN"); return 3
    if subprocess.run(["docker", "image", "inspect", IMAGE], capture_output=True).returncode != 0:
        print("SKIP · docker or the local %s image is not available · VERDICT: NOT RUN" % IMAGE); return 3

    migration, rollback = read("2026-09-15_ht29.sql"), read("2026-09-15_ht29_rollback.sql")
    with Postgres() as pg:
        c = pg.conn
        run_script(c, apply_variant(read("harness_supabase.sql"), a.variant))
        circle = seed(c, a.variant)
        # a WIDER policy someone might have left on the journal - the migration must remove it
        run_script(c, "create policy \"planted circle read\" on public.day_private for select "
                      "using (public.shares_circle_with(user_id));")

        print("BEFORE · the believed live policies (%s)" % a.variant)
        rows, _ = as_user(c, OWNER, "select user_id from public.circle_members where circle_id = %s", (circle,))
        chk("B1 · before: the owner sees only himself in his circle (the bug)",
            rows is not None and [str(r[0]) for r in rows] == [OWNER], rows)
        rows, _ = as_user(c, MEMBER, "select why from public.day_private where user_id = %s", (OWNER,))
        chk("B2 · before: the planted policy leaks the owner's journal to the member (the harness bites)",
            rows is not None and len(rows) == 1, rows)
        before = policies(c)

        with c.cursor() as cur:
            cur.execute("select count(*) from public.habits")
            habits_before = cur.fetchone()[0]

        print("APPLY · 2026-09-15_ht29.sql")
        grids = []
        with c.cursor() as cur:
            cur.execute(migration)
            while True:
                if cur.description:
                    grids.append(cur.fetchall())
                if not cur.nextset():
                    break
        # the file prints TWO grids: the counts, then the row-level-security switch. Keeping only the last one
        # made this read the wrong table and call a correct migration broken.
        grid = grids[0] if grids else None
        rls_grid = grids[1] if len(grids) > 1 else []
        with c.cursor() as cur:
            cur.execute("select name, section from public.habits where user_id = %s order by sort_order", (OWNER,))
            placed = dict(cur.fetchall())
            cur.execute("select count(*) from public.habits")
            habits_after = cur.fetchone()[0]
        chk("S2.7a · Ruling 3: TIMED -> morning (planned_start and time_anchor)",
            placed.get("Morning prayer") == "morning" and placed.get("Lights out") == "morning", placed)
        chk("S2.7b · Ruling 3: ANYTIME -> standards, WEEKLY -> weekly",
            placed.get("Gym") == "standards" and placed.get("Weekly review") == "weekly", placed)
        chk("S2.10 · the Sabbath -> night", placed.get("Sabbath - rest and worship") == "night", placed)
        chk("S2.7c · zero rows lost (%d before, %d after)" % (habits_before, habits_after), habits_before == habits_after)
        chk("S2.7d · the result grid prints before = after and 0 journal policies left that are not ht29's",
            grid and grid[0][0] == grid[0][1] == habits_after and grid[0][6] == 0, grid)
        # the second grid is the switch itself: every table it names must read true, and it must say what the
        # reading was BEFORE - that column is what the rollback restores from
        chk("S4 · the result grid prints row level security ON for all seven tables, and what it was before",
            len(rls_grid) == 7 and all(r[1] is True for r in rls_grid) and all(r[2] is not None for r in rls_grid),
            rls_grid)
        after_first = policies(c, ("day_private", "profile_private", "habits", "days", "profiles", "circles",
                                   "circle_members", "push_subscriptions", "nudge_prefs"))

        rows, _ = as_user(c, OWNER, "select user_id from public.circle_members where circle_id = %s order by 1", (circle,))
        chk("S3.11a · owner sees the member", rows and sorted(str(r[0]) for r in rows) == sorted([OWNER, MEMBER]), rows)
        rows, _ = as_user(c, MEMBER, "select user_id from public.circle_members where circle_id = %s order by 1", (circle,))
        chk("S3.11b · member sees the owner (both ways)", rows and sorted(str(r[0]) for r in rows) == sorted([OWNER, MEMBER]), rows)
        rows, _ = as_user(c, STRANGER, "select user_id from public.circle_members where circle_id = %s", (circle,))
        chk("S3.11c · a stranger sees no membership", rows == [], rows)

        for who, label in ((MEMBER, "member"), (STRANGER, "stranger")):
            rows, err = as_user(c, who, "select why, tasks, prayer, brain_dump, rating from public.day_private "
                                        "where user_id = %s", (OWNER,))
            chk("S4.16 · %s selects the owner's journal columns: 0 rows" % label, rows == [] and err is None, (rows, err))
        rows, _ = as_user(c, MEMBER, "select policyname from pg_policies where tablename = 'day_private' "
                                     "and policyname = 'planted circle read'")
        chk("S4.15a · the planted wider journal policy is gone", rows == [], rows)
        chk("S4.15b · every journal policy is owner-only",
            all("auth.uid()" in (q + w) and "shares" not in (q + w) for t, _, _, q, w in policies(c, ("day_private",))),
            policies(c, ("day_private",)))
        rows, _ = as_user(c, MEMBER, "select name from public.habits where user_id = %s", (OWNER,))
        chk("S4.15c · the base habits table stays owner-only (0 rows for a member)", rows == [], rows)

        rows, err = as_user(c, MEMBER, "select public.ht29_member_day(%s, %s)", (OWNER, TODAY))
        day = rows[0][0] if rows else None
        names = sorted(h["name"] for h in (day or {}).get("habits", []))
        flat = json.dumps(day or {})
        chk("S3.13a · member_day gives the member the owner's task names and sections",
            names == sorted(r[0] for r in OWNER_ROWS) and all(h.get("section") for h in day.get("habits", [])), (day, err))
        chk("S3.13b · member_day carries check-offs with their time", "06:12" in flat and day.get("pct") == 50, day)
        chk("S3.13c · member_day carries the definition of done and the planned time",
            "done when gym is done" in flat and "06:00" in flat, day)
        chk("S3.13d · member_day carries no journal column and no rating",
            not any(k in flat for k in ("WHY-TEXT", "COMPLETED-TEXT", "PRAYER-TEXT", "DUMP-TEXT", '"rating"', '"why"')), flat)
        rows, _ = as_user(c, STRANGER, "select public.ht29_member_day(%s, %s)", (OWNER, TODAY))
        chk("S3.13e · a stranger's member_day is null", rows and rows[0][0] is None, rows)

        rows, err = as_user(c, MEMBER, "select user_id, date, rating from public.ht29_circle_ratings(%s, %s)", (TODAY, TODAY))
        chk("S5.18a · the member reads the owner's rating NUMBER", rows and [(str(r[0]), r[2]) for r in rows] == [(OWNER, 7)], (rows, err))
        rows, _ = as_user(c, STRANGER, "select * from public.ht29_circle_ratings(%s, %s)", (TODAY, TODAY))
        chk("S5.18b · a stranger reads no rating", rows == [], rows)

        rows, err = as_user(c, MEMBER, "select public.ht29_join_circle('abc123 ')", write=True)
        rows2, err2 = as_user(c, MEMBER, "select public.ht29_join_circle('ABC123')", write=True)
        chk("S3.11d · joining twice is safe and returns the same circle", err is None and err2 is None
            and rows and rows2 and str(rows[0][0]) == str(rows2[0][0]) == circle, (rows, err, rows2, err2))
        rows, err = as_user(c, STRANGER, "select public.ht29_join_circle('NOPE00')")
        chk("S3.11e · a wrong code says NO_SUCH_CIRCLE (P0002)", err is not None and getattr(err, "sqlstate", "") == "P0002", err)
        with c.cursor() as cur:
            cur.execute("select count(*) from public.circle_members where circle_id = %s", (circle,))
            chk("S3.11f · still exactly two memberships", cur.fetchone()[0] == 2)

        # the owner's own paths, as the app calls them (WIRE HT-29 recon of app.js)
        rows, err = as_user(c, OWNER, "update public.habits set section = 'night' where user_id = %s "
                                      "and name = 'Lights out' returning id", (OWNER,), write=True)
        chk("S2 · the owner places a standard in a section (kept for the rollback check)", err is None and rows, err)
        rows, err = as_user(c, OWNER, "update public.habits set section = 'evening' where user_id = %s "
                                      "and name = 'Gym' returning id", (OWNER,))
        chk("S2 · a section outside the four is refused", err is not None, (rows, err))
        ok_paths = []
        for label, uid, sql, params in (
            ("habits select", OWNER, "select id, name from public.habits where user_id = %s and active = true", (OWNER,)),
            ("habits insert", OWNER, "insert into public.habits (user_id, name) values (%s, 'New') returning id", (OWNER,)),
            ("days upsert", OWNER, "insert into public.days (user_id, date, pct) values (%s, %s, 60) on conflict (user_id, date) do update set pct = excluded.pct returning pct", (OWNER, TODAY)),
            ("day_private upsert", OWNER, "insert into public.day_private (user_id, date, why) values (%s, %s, 'x') on conflict (user_id, date) do update set why = excluded.why returning why", (OWNER, TODAY)),
            ("profile_private upsert", OWNER, "insert into public.profile_private (id, target_age) values (%s, 90) on conflict (id) do update set target_age = excluded.target_age returning id", (OWNER,)),
            ("circle create + select back", OWNER, "insert into public.circles (name, join_code, owner) values ('Second', 'XYZ789', %s) returning id", (OWNER,)),
            ("member creates own profile", MEMBER, "insert into public.profiles (id, display_name) values (%s, 'Member') on conflict (id) do update set display_name = excluded.display_name returning id", (MEMBER,)),
            ("co-member days read", MEMBER, "select user_id, date, pct from public.days where user_id = %s", (OWNER,)),
        ):
            rows, err = as_user(c, uid, sql, params)
            ok_paths.append((label, err is None and bool(rows), err))
        for label, ok, err in ok_paths:
            chk("S4.16 · own path still works: %s" % label, ok, err)
        rows, err = as_user(c, MEMBER, "update public.habits set name = 'hijack' where user_id = %s returning id", (OWNER,))
        chk("S4.16 · a member cannot write the owner's standards", rows == [] and err is None, (rows, err))

        rows, err = as_user(c, MEMBER, "insert into public.push_subscriptions (endpoint, p256dh, auth_key) "
                                       "values ('https://push.example.com/m', 'p', 'a') returning user_id", write=True)
        chk("S9 · a person stores their own push subscription", err is None and rows and str(rows[0][0]) == MEMBER, (rows, err))
        rows, _ = as_user(c, OWNER, "select endpoint from public.push_subscriptions")
        chk("S9 · nobody reads another person's subscription", rows == [], rows)

        anon_ok, why = denied(c, "select count(*) from public.days")
        chk("S4 · anon still has no grant (42501, not just any error)", anon_ok, why)

        run_script(c, "insert into public.app_config (key, value) values ('google_client_id', 'x.apps.googleusercontent.com')")
        rows, err = as_user(c, MEMBER, "select value from public.app_config where key = 'google_client_id'")
        chk("S6.23 · a signed-in person reads the app's Google id", err is None and rows == [("x.apps.googleusercontent.com",)], (rows, err))
        rows, err = as_user(c, MEMBER, "update public.app_config set value = 'hijack' returning key")
        chk("S6.23 · nobody changes app_config from the app", err is not None or rows == [], (rows, err))
        anon_cfg, why = denied(c, "select count(*) from public.app_config")
        chk("S6.23 · anon reads no app_config (42501, not just any error)", anon_cfg, why)

        with c.cursor() as cur:
            cur.execute("select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1")
            chk("S7.27 · days, day_private and habits are in the realtime publication",
                [r[0] for r in cur.fetchall()] == ["day_private", "days", "habits"])

        # =========================================================================================
        # HT-31 (paste 143 S6.19, as NUDGE N2 kept it) - THE STACK'S LAST MIGRATION, AND THE HALF OF
        # PRIVACY NOBODY TESTS: not "can A READ B's journal" but "can A COUNT it, or ask whether it
        # EXISTS". A policy that returns no rows still answers a yes/no question if a count comes back
        # non-zero, and "0 rows" and "row hidden" look identical only until someone counts.
        # =========================================================================================
        print("HT-31 · 2026-09-22_ht31.sql, and what a member cannot infer")
        run_script(c, read("2026-09-22_ht31.sql"))
        with c.cursor() as cur:
            cur.execute("select count(*) from information_schema.columns where table_schema='public' "
                        "and table_name='circles' and column_name='members_can_invite'")
            chk("S6.18 · circles.members_can_invite exists", cur.fetchone()[0] == 1)
            cur.execute("select members_can_invite from public.circles where id = %s", (circle,))
            chk("S7.21 · and any member may invite by default", cur.fetchone()[0] is True)

        code, = run_value(c, "select join_code from public.circles where id = %s", (circle,))
        rows, err = as_user(c, STRANGER, "select * from public.ht31_circle_peek(%s)", (code,))
        chk("S7.23 · a person holding the code is told the group's name and how many are in it",
            err is None and rows is not None and len(rows) == 1 and rows[0][1] == 2, (rows, err))
        with c.cursor() as cur:
            cur.execute("select string_agg(a.attname, ',' order by a.attnum) from pg_proc p "
                        "join pg_namespace n on n.oid = p.pronamespace "
                        "join unnest(p.proargnames) with ordinality a0(attname, ord) on true "
                        "join lateral (select a0.attname, a0.ord as attnum) a on true "
                        "where n.nspname='public' and p.proname='ht31_circle_peek'")
            names = (cur.fetchone() or [None])[0] or ""
        chk("S7.23 · and it answers with TWO things and no third (%s)" % names,
            sorted(x for x in names.split(",") if x and x != "code") == ["members", "name"], names)
        rows, err = as_user(c, STRANGER, "select * from public.ht31_circle_peek(%s)", ("NOSUCHCODE",))
        chk("S7.23 · a dead code returns nothing at all", err is None and rows == [], (rows, err))

        # THE COUNT AND THE INFERENCE, one probe each, from the member who CAN see the owner's day
        for who, what, sql in (
            ("count", "day_private", "select count(*) from public.day_private where user_id = %s"),
            ("count", "profile_private", "select count(*) from public.profile_private where id = %s"),
        ):
            rows, err = as_user(c, MEMBER, sql, (OWNER,))
            chk("S6.19 · a co-member cannot %s the owner's %s (got %s)"
                % (who, what, rows and rows[0][0]), rows is not None and rows[0][0] == 0, (rows, err))
        rows, err = as_user(c, MEMBER,
                            "select exists(select 1 from public.day_private where user_id = %s and why is not null)",
                            (OWNER,))
        chk("S6.19 · and cannot ask whether a why EXISTS", rows is not None and rows[0][0] is False, (rows, err))
        with c.cursor() as cur:
            cur.execute("select pg_get_function_result(p.oid) from pg_proc p "
                        "join pg_namespace n on n.oid = p.pronamespace "
                        "where n.nspname='public' and p.proname='ht29_member_day'")
            shape = (cur.fetchone() or [""])[0] or ""
        leaks = [col for col in ("why", "brain_dump", "tasks", "prayer", "predict") if col in shape]
        chk("S6.19 · ht29_member_day's RESULT TYPE cannot carry a journal column - not one of five",
            shape and not leaks, [leaks, shape[:120]])

        print("AGAIN · a second run changes nothing")
        run_script(c, migration)
        chk("S4 · second run: the policy set is identical",
            policies(c, ("day_private", "profile_private", "habits", "days", "profiles", "circles",
                         "circle_members", "push_subscriptions", "nudge_prefs")) == after_first)
        with c.cursor() as cur:
            cur.execute("select count(*) from public.ht29_policy_backup")
            chk("S4 · second run: the backup still holds only the original policies", cur.fetchone()[0] == len(before))

        print("REVERSE · the one-line rating revoke")
        run_script(c, "revoke execute on function public.ht29_circle_ratings(date, date) from authenticated;")
        rows, err = as_user(c, MEMBER, "select * from public.ht29_circle_ratings(%s, %s)", (TODAY, TODAY))
        chk("Ruling 4 · after the revoke the rating number is refused", err is not None, (rows, err))

        print("UNDO · 2026-09-15_ht29_rollback.sql")
        run_script(c, rollback)
        chk("S4 · rollback restores the three tables' policies exactly", policies(c) == before, (policies(c), before))
        run_script(c, rollback)
        chk("S4 · rollback twice is safe", policies(c) == before)
        with c.cursor() as cur:
            cur.execute("select count(*) from pg_proc where proname like 'ht29\\_%%'")
            chk("S4 · rollback removes every ht29 function", cur.fetchone()[0] == 0)
            cur.execute("select section from public.habits where name = 'Lights out'")
            chk("S4 · rollback keeps people's placements (habits.section)", cur.fetchone()[0] == "night")
        rows, _ = as_user(c, OWNER, "select user_id from public.circle_members where circle_id = %s", (circle,))
        chk("S4 · rollback brings the old circle_members behaviour back", rows is not None and [str(r[0]) for r in rows] == [OWNER], rows)

        # THE GUARD ITSELF, exercised. The migration adds only a co-member SELECT policy to days / profiles /
        # circles / circle_members, so it refuses to switch row level security ON for a table that had it off -
        # doing that would turn their owners' own writes into silent 0-row statements. Proven, not asserted in
        # a comment: with RLS off on `days` the whole file must raise, by name, and leave the database alone.
        print("GUARD · the migration refuses a table whose RLS is off")
        run_script(c, "alter table public.days disable row level security")
        guard_before = policies(c, ("day_private", "profile_private", "habits", "days", "profiles", "circles",
                                    "circle_members"))
        raised = ""
        try:
            with c.cursor() as cur:
                cur.execute(migration)
                while cur.nextset():
                    pass
        except Exception as e:                       # noqa: BLE001 - the message IS the assertion
            raised = str(e)
        c.rollback()
        chk("S4 · with RLS off on days, the migration REFUSES and names the table",
            "row level security is OFF" in raised and "days" in raised, raised[:140] or "IT RAN")
        chk("S4 · ...and the refusal changed nothing",
            policies(c, ("day_private", "profile_private", "habits", "days", "profiles", "circles",
                         "circle_members")) == guard_before)
        with c.cursor() as cur:
            cur.execute("select relrowsecurity from pg_class where relname = 'days'")
            chk("S4 · ...and it did not leave RLS switched on behind it", cur.fetchone()[0] is False)
        run_script(c, "alter table public.days enable row level security")

    bad = [n for ok, n in RES if not ok]
    # the VERDICT token is printed HERE and nowhere else, so it can only appear after a complete run
    print("\nPRIVACY PG (%s): %d/%d PASS, %d FAIL · VERDICT: %s"
          % (a.variant, len(RES) - len(bad), len(RES), len(bad), "FAIL" if bad else "PASS"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
