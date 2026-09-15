# CLAUDE.md — `ht` (HT · Habit Tracker, the self-ledger)

**Read `..\life-taxonomy\DOCTRINE_INDEX.md` before the first substantive tool call (D13.1).**
**Query first (R70.326):** run `python C:\Users\fugie\BEV\tools\query.py "<terms>"` before opening any
container note; open a note only after a query names it; never read a drawer by listing it.
This file is repo-operational law per D10 and carries the mount countermeasure per ISS-036/ISS-037.
*Since R70.345 (2026-09-10) this repo lives at `C:\Users\fugie\BEV\_machine\standard`; the relative
`..\` paths below still land in the machinery beside it.*

## THE MOUNT — do this first, every session, no exceptions

```bash
export GIT_OPTIONAL_LOCKS=0        # git status/diff must not take index.lock on a FUSE mount
git config gc.auto 0
git config maintenance.auto false
```

- **Never `git checkout .`** and never `git stash` to "clean" this tree. A clean tree here can look
  dirty — but **the cause is the executable bit, not CRLF** (diagnosed 4-HT 2026-08-31, correcting
  the estate-wide belief). The FUSE mount reports every file `100755` against an index of `100644`,
  so git prints `old mode/new mode` hunks with **zero content lines**; `git ls-files --eol` reads
  `i/lf w/lf`, i.e. the line endings were never wrong. The fix is one local setting, already applied
  here: `git config core.fileMode false` — after it, `git status --porcelain` is 0 and trustworthy
  again. Discarding a "dirty" tree without checking destroys real work.
- **Deletes are refused on the mount.** A stale `.git/*.lock` cannot be unlinked. Sweep it by
  MOVING it: `mv .git/index.lock ..\_archive\index-locks-<date>\` — never assume `rm` worked.
- **`git clone` cannot complete inside the mount** (ISS-041-proposed, found 4-HT 2026-08-31):
  clone writes `.git/config.lock` and then cannot unlink it, so `remote.origin.fetch` is never
  set and the clone dies half-made. **Clone into native VM scratch (`~/scratch`), then
  `cp -a` the finished clone into `BEV\`.** This repo was created that way.

## WHAT THIS REPO IS

GitHub Pages. **One app.** ISS-033 `TWO_WRITERS_ONE_TRUTH` was **CLOSED 2026-08-31** (WIRE HT-2,
`ad4f80b`): the legacy Apps-Script-era app was archived out of the repo and root became a
tombstone. Two apps once shared this origin, and their service workers deleted each other's cache
on every activate — **do not reintroduce a second app here.**

| Path | What |
|---|---|
| `/` (root) | **the app** — promoted from `v3/` by HT-8. Plus the three shared icons — **the root page links them as `./icon-192.png`, `./icon-512.png`, `./apple-touch-icon.png`. Removing them breaks the PWA install, and nothing on screen shows it.** |
| `/v3/` | a redirect stub only. Brand A (`Habit Tracker` · `HT`), capacity score, small default view, cue field, KPI band **dark** until GOAL MATH locks. SW cache `ht-v12`. |

The legacy source is archived at `..\_archive\2026-08-31_standard_legacy_app\` (DEC-037 — archived,
never deleted). **HT-MIGRATE-1** renames this repo to `ht` and moves the app to the root; until
then `https://cory9oo.github.io/ht/` is the live URL — the app is served from the repo ROOT (HT-8, R70.15). `v3/` holds only a redirect stub for phones installed before the move.

`STANDARD_LIVE_STATE.md` (Birds Eye View Project) is the state doc — DEC-064: state docs are NOT
mirrored into this repo. Cite it by name; never copy it here.

## THE LAW THIS APP IMPLEMENTS — do not re-litigate in code

| Ruling | Law |
|---|---|
| **DEC-055** | **No cut.** All standards stay active. Do not propose trimming the list. |
| **DEC-056** | **No tier.** `habits.tier` is a dead field — present in schema, ignored by the app. |
| **DEC-171** | **Five inputs, and TIMED is a section** — supersedes DEC-057 and DEC-058 (2026-09-10, Cory's 117 words and his 15:15 ruling). The day takes exactly five inputs: check-offs · the 1–10 rating with its why · the brain dump · completed · prayer — and **no new input of any kind**. Sleep, bed, wake, the Saturday weight and tomorrow's one thing sit behind `FIVE_INPUTS_ONLY` in `app.js` (hidden, never removed — R70.138): nothing probes, reads, writes or renders their columns, and `golden_ht26` S1 fails the moment a sixth input renders. Timed standards group under **TIMED, then ANYTIME, then WEEKLY**; lateness is a label and never moves a score (`golden_ht25` S3). |
| **DEC-172** | **Sabbath scoring** (2026-09-15, Cory's 9/10 20:30 pre-approval, PASTE 128 F20): the Sabbath is `dow:6` — on Saturday one ordinary due item, weight 1, no boost, no cap; on every other day not rendered, not in `active_set`, not in the denominator. Honoured by "Sabbaths kept · N in a row · M of the last 12" and the month chart's Saturday rings. Saturday's weight moves only through a standard's "Rests on Sabbath" switch (`golden_ht28` E/F). |
| **DEC-173** | **Rest standards are ordinary standards** — kept like any rule, never scored higher. They reach a list the way any standard can: typed in, or proposed by an add-link (`#add=<base64url JSON>` — a fragment, never sent to a server: a card, one tap, idempotent by name). **No person's standards are ever written into this public code** — a list is private (R47.3); the link carries them. |
| ~~DEC-057~~ | SUPERSEDED by DEC-171 — it said never group or order the list by clock. Do not re-apply it. |
| ~~DEC-058~~ | SUPERSEDED by DEC-171 — it said three inputs. Do not re-apply it. |
| **DEC-059** | Percentage renders as a continuous density ramp of the accent. Grade letters yes; grade colours no. |
| **DEC-060** | `<meta name="darkreader-lock">` ships permanently. Removing it silently re-breaks desktop. |
| **DEC-061** | **One commit per change**, via Composio, md5-verified per chunk. Two commits seconds apart cancel a running Pages deploy. |
| **DEC-062** | On aesthetic work: render OPTIONS, Cory picks. Never iterate on a guess. |
| **DEC-042** | Cowork stages into `BEV\_reconcile\`; **only this clone commits.** |
| **DEC-037** | Archive, never delete. |

`saveDay()` writes `active_set` on every save (P4 closed) — past grades must never be repriced by a
later list change. Do not remove that write.

**SYNC (HT-28c) — a device writes only what it changed.** Every check-off and journal field is recorded
as an op against the server's copy of that day. Check-offs are one JSONB column, so `mergeDay` reads the
server's row, lays the ops over its map and writes the map; journal fields are written ONE COLUMN AT A TIME
(`writePrivFields`, a partial upsert), so another device's field is never in the payload, and a save takes
in nothing it did not send. A save with no op writes nothing; **a device whose load failed writes and
replays nothing until it has reloaded** (`S.loadOk`). When both devices changed the same key the later write
wins and the replaced value goes to this account's on-device ring `ht28_sync_lost_<id>` (cleared at sign-out,
with the queue `ht28_sync_q_<id>`). The pull runs every 30 s while the page is visible and never while it is
hidden (PHASE GATE). **Never add a write of a whole `days`/`day_private` row that goes around those
wrappers** — that is exactly how a stale desktop blanked a phone's journal. `golden_ht28` C (R1–R9) holds all
of it. `load()` sets `S.loadOk` — false on any network-shaped probe error too; nothing may offer to create
rows unless it is `true` (a failed load looks exactly like an empty account).

## DEPLOY

**Two surfaces, two truths — say which one you are (R46.1).**

- **This clone, on the laptop, natively: `git push` WORKS.** HT-2, HT-3 and HT-4 all pushed here,
  rc=0. It is the writer (DEC-042) and the normal route.
- **The cloud container cannot push this repo.** `GITHUB_TOKEN` is present and `api.github.com`
  answers 200, but repo access is not enabled for that session and no `add_repo` tool exists. From
  there — and only from there — the route is Composio, one commit:
blob × n → tree (with `base_tree`) → commit → update-ref, then poll live `app.js` md5 until it
matches. Full procedure in `STANDARD_LIVE_STATE.md` § DEPLOY PROCEDURE. Substitute `__URL__` /
`__KEY__` inside the sandbox so the Supabase key never enters a context window.

## PRIVACY — R47.3, and it is structural, not a setting

A circle sees **adherence-class data only**: completion %, streaks, capacity band. **Journals
(`why` · `tasks` · `prayer`) and day-ratings are never visible to anyone but their author.** Not
permission-gated — *unshareable*: there must be no schema path from another user's id to those
fields. The standards LIST is not shareable either: when people know their list is watched they set
fewer and safer standards, which cancels the whole point of the circle.

Exactly one query SHAPE crosses users — `days.select('user_id,date,pct')` — at two call sites:
`paintCircle()` and the DETAIL page's `circleMembers()` (the second spans two lines, which is why
`golden_ht28` G22 reads the source across lines and asserts both). Keep it that way. The statement the
app shows on the sign-in screen, the first-run card and in Settings is verbatim: "Your journal is yours.
The app never shows it to anyone else — including Cory." Never write that the database owner cannot see
rows — they can; end-to-end encryption is the later option that would make it true. (HT-26's Insights compare reads `S.circleView`, which `paintCircle()` fills from that same
query — completion % only; `golden_ht26` S2k fails if a second cross-user select appears.) **`_reconcile/ht_batch5/privacy_check.py` enforces this mechanically and must pass in
every HT wire**; it fails loud on an unscoped `day_private` read, a cross-user `habits` read, or any
cross-user column outside `{user_id,date,pct}`.

CIRCLE-1 (Andrew · Dale · Justin) is **chartered, not built** — it opens on Cory's word only.

## PHASE GATE

**No reminders, no keep-alive, no automated pulls before Phase D** (DEC-068 sequencing). The
reminder item is deliberately parked, not forgotten.
