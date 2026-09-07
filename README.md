# HT — Habit Tracker

The daily standard. Checked is done; unchecked is not.

Live: **https://cory9oo.github.io/ht/** — one app, one URL, served from this repo's root.

This repository holds the front end only. Every habit, day, rating and journal entry lives in
Postgres behind row-level security. **No personal data is in this repo.**

The publishable Supabase key is inline in `app.js` and is meant to be public — it grants nothing the
signed-in person is not already permitted to see. Privacy is enforced by database policy, not by
hiding a key. `.env` files are refused by `.gitignore` (R35.5).

## The promise the database keeps

| what | who can read it |
|---|---|
| Habit list, check marks, completion % | you, and your circle if you ever open one |
| Day rating, why, brain dump, completed, prayer | **you alone** |
| Anything at all, signed out | **nobody** |

The journal fields live in their own table, `day_private`, with a single policy: owner only, in
every direction. Not a circle owner, not a friend, not an app bug. There is no per-item share
toggle, by ruling (R47.3 STRICT / R69.6).

## Files

| | |
|---|---|
| `index.html` | the app — one page: TODAY (the inputs) and VIEWS (the outputs) |
| `app.js` | all behaviour and the data layer; honours `window.__MOCK_SB` as the test seam |
| `app.css` | layout and components |
| `theme.css` | the four skins and the one accent; the `--g0…--g5` heat ramp |
| `sw.js` | offline shell + install. Bump `const C` on every ship or installed phones keep the old shell |
| `manifest.webmanifest` | PWA identity — name "Habit Tracker", short_name "HT" |
| `splash/` | the twelve iOS launch images, so the app never flashes white |
| `v3/index.html` | a stub: the app used to live here. Unregisters the old worker, redirects up |
