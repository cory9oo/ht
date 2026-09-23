#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""schema_check.py - paste 148 NUDGE N10: EVERY COLUMN THE STACK NAMES MUST EXIST.

    python tools/sql/schema_check.py                 check ht_pending's sources against the snapshot
    python tools/sql/schema_check.py --list          print every table.column the stack references

WHY. On 2026-09-23 10:52 the one SQL act reached the live database for the first time and the database
refused it: `ERROR 42703 column "owner" does not exist` - `public.circles` has `owner_id`. The file had
been reviewed, goldened and run against a local harness for eight days, and none of that could see it,
because the harness had been written from the same wrong belief. The only thing that knows the live
schema is the live schema, so its column list is kept here as data (`schema_snapshot.json`) and every
build of ht_pending.sql is diffed against it BEFORE a byte is written.

WHAT COUNTS AS A REFERENCE (pragmatic, not a SQL parser - and the limit is written down):
  * `public.T.col`, and `alias.col` where the statement says `from|join public.T alias`
  * the bare columns of a policy's `using (...)` / `with check (...)`, subqueries removed first
  * `insert into public.T (cols)` · `create index ... on public.T (cols)`
  * the bare identifiers of `update public.T set ... where ...` and of `add constraint ... check (...)`
WHAT THE STACK ITSELF CREATES is allowed: `create table public.T (...)` and `add column [if not exists]`.
A reference inside a string, or a bare column in a SELECT with no alias, is not seen. The miss that
started this - a bare column in a policy - is exactly what IS seen, and the test pins it.

