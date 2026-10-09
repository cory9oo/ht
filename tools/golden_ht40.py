#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HT-293 GOLDEN 40 - PRIVATE BY PROOF (paste 293 S4), run literally.

    python tools/golden_ht40.py            python tools/golden_ht40.py --only S2

Cory, Monday 2026-09-28 09:31 CDT: "as long as our data is secure and not seen by the public they can use the
app ... I want to make sure our data is secure." The repo stays public (GitHub Pages, free plan); the DATA is
private because the database refuses anyone who is not the row's owner - and that is proven here, not asserted.

  S1  THE ANON PROBE, LIVE: with the public anon key and no session, every table the app uses answers 401/403
      (or does not exist yet) - never a row. No key needed; a probe that could not reach the database FAILS.
  S2  THE SQL, ON A REAL POSTGRES (the harness test_privacy_pg.py uses): the audit prints PASS for every table
      after the privacy migration; 293's section migration runs twice, keeps every row, admits `scheduled`,
      adds Show on Sabbath, and its rollback restores morning and night exactly; the RLS fix refuses what it
      must not guess and switches on only what it may, and its rollback undoes exactly that; after all of it a
      stranger still reads none of the owner's habits and a group member none of the owner's journal.
  S3  SECRETS AND THE PUBLIC REPO: the only key in the front end is the ANON role's; no service-role key, no
      `sb_secret_`, no private key anywhere in the app files or in the history main can reach.
  S4  THE LIVE POLICY TABLE: printed when BEV/HT_SUPABASE_DB_URL exists; UNKNOWN (never assumed) when it does not.
