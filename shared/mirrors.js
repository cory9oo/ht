/* THE MIRROR SEAM, DECLARED ONCE (WIRE HT-32, paste 148 NUDGE N4).
 *
 * Cory, 9/22: "I'll be using Obsidian and Andrew should be using it too, but other users - onboarding
 * is going to have to be in Google Docs most likely; will we have availability in future for them,
 * one-to-one for them as well". N4's ruling: the vault wire is a MIRROR SEAM, not an Obsidian feature -
 * ONE event, N renderers. Build the seam and the contract NOW so no renderer ever needs a migration.
 *
 * WHY THIS IS A .js AND NOT A .json, beside `day_format.json` which is one.
 * `day_format.json` is read by PROGRAMS (the goldens, the copier) and asserted against app.js by hand.
 * This file has a harder job: N4 requires that "a second renderer registered by config alone appears
 * in Settings with ZERO code changes elsewhere". That means the APP must read it at run time - and a
 * page opened from `file://`, which is exactly how the headless fixture runs, cannot `fetch()` a local
 * .json. A script tag can. So it is one file, one address, two readers: the browser evaluates it, and
 * Python reads the object literal out of it (`ht_renderers.load_registry`). A second file holding the
 * same list would be the second address R70.282 exists to delete.
 *
 * THE OBJECT BELOW IS STRICT JSON ON PURPOSE - no trailing commas, no comments inside it, no string
 * line-continuations. Python parses it with `json.loads` after stripping the assignment, so anything
 * JavaScript tolerates and JSON does not would break the other reader silently. Prose goes in `_`
 * keys, which both readers carry and neither acts on.
 *
 * ADDING A RENDERER IS AN EDIT TO THIS FILE AND A MODULE. Nothing else. `tools/golden_ht32.py` S9
 * proves it by adding an entry to the FIXTURE's copy and watching Settings grow a row.
 *
 * PRIVACY. A mirror carries that person's own journal to a place that person chose. It never carries
 * anyone else's anything: the renderer is handed one member's one day and has no path to a second
 * user's row (CLAUDE.md, PRIVACY - the base tables are owner-only in every direction).
 */
window.HT_MIRRORS = {
  "version": 1,
  "setting": "mirror",
  "default": "none",
  "_default_why": "N4: `none` for everybody until a person chooses. A mirror writes a person's journal somewhere outside this app, so it is opted INTO, never defaulted on.",
  "renderers": [
    {
      "key": "none",
      "label": "Nowhere",
      "note": "your journal stays in the app",
      "module": null,
      "available": true
    },
    {
      "key": "obsidian",
      "label": "Obsidian",
      "note": "a folder on a computer that runs the sync daemon",
      "module": "obsidian",
      "available": true,
      "needs": "a computer of yours that stays on",
      "two_way": true
    },
    {
      "key": "google_doc",
      "label": "Google Docs",
      "note": "a document per month in your own Drive - no computer needed",
      "module": "google_doc",
      "available": false,
      "wall": "google oauth",
      "_wall_why": "Google requires app verification for the Docs + Drive.file scopes beyond about 100 test users: a privacy page, a demo video, weeks of review. Not needed for the first hundred people; needed before an App Store version. Until the OAuth client exists this renderer is BUILT - NOT RUN LIVE.",
      "two_way": true
    }
  ],
  "contract": {
    "_what": "Every renderer implements these four. The daemon's two ears call the contract, and nothing in the daemon names a renderer - that is the whole point of the seam.",
    "render": "render(day_record) -> text        ONE day-file format (day_format.json's), so an Obsidian file and a Doc section are byte-equal text",
    "push": "push(member, date, text) -> bool    put that text where that member chose",
    "pull": "pull(member, date) -> text or None  read it back, for the reverse direction",
    "cursor": "cursor(member) -> str or None     the last revision synced, so a reconnect replays from there rather than from a clock"
  }
};
