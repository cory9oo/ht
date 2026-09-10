# MIGRATION_ROUTE — how a schema change gets run on this project

*HT-22 S7 · written 2026-09-10 by CC HT, from the route that actually worked on 2026-09-09 ·
R70.211 · R70.214 · CC_STANDING §3 §6*

This is not a policy. It is **the procedure that ran six columns into production on 2026-09-09**,
written down so the next one is a repeat and not a piece of luck. Two wires were lost to treating
a reversible change as an irreversible one; one was recovered by a single habit — **reading the
URL instead of the success banner.**

---

## THE TEST, BEFORE ANYTHING ELSE

Before a migration becomes a question for Cory, run the four questions:

| | |
|---|---|
| **Is it reversible?** | `add column if not exists <name> <type>` — **yes**, and `drop column` undoes it |
| **Is it a credential only he can hold?** | **no** |
| **Does it spend money?** | **no** |
| **Does it go out under his name?** | **no** |

**Four noes: it is Claude's to run.** Adding a nullable column is additive and reversible and it is
not an irreversible act. `drop table`, `alter column type`, a `not null` on an existing column, and
anything that rewrites rows are a different class and stay Cory's.

---

## THE ROUTE

```
1  Cory's own Chrome, his logged-in Supabase SQL editor, project `standard` / main
2  paste the SQL
3  ►  CONFIRM THE URL CHANGED OFF /sql/new  ◄        <- the whole procedure is this line
4  press Run
5  verify THROUGH THE APP'S OWN SESSION, never the dashboard banner
6  record the before/after column state in the receipt
```

### 3 · why the URL is the check

On **2026-09-07** a migration in this project reported success and **did nothing**. The banner said
what a run says; the editor had never taken the statement. The tell that separates the two is that
Supabase re-keys the editor URL when a query is really registered:

```
/sql/new   ->   /sql/8cd95c61-2c66-43f2-9148-65b7da51fdbe        BEFORE Run is pressed
```

**If the URL still says `/sql/new`, nothing has been submitted, whatever the page says afterwards.**
On 2026-09-09 the URL changed, Run returned `Success. No rows returned`, and all six columns landed.

### 5 · why the banner is not verification

A banner is the dashboard telling you about itself. The question is whether **the app** can see the
column, and the app has its own session, its own key and its own PostgREST cache. Verify through it:

```
BEFORE   planned_start / planned_end / notes / sleep_hours / weight_lb / tomorrow_one_thing
         = MISSING (42703, undefined_column)
AFTER    all six = OK
UNTOUCHED  time_anchor OK · minutes_planned OK · cue OK · name OK
NO DATA WRITTEN  all three new habits columns NULL across all 36 rows
```

**A shell can verify this with no credential at all**, and this is the cheapest check in the file.
PostgREST resolves a column name against the schema **before** it applies privileges, so with the
app's own publishable key:

| response | meaning |
|---|---|
| `42501` insufficient_privilege | the column **EXISTS** (the name resolved, then RLS refused) |
| `42703` undefined_column | the column **DOES NOT EXIST** |

```bash
curl -s -o /dev/null -w '%{http_code} ' \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  "$SB_URL/rest/v1/habits?select=id,planned_start&limit=1"
```

Always include a **control**: a column you know is absent (`does_not_exist_xyz`) must come back
`42703`. Without it, a uniform `42501` proves nothing about the schema — only that the role is
refused. That control is what made the 2026-09-10 verification a measurement and not a hope.

---

## WHAT IS EXPLICITLY REFUSED

**"Reset database password"** to make a connection string work. It is a security-setting change with
a blast radius across everything that talks to this database, taken for the convenience of not
opening a tab. `secrets.env` + a `migrate.py` rates **7/10** and puts a database-owner password in a
file on the laptop forever; **this route rates 8/10 and stores nothing** — no secret to leak, rotate
or place, nothing on the bus, nothing in a file, nothing in chat.

**Every future migration on this project runs the way the 2026-09-09 one did.**