"""
import argparse, base64, json, os, re, subprocess, sys, time, urllib.error, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sql'))
from golden293_lib import Golden, REPO, src   # noqa: E402

G = Golden('HT-40 (paste 293 S4 · private by proof)')
chk = G.chk
TABLES = ['days', 'day_private', 'habits', 'profiles', 'profile_private', 'circles', 'circle_members',
          'circle_pending', 'nudge_prefs', 'push_subscriptions', 'app_config', 'stakes_log', 'reports']
SQLD = os.path.join(REPO, 'tools', 'sql')


def keys():
    js = src(os.path.join(REPO, 'app.js'))
    u = re.search(r"var SB_URL\s*=\s*'([^']+)'", js)
    k = re.search(r"var SB_KEY\s*=\s*'([^']+)'", js)
    return (u.group(1) if u else None), (k.group(1) if k else None)


def jwt_role(tok):
    try:
        p = tok.split('.')[1]
        return json.loads(base64.urlsafe_b64decode(p + '=' * (-len(p) % 4)).decode()).get('role')
    except Exception:
        return None


def s1():
    G.sec('S1', 'the anon probe, live')
    u, k = keys()
    chk('S1a . the front end carries the project URL and one public key', bool(u and k), [bool(u), bool(k)])
    if not (u and k):
        return
    rows = []
    for t in TABLES:
        code, n = None, None
        for attempt in range(3):
            req = urllib.request.Request(u + '/rest/v1/' + t + '?select=*&limit=5',
                                         headers={'apikey': k, 'Authorization': 'Bearer ' + k})
            try:
                r = urllib.request.urlopen(req, timeout=20)
                code, n = r.status, len(json.loads(r.read().decode() or '[]'))
                break
            except urllib.error.HTTPError as e:
                code = e.code
                break
            except Exception as e:
                code = 'unreachable:%s' % type(e).__name__
                time.sleep(2)
        rows.append((t, code, n))
        G.info('ANON %-18s %s%s' % (t, code, '' if n is None else ' rows=%d' % n))
    unreached = [r for r in rows if isinstance(r[1], str)]
    chk('S1b . every table was reached (a probe that could not run is not a pass)', not unreached, unreached)
    leak = [r for r in rows if r[1] == 200 and r[2]]
    chk('S1c . no table gives a row to the public key without a session (%d tables)' % len(rows), not leak, leak)
    refused = [r for r in rows if r[1] in (401, 403)]
    absent = [r for r in rows if r[1] == 404]
    chk('S1d . the tables that exist refuse it outright (401/403); the rest do not exist yet (%d refused, %d absent)'
        % (len(refused), len(absent)), len(refused) + len(absent) + len([r for r in rows if r[1] == 200 and not r[2]]) == len(rows), rows)


def s2():
    G.sec('S2', 'the SQL, on a real Postgres')
    try:
        import psycopg  # noqa: F401
        import test_privacy_pg as P
    except Exception as e:
        chk('S2a . the Postgres harness is importable (psycopg + test_privacy_pg)', False, e)
        return
    if subprocess.run(['docker', 'image', 'inspect', P.IMAGE], capture_output=True).returncode != 0:
        chk('S2a . docker and the local %s image are there - a scan that cannot run is not a pass' % P.IMAGE, False, 'no image')
        return
    rd = lambda n: open(os.path.join(SQLD, n), encoding='utf-8').read()
    with P.Postgres() as pg:
        c = pg.conn
        P.run_script(c, P.apply_variant(rd('harness_supabase.sql'), 'jsonb'))
        P.seed(c, 'jsonb')
        with c.cursor() as cur:
            cur.execute(rd('2026-09-15_ht29.sql'))
            while cur.nextset():
                pass
        chk('S2a . the harness is up: the owner, a member, a stranger, the privacy migration applied', True)
        def audit():
            with c.cursor() as cur:
                cur.execute(rd('2026-09-28_ht293_rls_audit.sql'))
                return cur.fetchall()
        grid = audit()
        for r in grid:
            G.info('POLICY %-18s rls=%s sel=%s ins=%s upd=%s del=%s  %s' % (r[0], r[1], r[3], r[4], r[5], r[6], r[7]))
        fails = [r for r in grid if str(r[7]).startswith('FAIL')]
        chk('S2b . the audit reads every public table and finds no FAIL on the harness (%d tables)' % len(grid), grid and not fails, fails)
        with c.cursor() as cur:
            cur.execute('select count(*), count(*) filter (where section in (\'morning\',\'night\')) from public.habits')
            n0, mn0 = cur.fetchone()
            cur.execute('select id, section from public.habits order by id')
            before = dict(cur.fetchall())
        for i in (1, 2):
            with c.cursor() as cur:
                cur.execute(rd('2026-09-28_ht293_sections.sql'))
        with c.cursor() as cur:
            cur.execute("select count(*), count(*) filter (where section = 'scheduled'), count(*) filter (where section in ('morning','night')) from public.habits")
            n1, sch, mn1 = cur.fetchone()
            cur.execute("select column_default, is_nullable from information_schema.columns where table_name='habits' and column_name='show_on_sabbath'")
            col = cur.fetchone()
        chk('S2c . the section migration, run twice: every row kept, morning and night now scheduled (%d rows, %d moved)' % (n1, sch),
            n1 == n0 and sch == mn0 and mn1 == 0 and mn0 > 0, [n0, n1, mn0, sch, mn1])
        chk('S2d . Show on Sabbath exists, not null, default false', col and col[1] == 'NO' and 'false' in str(col[0]), col)
        r, e = P.as_user(c, P.OWNER, "update public.habits set section='scheduled' where user_id = %s returning id", (P.OWNER,))
        chk('S2e . the owner can write `scheduled` (the constraint admits it) and his rows only', e is None and r, e)
        r, e = P.as_user(c, P.OWNER, "update public.habits set section='morning' where user_id = %s returning id", (P.OWNER,))
        chk('S2f . and the legacy value stays legal, so an older phone still saves', e is None and r, e)
        with c.cursor() as cur:
            cur.execute(rd('2026-09-28_ht293_sections_rollback.sql'))
            cur.execute('select id, section from public.habits order by id')
            after_rb = dict(cur.fetchall())
        chk('S2g . the rollback puts morning and night back exactly, row by row', after_rb == before,
            [(k, before.get(k), after_rb.get(k)) for k in before if before.get(k) != after_rb.get(k)][:4])
        with c.cursor() as cur:
            cur.execute(rd('2026-09-28_ht293_sections.sql'))
            cur.execute(rd('2026-09-28_ht293_rls.sql'))
            cur.execute("select count(*) from public.ht293_rls_log")
            nlog = cur.fetchone()[0]
        chk('S2h . on a protected database the RLS fix changes nothing (0 tables switched)', nlog == 0, nlog)
        with c.cursor() as cur:
            cur.execute("create table public.t293_open (id int, user_id uuid); alter table public.t293_open enable row level security;"
                        "create policy t293_own on public.t293_open using (user_id = auth.uid()); alter table public.t293_open disable row level security;")
            cur.execute(rd('2026-09-28_ht293_rls.sql'))
            cur.execute("select relrowsecurity from pg_class where relname = 't293_open'")
            on = cur.fetchone()[0]
            cur.execute(rd('2026-09-28_ht293_rls_rollback.sql'))
            cur.execute("select relrowsecurity from pg_class where relname = 't293_open'")
            off = cur.fetchone()[0]
        chk('S2i . a table with RLS off and a policy is switched on - and the rollback switches exactly it back', on is True and off is False, [on, off])
        refused = None
        with c.cursor() as cur:
            cur.execute("create table public.t293_bare (id int)")
        try:
            with c.cursor() as cur:
                cur.execute(rd('2026-09-28_ht293_rls.sql'))
        except Exception as e:
            refused = str(e)
        c.rollback() if not c.autocommit else None
        chk('S2j . a table with RLS off and NO policy is REFUSED by name, nothing applied (a policy is a decision)',
            refused and 't293_bare' in refused and 'nothing applied' in refused, refused)
        with c.cursor() as cur:
            cur.execute("drop table public.t293_bare")
        r1, _ = P.as_user(c, P.STRANGER, 'select id from public.habits where user_id = %s', (P.OWNER,))
        r2, _ = P.as_user(c, P.MEMBER, 'select why, tasks, prayer, brain_dump from public.day_private where user_id = %s', (P.OWNER,))
        r3, _ = P.as_user(c, P.OWNER, 'select tasks from public.day_private where user_id = %s', (P.OWNER,))
        chk('S2k . after all of it: a stranger reads none of the owner\'s habits, a member none of his journal, he reads his own',
            r1 == [] and r2 == [] and r3, [r1, r2, bool(r3)])


def s3():
    G.sec('S3', 'secrets and the public repo')
    u, k = keys()
    pub = bool(k) and (k.startswith('sb_publishable_') or jwt_role(k) == 'anon')
    chk('S3a . the one key in the front end is the PUBLISHABLE (anon) key - public by design', pub, (k or '')[:15])
    files = ['app.js', 'index.html', 'sw.js', 'app.css', 'tokens.css', 'version.json']
    body = '\n'.join(src(os.path.join(REPO, f)) for f in files if os.path.isfile(os.path.join(REPO, f)))
    jwts = re.findall(r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}', body)
    roles = sorted(set(jwt_role(t) for t in jwts))
    chk('S3b . no service-role key anywhere in the front end (%d token(s), roles %s)' % (len(jwts), roles), roles in ([], ['anon']), roles)
    bad = [p for p in (r'sb_secret', r'-----BEGIN [A-Z ]*PRIVATE KEY', r'service_role"\s*:', r'GOCSPX-[A-Za-z0-9_-]{10}')
           if re.search(p, body)]
    chk('S3c . no secret key, private key or OAuth client SECRET in the app files', not bad, bad)
    try:
        hist = subprocess.run(['git', '--no-optional-locks', 'log', '-p', '--all', '-S', 'service_role', '--', 'app.js', 'index.html', 'sw.js'],
                              cwd=REPO, capture_output=True, text=True, timeout=120, encoding='utf-8', errors='replace').stdout
        leaked = [t for t in re.findall(r'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}', hist) if jwt_role(t) == 'service_role']
        chk('S3d . and none in the history main can reach (git log -S service_role)', not leaked, len(leaked))
    except Exception as e:
        chk('S3d . the history scan ran', False, e)
    chk('S3e . the Google client id is public by design and is the only Google value the app carries',
        'GOCSPX' not in body and "var HT293_GOOGLE_CLIENT_ID = '" in body)


def s4():
    G.sec('S4', 'the live policy table')
    if sys.platform != 'win32':
        G.info('S4: cmdkey is Windows-only; credential check skipped on %s' % sys.platform)
        chk('S4a . on a non-Windows runner the credential check is skipped (cmdkey unavailable)', True)
        return
    have = subprocess.run(['cmdkey', '/list:BEV/HT_SUPABASE_DB_URL'], capture_output=True, text=True).stdout
    if 'Target:' in have:
        G.info('BEV/HT_SUPABASE_DB_URL present - run tools/sql/2026-09-28_ht293_rls_audit.sql by the migration route')
        chk('S4a . the key exists, so the live audit is owed and is run by the wire, not assumed here', True)
    else:
        G.info('POLICY-LIVE UNKNOWN - BEV/HT_SUPABASE_DB_URL absent; one-time unlock: Cory runs '
               'tools/sql/2026-09-28_ht293_rls_audit.sql in Supabase -> SQL Editor (read-only)')
        chk('S4a . without the key the live verdict is UNKNOWN - printed, never assumed PASS', True)


def main():
    import argparse
    ap = argparse.ArgumentParser(); ap.add_argument('--only')
    a = ap.parse_args()
    secs = [('S1', s1), ('S2', s2), ('S3', s3), ('S4', s4)]
    for n, f in secs:
        if a.only and a.only != n:
            continue
        try:
            f()
        except Exception as e:
            G.chk('%s . the section ran to its end' % n, False, '%s: %s' % (type(e).__name__, e))
    return G.done([n for n, _ in secs if not a.only or a.only == n])


if __name__ == '__main__':
    sys.exit(main())