The snapshot is refreshed from the live schema by `apply_pending.py` whenever the connection key
exists (information_schema.columns, schema public), so it tracks the database, not this file's belief.
"""
import argparse, io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SNAPSHOT = os.path.join(HERE, 'schema_snapshot.json')

KEYWORDS = set('''
and or not is null true false in exists select from where join on as case when then else end
like ilike similar any all some between distinct coalesce set update delete insert into values
with check using for to authenticated service_role public auth current_date current_timestamp
now interval date text int integer boolean uuid smallint timestamptz default primary key unique
references cascade constraint if alter table add column drop create index desc asc nulls first last
lower upper trim cast array limit order by group having returning do nothing conflict excluded
extract dow epoch
'''.split())

IDENT = r'[a-z_][a-z0-9_]*'


def strip(sql):
    """Comments and string literals out; dollar-quoted BODIES stay (they are SQL we want to read)."""
    # ONE PASS, because the two orders are both wrong: strings first and an apostrophe in a comment
    # ("Cory's") opens a string that swallows real statements; comments first and `--` inside a string
    # cuts it. (The first order silently hid every policy in ht29.sql from this check.)
    out, i, n = [], 0, len(sql)
    while i < n:
        if sql.startswith('--', i):
            j = sql.find('\n', i)
            i = n if j < 0 else j
        elif sql[i] == "'":
            j = i + 1
            while j < n:
                if sql[j] == "'" and sql[j + 1:j + 2] == "'":
                    j += 2
                elif sql[j] == "'":
                    break
                else:
                    j += 1
            out.append("''")
            i = j + 1
        else:
            out.append(sql[i])
            i += 1
    return ''.join(out).lower()


def balanced(s, i):
    """s[i] == '(' -> the index just past its matching ')'."""
    d = 0
    for j in range(i, len(s)):
        if s[j] == '(':
            d += 1
        elif s[j] == ')':
            d -= 1
            if d == 0:
                return j + 1
    return len(s)


def no_subqueries(expr):
    out, i = [], 0
    while i < len(expr):
        if expr[i] == '(' and re.match(r'\(\s*select\b', expr[i:]):
            i = balanced(expr, i)
            out.append(' ')
        else:
            out.append(expr[i])
            i += 1
    return ''.join(out)


def bare(expr):
    """Identifiers that are columns of the statement's own table: not qualified, not a function name,
    not a keyword, not a number."""
    expr = no_subqueries(expr)
    found = set()
    for m in re.finditer(r'(?<![\w.$])(' + IDENT + r')(?![\w.])(?!\s*\()', expr):
        w = m.group(1)
        if w not in KEYWORDS:
            found.add(w)
    return found


def statements(sql):
    return [s for s in re.split(r';', sql) if s.strip()]


def extract(sql):
    """-> (refs {(table, col)}, created {table: set(cols)})"""
    sql = strip(sql)
    refs, created = set(), {}
    for st in statements(sql):
        m = re.search(r'create table (?:if not exists )?public\.(' + IDENT + r')\s*\(', st)
        if m:
            body = st[m.end() - 1:balanced(st, m.end() - 1)][1:-1]
            depth, item, items = 0, '', []
            for ch in body:
                depth += ch == '('
                depth -= ch == ')'
                if ch == ',' and depth == 0:
                    items.append(item); item = ''
                else:
                    item += ch
            items.append(item)
            for it in items:
                w = re.match(r'\s*(' + IDENT + ')', it)
                if w and w.group(1) not in ('primary', 'unique', 'foreign', 'constraint', 'check'):
                    created.setdefault(m.group(1), set()).add(w.group(1))
        for m in re.finditer(r'alter table (?:only )?public\.(' + IDENT + r')', st):
            for c in re.findall(r'add column (?:if not exists )?(' + IDENT + ')', st[m.end():]):
                created.setdefault(m.group(1), set()).add(c)
        # aliases in this statement
        alias = {}
        for m in re.finditer(r'(?:from|join)\s+public\.(' + IDENT + r')(?:\s+(?:as\s+)?(' + IDENT + r'))?', st):
            t, a = m.group(1), m.group(2)
            if a and a not in KEYWORDS:
                alias[a] = t
        for m in re.finditer(r'(?<![\w.])public\.(' + IDENT + r')\.(' + IDENT + r')(?!\s*\()', st):
            refs.add((m.group(1), m.group(2)))
        for m in re.finditer(r'(?<![\w.])(' + IDENT + r')\.(' + IDENT + r')(?!\s*\()', st):
            if m.group(1) in alias:
                refs.add((alias[m.group(1)], m.group(2)))
        m = re.search(r'create policy \S+ on public\.(' + IDENT + ')', st)
        if m:
            t = m.group(1)
            for k in re.finditer(r'(?:using|with check)\s*\(', st):
                p = k.end() - 1
                refs.update((t, c) for c in bare(st[p + 1:balanced(st, p) - 1]))
        for m in re.finditer(r'insert into public\.(' + IDENT + r')\s*\(([^)]*)\)', st):
            refs.update((m.group(1), c.strip()) for c in m.group(2).split(',') if c.strip())
        for m in re.finditer(r'create (?:unique )?index (?:if not exists )?\S+ on public\.(' + IDENT + r')\s*\(([^)]*)\)', st):
            for c in m.group(2).split(','):
                w = re.match(r'\s*(' + IDENT + ')', c)
                if w:
                    refs.add((m.group(1), w.group(1)))
        m = re.match(r'\s*update public\.(' + IDENT + r')\s+set\b', st)
        if m:
            refs.update((m.group(1), c) for c in bare(st[m.end():]))
        for m in re.finditer(r'alter table public\.(' + IDENT + r')\s+add constraint \S+\s+check\s*\(', st):
            p = m.end() - 1
            refs.update((m.group(1), c) for c in bare(st[p + 1:balanced(st, p) - 1]))
    return refs, created


def load_snapshot(path=SNAPSHOT):
    with io.open(path, encoding='utf-8') as f:
        return {t: set(cs) for t, cs in json.load(f)['tables'].items()}


def check(sql, snapshot):
    """-> (refs_checked, misses [(table, col, why)])"""
    refs, created = extract(sql)
    misses = []
    for t, c in sorted(refs):
        if c in created.get(t, ()):
            continue
        if t not in snapshot and t not in created:
            misses.append((t, c, 'table not in the live schema and not created by this stack'))
        elif c not in snapshot.get(t, ()):
            misses.append((t, c, 'column not in the live schema (%s has: %s)'
                           % (t, ', '.join(sorted(snapshot.get(t, ()))) or 'nothing known')))
    return sorted(refs), misses


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--list', action='store_true')
    ap.add_argument('files', nargs='*')
    a = ap.parse_args()
    sys.path.insert(0, HERE)
    files = a.files or [os.path.join(HERE, 'ht_pending.sql')]
    sql = ''.join(io.open(f, encoding='utf-8').read() for f in files)
    refs, misses = check(sql, load_snapshot())
    if a.list:
        for t, c in refs:
            print('%s.%s' % (t, c))
    for t, c, why in misses:
        print('  MISSING  %s.%s - %s' % (t, c, why))
    print('schema check %s %d/%d' % ('PASS' if not misses else 'FAIL', len(refs) - len(misses), len(refs)))
    return 1 if misses else 0


if __name__ == '__main__':
    sys.exit(main())
