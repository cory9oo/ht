#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""test_schema_check.py - paste 148 N10: the class that reached the live database cannot recur.

Red first: each case below re-introduces a defect and asserts the check REFUSES it by name.
Prints one PASS/FAIL line per assertion and the count; exit 1 on any FAIL or on zero assertions.
"""
import io, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import schema_check as sc

ORDER = ['2026-09-15_ht29.sql', '2026-09-20_ht30.sql', '2026-09-22_ht31.sql', '2026-09-23_ht32.sql']
STACK = ''.join(io.open(os.path.join(HERE, n), encoding='utf-8').read() for n in ORDER)
SNAP = sc.load_snapshot()
n_pass = n_fail = 0


def chk(name, ok, detail=''):
    global n_pass, n_fail
    if ok:
        n_pass += 1
        print('  PASS   %s' % name)
    else:
        n_fail += 1
        print('  FAIL   %s · %s' % (name, str(detail)[:200]))


def misses(sql):
    return [(t, c) for t, c, _ in sc.check(sql, SNAP)[1]]


refs, m = sc.check(STACK, SNAP)
chk('N10a · the stack as it stands passes', not m, m)
chk('N10b · the check actually reads the stack (>= 40 references)', len(refs) >= 40, len(refs))

typo = STACK.replace('using (owner_id = auth.uid() or public.ht29_in_circle(id))',
                     'using (owner = auth.uid() or public.ht29_in_circle(id))')
chk('N10c · fixture: the 10:52 typo is re-introduced', typo != STACK)
chk('N10d · ... and refused, naming circles.owner', ('circles', 'owner') in misses(typo), misses(typo))

chk('N10e · a policy on an unknown column is refused',
    ('habits', 'colour') in misses(STACK + "\ncreate policy x on public.habits for select using (colour = 'red');\n"))
chk('N10f · an insert into an unknown column is refused',
    ('days', 'mood') in misses(STACK + '\ninsert into public.days (user_id, mood) values (null, 1);\n'))
chk('N10g · an alias-qualified unknown column is refused',
    ('circle_members', 'role') in misses(STACK + '\nselect 1 from public.circle_members m where m.role = 1;\n'))
chk('N10h · a column the stack ADDS is allowed',
    not misses(STACK + '\nalter table public.days add column if not exists mood int;\n'
                       'insert into public.days (user_id, mood) values (null, 1);\n'))
chk('N10i · an unknown table is refused',
    ('nowhere', 'x') in misses(STACK + '\ninsert into public.nowhere (x) values (1);\n'))
# the tokenizer defect found while building this: an apostrophe in a comment swallowed ht29's policies
chk('N10j · an apostrophe in a comment does not hide the statements after it',
    ('habits', 'colour') in misses("-- Cory's note\ncreate policy x on public.habits for select using (colour = 1);\n"))
chk('N10k · `--` inside a string does not cut the statement',
    ('habits', 'colour') in misses("update public.habits set name = 'a--b' where colour = 1;\n"))

# the builder itself refuses (subprocess against a copy, so the real files are never touched)
import shutil, tempfile
tmp = tempfile.mkdtemp(prefix='ht_schema_')
for f in ORDER + ['build_pending.py', 'schema_check.py', 'schema_snapshot.json', '2026-09-15_ht29_rollback.sql']:
    shutil.copy(os.path.join(HERE, f), tmp)
p = os.path.join(tmp, ORDER[0])
src = io.open(p, encoding='utf-8').read()          # read BEFORE opening for write: 'w' truncates first
io.open(p, 'w', encoding='utf-8', newline='\n').write(src.replace('using (owner_id = auth.uid()', 'using (owner = auth.uid()'))
r = subprocess.run([sys.executable, os.path.join(tmp, 'build_pending.py')], capture_output=True, text=True)
chk('N10l · build_pending REFUSES the typo (exit 2)', r.returncode == 2, (r.returncode, r.stdout[-200:]))
chk('N10m · ... names the column', 'circles.owner' in r.stdout, r.stdout[-200:])
chk('N10n · ... and wrote nothing', not os.path.exists(os.path.join(tmp, 'ht_pending.sql')))
r = subprocess.run([sys.executable, os.path.join(HERE, 'build_pending.py'), '--check'], capture_output=True, text=True)
chk('N10o · the committed ht_pending.sql is current and schema-clean', r.returncode == 0, r.stdout[-300:])
shutil.rmtree(tmp, ignore_errors=True)

# the same class in the CLIENT: app.js wrote `owner:` into circles, which fails live for a new group
import re
app = io.open(os.path.join(HERE, '..', '..', 'app.js'), encoding='utf-8').read()
ins = re.findall(r"from\('circles'\)\.insert\(\{([^}]*)\}", app)
chk('N10p · every circles insert in app.js names only live columns', ins and all(
    set(k.strip().split(':')[0] for k in i.split(',')) <= SNAP['circles'] for i in ins), ins)
chk('N10q · the starter check reads circles.owner_id, and the loads fetch it',
    'circle.owner_id' in app and 'circle.owner ' not in app and 'circle.owner|' not in app
    and "select('id,name,join_code,owner_id')" in app)

print('%d pass, %d fail' % (n_pass, n_fail))
sys.exit(1 if n_fail or not n_pass else 0)
